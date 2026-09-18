/* ═══════════════════════════════════════════════════════════════════════
   LID → REKLAMA BOG'LANISHI

   Mahsulotning butun qiymati shu bitta bog'lanishda. Usiz dashboard
   Ads Manager'ning nusxasi bo'lib qoladi.

   Uchta yo'l, shu tartibda sinaladi:

     1. UTM      — leads.utm_term  ↔  ads.name        (§5, asosiy)
     2. fbclid   — leads.fbclid    ↔  touchpoints     (piksel ishlagan bo'lsa)
     3. kontakt  — telefon/email hash ↔ touchpoints   (eng zaif)

   Nega uchta: biri ham 100% ishonchli emas. UTM landing'da yo'qolishi
   mumkin (in-app brauzer, localStorage bloklangan), fbclid 7 kundan keyin
   eskiradi, kontakt hash esa faqat piksel PII yig'gan bo'lsa bor.
   ═══════════════════════════════════════════════════════════════════════ */

import { pool } from '../db/pool';

/**
 * So'rovni kim bajaradi: umumiy pool yoki OCHIQ TRANZAKSIYA klienti.
 *
 * NEGA KERAK: serverless'da pool `max: 1` bilan ishlaydi (Supabase
 * ulanish limiti). Tranzaksiya ichida `pool.query` chaqirilsa, u bo'sh
 * ulanish kutadi — lekin yagona ulanish o'sha tranzaksiyaning o'zida.
 * Natija: 10 soniyalik kutish va "connection timeout" xatosi.
 *
 * Aynan shu import paytida sodir bo'ldi: 14 ta yutilgan lidning
 * hammasi shu yerda yiqildi va atribusiyasiz qoldi.
 */
type Bajaruvchi = Pick<typeof pool, 'query'>;

export type MatchMethod = 'utm' | 'fbclid' | 'contact';

export interface MatchResult {
  adId: string | null;
  adsetId: string | null;
  campaignId: string | null;
  method: MatchMethod | null;
  /** Bir xil nomdagi reklama bir nechta bo'lsa — atribusiya ishonchsiz. */
  ambiguous: boolean;
  /** Log va UI uchun tushuntirish. */
  note: string | null;
}

const EMPTY: MatchResult = {
  adId: null,
  adsetId: null,
  campaignId: null,
  method: null,
  ambiguous: false,
  note: null,
};

/**
 * Nomni solishtirishga tayyorlaydi (§5).
 *
 * Facebook UTM'ga ad nomini qo'yganda bo'sh joylarni "+" ga aylantiradi va
 * kirill harflarni percent-encode qiladi. Landing esa uni yana o'zgartirishi
 * mumkin. Shuning uchun har ikki tomon BIR XIL normalizatsiyadan o'tadi:
 *
 *   "ААА%20лид+3 " → "ааа лид 3"
 *
 * decodeURIComponent buzuq kirish uchun throw qiladi (masalan yolg'iz "%"),
 * shuning uchun try ichida.
 */
export function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw);
  try {
    s = decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    s = s.replace(/\+/g, ' ');
  }
  s = s.trim().toLowerCase().replace(/\s+/g, ' ');
  return s.length > 0 ? s : null;
}

interface AdRow {
  id: string;
  adset_id: string | null;
  campaign_id: string | null;
  name: string | null;
}

/**
 * UTM qiymatini reklama nomiga solishtiradi.
 *
 * ⚠ Ad nomi takrorlansa atribusiya buziladi — §5 buni ANIQLAB, ogohlantirishni
 * talab qiladi. Bu yerda ikkita qoida:
 *   • bir nechta mos kelsa — birontasini TANLAMAYMIZ (noto'g'ri reklamaga
 *     pul yozgandan ko'ra, bog'lamagan ma'qul)
 *   • `ambiguous` bayrog'i qaytadi, chaqiruvchi uni logga va UI'ga chiqaradi
 */
async function matchByName(
  workspaceId: string,
  value: string | null,
  db: Bajaruvchi = pool
): Promise<MatchResult> {
  const needle = normalizeName(value);
  if (!needle) return EMPTY;

  const { rows } = await db.query<AdRow>(
    `SELECT id, adset_id, campaign_id, name
       FROM ads
      WHERE workspace_id = $1 AND lower(btrim(name)) = $2
      LIMIT 10`,
    [workspaceId, needle]
  );

  if (rows.length === 0) return EMPTY;

  if (rows.length > 1) {
    return {
      ...EMPTY,
      ambiguous: true,
      note: `${rows.length} ta reklama bir xil nomda: "${value}" — xarajat noto'g'ri bo'linadi, nomlarni takrorlamang`,
    };
  }

  const ad = rows[0];
  return {
    adId: ad.id,
    adsetId: ad.adset_id,
    campaignId: ad.campaign_id,
    method: 'utm',
    ambiguous: false,
    note: null,
  };
}

/**
 * `fbclid` bo'yicha touchpoint zanjiridan reklamani topadi.
 * Oxirgi (eng yangi) touchpoint olinadi — last-click modeliga mos.
 */
async function matchByFbclid(
  workspaceId: string,
  fbclid: string | null,
  db: Bajaruvchi = pool
): Promise<MatchResult> {
  if (!fbclid) return EMPTY;
  const { rows } = await db.query<AdRow>(
    `SELECT a.id, a.adset_id, a.campaign_id, a.name
       FROM touchpoints t
       JOIN ads a ON a.id = t.ad_id
      WHERE t.workspace_id = $1 AND t.fbclid = $2
      ORDER BY t.occurred_at DESC NULLS LAST
      LIMIT 1`,
    [workspaceId, fbclid]
  );
  const ad = rows[0];
  if (!ad) return EMPTY;
  return {
    adId: ad.id,
    adsetId: ad.adset_id,
    campaignId: ad.campaign_id,
    method: 'fbclid',
    ambiguous: false,
    note: null,
  };
}

/** Telefon/email hash bo'yicha — piksel PII yig'gan bo'lsagina ishlaydi. */
async function matchByContact(
  workspaceId: string,
  phoneHash: string | null,
  emailHash: string | null,
  db: Bajaruvchi = pool
): Promise<MatchResult> {
  if (!phoneHash && !emailHash) return EMPTY;
  const { rows } = await db.query<AdRow>(
    `SELECT a.id, a.adset_id, a.campaign_id, a.name
       FROM touchpoints t
       JOIN ads a ON a.id = t.ad_id
       JOIN leads l ON l.id = t.lead_id
      WHERE t.workspace_id = $1
        AND ( ($2::text IS NOT NULL AND l.phone_hash = $2)
           OR ($3::text IS NOT NULL AND l.email_hash = $3) )
      ORDER BY t.occurred_at DESC NULLS LAST
      LIMIT 1`,
    [workspaceId, phoneHash, emailHash]
  );
  const ad = rows[0];
  if (!ad) return EMPTY;
  return {
    adId: ad.id,
    adsetId: ad.adset_id,
    campaignId: ad.campaign_id,
    method: 'contact',
    ambiguous: false,
    note: null,
  };
}

export interface LeadSignals {
  utmTerm?: string | null;
  utmContent?: string | null;
  utmCampaign?: string | null;
  fbclid?: string | null;
  phoneHash?: string | null;
  emailHash?: string | null;
}

/**
 * Lidni reklamaga bog'laydi. Hech biri ishlamasa — bo'sh natija,
 * lid atribusiyasiz qoladi (bu normal holat, xato emas).
 *
 * `attributionKey` — workspace config'idan (§3.1: kodda qotirilmaydi).
 */
export async function matchLeadToAd(
  workspaceId: string,
  signals: LeadSignals,
  attributionKey = 'utm_term',
  /**
   * Ochiq tranzaksiya ichidan chaqirilsa — o'sha tranzaksiyaning
   * klienti berilishi SHART. Aks holda serverless'da (pool max: 1)
   * so'rov o'zini o'zi kutib qoladi va timeout bilan yiqiladi.
   */
  db: Bajaruvchi = pool
): Promise<MatchResult> {
  const keyValue =
    attributionKey === 'utm_content'
      ? signals.utmContent
      : attributionKey === 'utm_campaign'
        ? signals.utmCampaign
        : signals.utmTerm;

  const byUtm = await matchByName(workspaceId, keyValue ?? null, db);
  // Takroriy nom topilsa ham to'xtaymiz: ogohlantirish yo'qolmasin.
  if (byUtm.adId || byUtm.ambiguous) return byUtm;

  const byFbclid = await matchByFbclid(workspaceId, signals.fbclid ?? null, db);
  if (byFbclid.adId) return byFbclid;

  return matchByContact(workspaceId, signals.phoneHash ?? null, signals.emailHash ?? null, db);
}

/* ---------- amoCRM maxsus maydonlaridan UTM ajratish ---------- */

export interface AmoFieldValue {
  field_id?: number;
  field_name?: string;
  field_code?: string;
  values?: Array<{ value?: unknown }>;
}

/** Qidiriladigan UTM nomlari — amoCRM'da maydon nomi shu ko'rinishda bo'ladi. */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>> & { fbclid?: string };

/**
 * amoCRM lid maydonlaridan UTM va fbclid'ni ajratadi.
 *
 * ⚠ Yo'riqnoma §3.5: ID larni TAXMIN QILISH TAQIQLANADI. Shuning uchun
 * maydon ID emas, maydon NOMI bo'yicha qidiramiz — bu taxmin emas, amoCRM
 * o'zi standart UTM maydonlarini aynan shu nomlar bilan yaratadi.
 *
 * Aniq ID lar keyinchalik discover.js orqali config'ga yozilganda, bu
 * funksiya ularni birinchi navbatda ishlatadigan qilib kengaytiriladi.
 */
export function extractUtm(fields: AmoFieldValue[] | null | undefined): Utm {
  const out: Utm = {};
  if (!fields) return out;

  for (const f of fields) {
    const label = String(f.field_name ?? f.field_code ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const raw = f.values?.[0]?.value;
    if (raw === undefined || raw === null || raw === '') continue;
    const value = String(raw);

    if ((UTM_KEYS as readonly string[]).includes(label)) {
      out[label as UtmKey] = value;
    } else if (label === 'fbclid' || label === 'fb_click_id') {
      out.fbclid = value;
    }
  }
  return out;
}
