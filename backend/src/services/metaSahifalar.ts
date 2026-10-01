/* ═══════════════════════════════════════════════════════════════════════
   META SAHIFALARI VA LEADGEN WEBHOOK — Lead Ads'ni "bitta tugma" bilan

   ILGARI. Lead ID → reklama uchun mijoz System User tokenini qo'lda
   kiritardi (037_lead_ads_token). 6–8 qadam, ko'pchilik to'xtardi.

   HOZIR. "Connect Facebook" ruxsat oynasida mijoz sahifalarini tanlaydi.
   Login konfiguratsiyasidagi ruxsatlar:
     leads_retrieval        — lid ma'lumotini o'qish
     pages_show_list        — sahifalar ro'yxati (/me/accounts)
     pages_read_engagement  — leads_retrieval'ning talabi
     pages_manage_ads       — leads_retrieval'ning talabi
     pages_manage_metadata  — sahifani leadgen webhook'iga obuna qilish
     ads_management         — Meta leadgen webhook hujjatida talab qilingan
   (Manba: developers.facebook.com/docs/permissions va
    .../webhooks/getting-started/webhooks-for-leadgen, 2026-10-01.)

   Ikki yo'l bilan ishlaydi:
     1) SO'ROV — CRM lidida Lead ID bor → sahifa tokeni bilan
        GET /{lead_id}?fields=ad_id → reklama. (metaLeadAds.ts)
     2) WEBHOOK — Meta lid tushishi bilan bizga yuboradi (leadgen).
        Biz ad_id ni va telefon/email HASH'ini `fb_lead_ads` ga yozamiz.
        CRM integratsiyasi Lead ID'ni umuman yozmasa ham, lid telefon
        hash'i orqali reklamaga bog'lanadi (attributionEngine).

   ⚠ XOM PII SAQLANMAYDI. field_data dan faqat telefon va email olinadi,
   darhol SHA-256 qilinadi; ism va boshqa javoblar o'qilmaydi ham.
   ⚠ Tokenlar shifrlangan holda saqlanadi va log'ga tushmaydi (§4.1–4.2).
   ═══════════════════════════════════════════════════════════════════════ */

import axios from 'axios';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { GRAPH_URL as GRAPH } from '../config/graph';
import { encrypt, decrypt } from '../utils/encryption';
import { hashPhone, hashEmail } from './amocrmService';
import { xatoSababi } from './metaLeadAds';

/* ───────────────────────────── sxema ───────────────────────────── */

let sxemaTayyor: Promise<void> | null = null;

/**
 * 041_meta_sahifalar.sql ni faqat YETISHMASA qo'llaydi.
 *
 * Production'da migratsiya qo'lda ishga tushirilmasligi mumkin
 * (amocrmPublic.ts dagi naqsh). Jadval yo'q bo'lsa birinchi chaqiruv
 * uni yaratadi; xato bo'lsa keyingi chaqiruv qayta urinadi.
 */
export function metaSxemasiniTaminla(): Promise<void> {
  if (!sxemaTayyor) {
    sxemaTayyor = (async () => {
      const { rows } = await pool.query<{ tbl: boolean; col: boolean }>(
        `SELECT to_regclass('fb_pages') IS NOT NULL AS tbl,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = current_schema()
                           AND table_name = 'fb_lead_ads'
                           AND column_name = 'phone_hash') AS col`
      );
      if (rows[0]?.tbl && rows[0]?.col) return;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query(`
          CREATE TABLE IF NOT EXISTS fb_pages (
            user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            page_id        TEXT NOT NULL,
            nom            TEXT,
            page_token     TEXT NOT NULL,
            leadgen_obuna  BOOLEAN NOT NULL DEFAULT false,
            obuna_xato     TEXT,
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, page_id)
          )`);
        await client.query(`CREATE INDEX IF NOT EXISTS fb_pages_page ON fb_pages (page_id)`);
        await client.query(`
          ALTER TABLE fb_lead_ads
            ADD COLUMN IF NOT EXISTS fb_page_id  TEXT,
            ADD COLUMN IF NOT EXISTS phone_hash  TEXT,
            ADD COLUMN IF NOT EXISTS email_hash  TEXT,
            ADD COLUMN IF NOT EXISTS lid_vaqti   TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS manba       TEXT`);
        await client.query(
          `CREATE INDEX IF NOT EXISTS fb_lead_ads_phone
             ON fb_lead_ads (workspace_id, phone_hash) WHERE phone_hash IS NOT NULL`
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS fb_lead_ads_email
             ON fb_lead_ads (workspace_id, email_hash) WHERE email_hash IS NOT NULL`
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    })().catch((err) => {
      sxemaTayyor = null; // keyingi chaqiruv qayta urinsin
      throw err;
    });
  }
  return sxemaTayyor;
}

/* ───────────────────────── toza funksiyalar ───────────────────────── */

/**
 * `X-Hub-Signature-256: sha256=<hex>` ni tekshiradi.
 * Meta xom tanani FB_APP_SECRET bilan HMAC-SHA256 qiladi.
 * Vaqtga chidamli taqqoslash (timingSafeEqual).
 */
export function imzoTogrimi(
  xomTana: Buffer | string | undefined,
  sarlavha: string | undefined,
  sir: string | undefined
): boolean {
  if (!xomTana || !sarlavha || !sir) return false;
  const m = /^sha256=([a-f0-9]{64})$/i.exec(sarlavha.trim());
  if (!m) return false;
  const kutilgan = crypto.createHmac('sha256', sir).update(xomTana).digest();
  const kelgan = Buffer.from(m[1], 'hex');
  return kelgan.length === kutilgan.length && crypto.timingSafeEqual(kelgan, kutilgan);
}

export interface LeadgenHodisa {
  leadgenId: string;
  pageId: string;
  adId: string | null;
  formId: string | null;
  vaqt: Date | null;
}

/** Webhook tanasidan leadgen hodisalarini ajratadi. Begona maydonlar o'tkazib yuboriladi. */
export function leadgenHodisalari(tana: unknown): LeadgenHodisa[] {
  const b = tana as {
    object?: string;
    entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: Record<string, unknown> }> }>;
  };
  if (b?.object !== 'page' || !Array.isArray(b.entry)) return [];
  const son = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return /^\d+$/.test(s) ? s : null;
  };
  const natija: LeadgenHodisa[] = [];
  for (const e of b.entry) {
    for (const c of e.changes ?? []) {
      if (c.field !== 'leadgen' || !c.value) continue;
      const v = c.value;
      const leadgenId = son(v.leadgen_id);
      const pageId = son(v.page_id) ?? son(e.id);
      if (!leadgenId || !pageId) continue;
      const t = Number(v.created_time);
      natija.push({
        leadgenId,
        pageId,
        adId: son(v.ad_id),
        formId: son(v.form_id),
        vaqt: Number.isFinite(t) && t > 0 ? new Date(t * 1000) : null,
      });
    }
  }
  return natija;
}

/**
 * Lid formasidagi javoblardan telefon va email'ni topadi.
 * Maydon nomi formaga qarab o'zgaradi (phone_number, PHONE, telefon...),
 * shuning uchun nom bo'yicha emas, avval standart nom, keyin qiymat
 * shakli bo'yicha qidiriladi. Boshqa maydonlar O'QILMAYDI.
 */
export function aloqaniAjrat(
  fieldData: Array<{ name?: string; values?: unknown[] }> | undefined
): { telefon: string | null; email: string | null } {
  let telefon: string | null = null;
  let email: string | null = null;
  for (const f of fieldData ?? []) {
    const nom = String(f.name ?? '').toLowerCase();
    const q = String(f.values?.[0] ?? '').trim();
    if (!q) continue;
    if (!email && (nom === 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q))) {
      if (q.includes('@')) email = q;
      continue;
    }
    if (!telefon && (nom === 'phone_number' || nom.includes('phone') || nom.includes('telefon'))) {
      telefon = q;
    }
  }
  return { telefon, email };
}

/* ───────────────────────── sahifalar ───────────────────────── */

export interface Sahifa {
  id: string;
  nom: string | null;
  leadgenObuna: boolean;
  xato: string | null;
}

async function graphOl<T>(url: string, params: Record<string, string | number>): Promise<T> {
  const r = await axios.get(url, { params, timeout: 15000 });
  return r.data as T;
}

/** Foydalanuvchi boshqaradigan sahifalar va ularning tokenlari (≤300 ta). */
async function meAccounts(
  userToken: string
): Promise<Array<{ id: string; name?: string; access_token?: string; tasks?: string[] }>> {
  const hammasi: Array<{ id: string; name?: string; access_token?: string; tasks?: string[] }> = [];
  let url: string | null = `${GRAPH}/me/accounts`;
  let params: Record<string, string | number> = {
    fields: 'id,name,access_token,tasks',
    limit: 100,
    access_token: userToken,
  };
  for (let i = 0; i < 3 && url; i++) {
    const d: { data?: typeof hammasi; paging?: { next?: string } } = await graphOl(url, params);
    hammasi.push(...(d.data ?? []));
    url = d.paging?.next ?? null;
    params = {}; // `next` URL ichida hamma parametr bor
  }
  return hammasi;
}

/** Sahifani ilovamizning leadgen webhook'iga obuna qiladi. Meta'ga YOZADI (sahifa sozlamasi). */
async function leadgenObunaQil(pageId: string, pageToken: string): Promise<void> {
  await axios.post(`${GRAPH}/${pageId}/subscribed_apps`, null, {
    params: { subscribed_fields: 'leadgen', access_token: pageToken },
    timeout: 15000,
  });
}

/**
 * Facebook ulangach chaqiriladi: sahifa tokenlarini yangilaydi va
 * leadgen obunasini o'rnatadi.
 *
 * FAIL-SOFT: Lead Ads ruxsatlari berilmagan bo'lsa (eski konfiguratsiya
 * yoki mijoz sahifa tanlamagan) — bo'sh ro'yxat, Facebook ulanishi
 * buzilmaydi.
 */
export async function sahifalarniYangila(userId: string, userToken: string): Promise<Sahifa[]> {
  await metaSxemasiniTaminla();

  let sahifalar: Awaited<ReturnType<typeof meAccounts>>;
  try {
    sahifalar = await meAccounts(userToken);
  } catch (err) {
    console.warn('meta: /me/accounts o\'qilmadi —', xatoSababi(err));
    return [];
  }

  const tokenli = sahifalar.filter((x) => x.access_token);
  const korildi = tokenli.map((x) => x.id);

  /* Obuna PARALLEL, 5 tadan: agentlikda 100+ sahifa bo'lishi mumkin va
     ketma-ket 100 ta POST callback'ni o'nlab soniya ushlab turardi. */
  const obuna = new Map<string, string | null>(); // page_id -> xato (null = ok)
  for (let i = 0; i < tokenli.length; i += 5) {
    await Promise.all(
      tokenli.slice(i, i + 5).map(async (x) => {
        try {
          await leadgenObunaQil(x.id, x.access_token as string);
          obuna.set(x.id, null);
        } catch (err) {
          obuna.set(x.id, xatoSababi(err));
        }
      })
    );
  }

  const natija: Sahifa[] = [];
  for (const x of tokenli) {
    const xato = obuna.get(x.id) ?? null;
    await pool.query(
      `INSERT INTO fb_pages (user_id, page_id, nom, page_token, leadgen_obuna, obuna_xato, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id, page_id)
       DO UPDATE SET nom = EXCLUDED.nom, page_token = EXCLUDED.page_token,
                     leadgen_obuna = EXCLUDED.leadgen_obuna, obuna_xato = EXCLUDED.obuna_xato,
                     updated_at = now()`,
      [userId, x.id, x.name ?? null, encrypt(x.access_token as string), xato === null, xato]
    );
    natija.push({ id: x.id, nom: x.name ?? null, leadgenObuna: xato === null, xato });
  }

  /* Sahifalar ulangach — oldin "ruxsat yo'q" bilan keshlangan Lead ID
     xatolarini tozalaymiz, aks holda ular keshdan abadiy xato qaytaradi. */
  if (natija.length) {
    await pool.query(
      `DELETE FROM fb_lead_ads
        WHERE holat = 'error'
          AND workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1)`,
      [userId]
    );
  }

  // Ruxsat olib tashlangan sahifalar — tokeni ham o'chiriladi.
  await pool.query(
    `DELETE FROM fb_pages WHERE user_id = $1 AND NOT (page_id = ANY($2::text[]))`,
    [userId, korildi]
  );
  return natija;
}

/** Workspace egasining sahifalari (tokensiz). */
export async function workspaceSahifalari(workspaceId: string): Promise<Sahifa[]> {
  await metaSxemasiniTaminla();
  const { rows } = await pool.query<{
    page_id: string;
    nom: string | null;
    leadgen_obuna: boolean;
    obuna_xato: string | null;
  }>(
    `SELECT p.page_id, p.nom, p.leadgen_obuna, p.obuna_xato
       FROM fb_pages p
       JOIN workspaces w ON w.owner_id = p.user_id
      WHERE w.id = $1
      ORDER BY p.nom NULLS LAST`,
    [workspaceId]
  );
  return rows.map((r) => ({
    id: r.page_id,
    nom: r.nom,
    leadgenObuna: r.leadgen_obuna,
    xato: r.obuna_xato,
  }));
}

/** Workspace egasining sahifa tokenlari (shifrdan ochilgan). Faqat server ichida. */
export async function sahifaTokenlari(workspaceId: string): Promise<string[]> {
  try {
    await metaSxemasiniTaminla();
    const { rows } = await pool.query<{ page_token: string }>(
      `SELECT p.page_token
         FROM fb_pages p
         JOIN workspaces w ON w.owner_id = p.user_id
        WHERE w.id = $1
        ORDER BY p.leadgen_obuna DESC, p.updated_at DESC
        LIMIT 25`,
      [workspaceId]
    );
    return rows.map((r) => decrypt(r.page_token));
  } catch {
    return [];
  }
}

/** Qayta yangilash tugmasi uchun: egasining OAuth tokeni bilan. */
export async function workspaceSahifalariniYangila(workspaceId: string): Promise<Sahifa[]> {
  const { rows } = await pool.query<{ owner_id: string; fb_access_token: string | null }>(
    `SELECT w.owner_id, u.fb_access_token
       FROM workspaces w JOIN users u ON u.id = w.owner_id
      WHERE w.id = $1`,
    [workspaceId]
  );
  const r = rows[0];
  if (!r?.fb_access_token) throw new Error("Facebook ulanmagan. Avval Facebook'ni ulang.");
  return sahifalarniYangila(r.owner_id, decrypt(r.fb_access_token));
}

/* ───────────────────────── webhook ishlovi ───────────────────────── */

/**
 * Bitta leadgen hodisasini qayta ishlaydi.
 *
 * 1. Sahifa qaysi foydalanuvchilarniki → ularning workspace'lari.
 *    Reklama (ad_id) qaysi workspace'da bo'lsa — faqat o'sha; hech
 *    birida bo'lmasa (sync hali bo'lmagan) — egalarning hammasi.
 * 2. Sahifa tokeni bilan lidni o'qiydi: ad_id, form_id, telefon, email.
 *    O'qib bo'lmasa ham webhook'dagi ad_id saqlanadi.
 * 3. `fb_lead_ads` ga yozadi (holat 'ok', manba 'webhook').
 * 4. Shu lidga mos CRM lidlari bo'lsa — atribusiyani qayta hisoblaydi.
 *
 * Qaytaradi: nechta workspace'ga yozildi va nechta CRM lidi bog'landi.
 */
export async function leadgenniQaytaIshla(
  h: LeadgenHodisa,
  qaytaHisobla: (leadId: string, workspaceId: string) => Promise<unknown>
): Promise<{ workspacelar: number; boglandi: number }> {
  await metaSxemasiniTaminla();

  const sahifa = await pool.query<{ user_id: string; page_token: string }>(
    `SELECT user_id, page_token FROM fb_pages WHERE page_id = $1`,
    [h.pageId]
  );
  if (!sahifa.rows.length) return { workspacelar: 0, boglandi: 0 };

  const egalar = sahifa.rows.map((r) => r.user_id);
  let ws = await pool.query<{ id: string; phone_country_code: string }>(
    `SELECT w.id, COALESCE(w.phone_country_code, '998') AS phone_country_code
       FROM workspaces w
      WHERE w.owner_id = ANY($1::uuid[])
        AND ($2::text IS NULL OR EXISTS (
              SELECT 1 FROM ads a WHERE a.workspace_id = w.id AND a.fb_ad_id = $2))`,
    [egalar, h.adId]
  );
  /* Reklama hech bir workspace'da topilmadi (sync hali bo'lmagan yoki
     sahifa bir nechta odamniki — agentlik va mijoz). Lead ID → reklama
     xaritasi baribir yoziladi (u faqat aynan shu Lead ID'li CRM lidiga
     tegadi), lekin telefon/email hash'i FAQAT yagona egada yoziladi —
     aks holda begona workspace'dagi lid shu reklamaga bog'lanib ketardi. */
  let hashYozilsin = true;
  if (!ws.rows.length) {
    ws = await pool.query(
      `SELECT w.id, COALESCE(w.phone_country_code, '998') AS phone_country_code
         FROM workspaces w WHERE w.owner_id = ANY($1::uuid[])`,
      [egalar]
    );
    hashYozilsin = ws.rows.length === 1;
  }

  // Lidni sahifa tokeni bilan o'qiymiz.
  let adId = h.adId;
  let formId = h.formId;
  let vaqt = h.vaqt;
  let telefon: string | null = null;
  let email: string | null = null;
  let oqildi = false;
  let oqishXatosi: string | null = null;
  for (const r of sahifa.rows) {
    try {
      const d = await graphOl<{
        ad_id?: string;
        form_id?: string;
        created_time?: string;
        field_data?: Array<{ name?: string; values?: unknown[] }>;
      }>(`${GRAPH}/${h.leadgenId}`, {
        fields: 'ad_id,form_id,created_time,field_data',
        access_token: decrypt(r.page_token),
      });
      adId = d.ad_id ? String(d.ad_id) : adId;
      formId = d.form_id ? String(d.form_id) : formId;
      if (d.created_time) vaqt = new Date(d.created_time);
      ({ telefon, email } = aloqaniAjrat(d.field_data));
      oqildi = true;
      break;
    } catch (err) {
      oqishXatosi = xatoSababi(err);
      console.warn(`meta leadgen ${h.leadgenId}: lid o'qilmadi —`, oqishXatosi);
    }
  }

  /* O'qib bo'lmadi va webhook'da ham ad_id yo'q — bilmaymiz. "ok, reklama
     yo'q" deb yozish yolg'on bo'lardi va keshdan qayta so'ralmasdi.
     Xato sifatida yoziladi (mavjud qatorni bosmaydi) — "Eski lidlarni
     yechish" uni qayta so'raydi. */
  if (!oqildi && !adId) {
    for (const w of ws.rows) {
      await pool.query(
        `INSERT INTO fb_lead_ads (workspace_id, fb_lead_id, holat, xato, fb_page_id, lid_vaqti, manba)
         VALUES ($1, $2, 'error', $3, $4, $5, 'webhook')
         ON CONFLICT (workspace_id, fb_lead_id) DO NOTHING`,
        [w.id, h.leadgenId, oqishXatosi ?? "Lid Meta'dan o'qilmadi", h.pageId, vaqt]
      );
    }
    return { workspacelar: ws.rows.length, boglandi: 0 };
  }

  let boglandi = 0;
  for (const w of ws.rows) {
    const phoneHash = hashYozilsin && telefon ? hashPhone(telefon, w.phone_country_code) : null;
    const emailHash = hashYozilsin && email ? hashEmail(email) : null;
    await pool.query(
      `INSERT INTO fb_lead_ads
         (workspace_id, fb_lead_id, fb_ad_id, fb_form_id, holat, xato,
          fb_page_id, phone_hash, email_hash, lid_vaqti, manba)
       VALUES ($1, $2, $3, $4, 'ok', NULL, $5, $6, $7, $8, 'webhook')
       ON CONFLICT (workspace_id, fb_lead_id)
       DO UPDATE SET fb_ad_id   = COALESCE(EXCLUDED.fb_ad_id, fb_lead_ads.fb_ad_id),
                     fb_form_id = COALESCE(EXCLUDED.fb_form_id, fb_lead_ads.fb_form_id),
                     holat = 'ok', xato = NULL,
                     fb_page_id = EXCLUDED.fb_page_id,
                     phone_hash = COALESCE(EXCLUDED.phone_hash, fb_lead_ads.phone_hash),
                     email_hash = COALESCE(EXCLUDED.email_hash, fb_lead_ads.email_hash),
                     lid_vaqti  = COALESCE(EXCLUDED.lid_vaqti, fb_lead_ads.lid_vaqti),
                     manba = 'webhook'`,
      [w.id, h.leadgenId, adId, formId, h.pageId, phoneHash, emailHash, vaqt]
    );

    // CRM lidi bizdan OLDIN kelgan bo'lsa — hozir bog'laymiz.
    const lidlar = await pool.query<{ id: string }>(
      `SELECT id FROM leads
        WHERE workspace_id = $1 AND is_demo = false
          AND (fb_lead_id = $2
               OR (last_click_ad_id IS NULL AND $3::text IS NOT NULL AND phone_hash = $3)
               OR (last_click_ad_id IS NULL AND $4::text IS NOT NULL AND email_hash = $4))
        ORDER BY created_at DESC
        LIMIT 5`,
      [w.id, h.leadgenId, phoneHash, emailHash]
    );
    for (const l of lidlar.rows) {
      try {
        await qaytaHisobla(l.id, w.id);
        boglandi += 1;
      } catch (err) {
        console.error(`meta leadgen: lid ${l.id} qayta hisoblanmadi —`, (err as Error).message);
      }
    }
  }

  return { workspacelar: ws.rows.length, boglandi };
}

/**
 * Lead ID'siz CRM lidi uchun: leadgen webhook'idan kelgan lidni
 * telefon/email hash'i bo'yicha topadi. Oyna: CRM lididan 30 kun
 * oldin … 1 kun keyin. Jadval/ustun yo'q bo'lsa — null (fail-soft).
 */
export async function hashBoyichaReklama(
  workspaceId: string,
  phoneHash: string | null,
  emailHash: string | null,
  crmVaqt: Date | string | null
): Promise<string | null> {
  if (!phoneHash && !emailHash) return null;
  try {
    const { rows } = await pool.query<{ fb_ad_id: string | null }>(
      `SELECT fb_ad_id FROM fb_lead_ads
        WHERE workspace_id = $1 AND holat = 'ok' AND fb_ad_id IS NOT NULL
          AND ((phone_hash IS NOT NULL AND phone_hash = $2)
            OR (email_hash IS NOT NULL AND email_hash = $3))
          AND ($4::timestamptz IS NULL OR lid_vaqti IS NULL
               OR lid_vaqti BETWEEN $4::timestamptz - interval '30 days'
                                AND $4::timestamptz + interval '1 day')
        ORDER BY lid_vaqti DESC NULLS LAST
        LIMIT 1`,
      [workspaceId, phoneHash, emailHash, crmVaqt]
    );
    return rows[0]?.fb_ad_id ?? null;
  } catch {
    return null;
  }
}
