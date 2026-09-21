/* ═══════════════════════════════════════════════════════════════════════
   ATRIBUSIYA TASHXISI — "zanjir qayerda uzilgan?"

   NEGA KERAK: dashboard hozir aytadiki 15 660 lid, 21 sotuv, hamma
   kampaniyada PURCHASES = 0. Ya'ni CRM'da pul bor, lekin u hech qaysi
   reklamaga yozilmagan. "Nega?" degan savolga taxmin bilan javob berish
   — eng qimmat xato: noto'g'ri joyni tuzatib, hafta yo'qotiladi.

   Bu endpoint TAXMIN QILMAYDI. U zanjirning har bo'g'inini alohida
   sanaydi va qaysi bo'g'inda yo'qotish borligini raqam bilan ko'rsatadi:

     Reklama → Klik → Lid → [KALIT] → Bog'lanish → Sotuv → Pul
                              ↑           ↑
                         shu bormi?   ishladimi?

   FAQAT O'QIYDI. Hech narsa yozmaydi, hech narsani o'zgartirmaydi (§4.3).
   ═══════════════════════════════════════════════════════════════════════ */

import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { normalizeName } from '../services/leadMatcher';
import { formlarniKashfEt } from '../services/formKashfiyot';
import { xatoQayd } from '../utils/xatolar';
import { amoGetPath, getPipelines } from '../services/amocrmService';
import { taqsimotYig, type AmoLidXom, type AmoVoronka } from '../services/etapTaqsimoti';

/** Postgres COUNT/SUM matn qaytaradi — raqamga o'girish majburiy. */
function son(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Foiz, bir kasr xonasi bilan. Maxraj 0 bo'lsa 0 — NaN emas. */
function foiz(qism: number, butun: number): number {
  if (butun <= 0) return 0;
  return Math.round((qism / butun) * 1000) / 10;
}

interface KalitHolati {
  bor: number;
  foiz: number;
}

/**
 * ---- GET /api/dashboard/atribusiya-tashxis ----
 *
 * Javob shakli barqaror: yangi bo'g'in qo'shilsa yangi maydon qo'shiladi,
 * eskisi nomi o'zgarmaydi.
 */
export async function atribusiyaTashxis(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    /* ── 1. Lidlar: umumiy holat ────────────────────────────────────── */
    const lidlarQ = pool.query(
      `SELECT
         COUNT(*)                                             AS jami,
         COUNT(*) FILTER (WHERE status = 'won')               AS won,
         COUNT(*) FILTER (WHERE status = 'lost')              AS lost,
         COUNT(*) FILTER (WHERE status = 'new')               AS yangi,
         COUNT(*) FILTER (WHERE status = 'in_progress')       AS jarayonda,
         COUNT(*) FILTER (WHERE qualified_at IS NOT NULL)     AS sifatli,
         COALESCE(SUM(revenue) FILTER (WHERE status = 'won'), 0) AS daromad
       FROM leads
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    /* ── 2. Kalitlar: lidni reklamaga bog'lash uchun NIMA BOR? ──────── */
    const kalitlarQ = pool.query(
      `SELECT
         COUNT(*)                                          AS jami,
         COUNT(*) FILTER (WHERE utm_term   IS NOT NULL AND utm_term   <> '') AS utm_term,
         COUNT(*) FILTER (WHERE utm_source IS NOT NULL AND utm_source <> '') AS utm_source,
         COUNT(*) FILTER (WHERE fbclid     IS NOT NULL AND fbclid     <> '') AS fbclid,
         COUNT(*) FILTER (WHERE fb_lead_id IS NOT NULL AND fb_lead_id <> '') AS fb_lead_id,
         COUNT(*) FILTER (WHERE source_line IS NOT NULL AND source_line <> '') AS source_line,
         COUNT(*) FILTER (WHERE phone_hash IS NOT NULL)    AS telefon,
         COUNT(*) FILTER (WHERE email_hash IS NOT NULL)    AS email
       FROM leads
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    /* ── 3. Bog'lanish: qaysi usul ishladi va qancha pul olib keldi ── */
    const usullarQ = pool.query(
      `SELECT
         match_method                                            AS usul,
         COUNT(*)                                                AS lidlar,
         COUNT(*) FILTER (WHERE status = 'won')                  AS won,
         COALESCE(SUM(revenue) FILTER (WHERE status = 'won'), 0) AS daromad
       FROM leads
       WHERE workspace_id = $1
       GROUP BY match_method
       ORDER BY COUNT(*) DESC`,
      [workspaceId]
    );

    /**
     * Eng muhim ikki raqam: reklamaga BOG'LANMAGAN yutilgan lidlar va
     * ularning puli. Bu — mahsulot javob bera olmayotgan qism.
     */
    const boglanishQ = pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE last_click_ad_id IS NOT NULL)  AS boglangan,
         COUNT(*) FILTER (WHERE status = 'won' AND last_click_ad_id IS NOT NULL) AS won_boglangan,
         COUNT(*) FILTER (WHERE status = 'won' AND last_click_ad_id IS NULL)     AS won_boglanmagan,
         COALESCE(SUM(revenue) FILTER (WHERE status = 'won' AND last_click_ad_id IS NOT NULL), 0) AS daromad_boglangan,
         COALESCE(SUM(revenue) FILTER (WHERE status = 'won' AND last_click_ad_id IS NULL), 0)     AS daromad_boglanmagan
       FROM leads
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    /* ── 4. Touchpointlar: piksel umuman ishlaganmi? ─────────────────── */
    const touchQ = pool.query(
      `SELECT
         COUNT(*)                                  AS jami,
         COUNT(*) FILTER (WHERE lead_id IS NOT NULL) AS lidli,
         COUNT(*) FILTER (WHERE lead_id IS NULL)     AS yetim,
         COUNT(*) FILTER (WHERE fbclid IS NOT NULL)  AS fbclidli
       FROM touchpoints
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    /* ── 5. Reklamalar va takroriy nomlar ────────────────────────────── */
    const adsQ = pool.query<{ id: string; name: string | null }>(
      `SELECT id, name FROM ads WHERE workspace_id = $1`,
      [workspaceId]
    );

    /* ── 6. Tafovut: FB nechta lid dedi, CRM'da nechta bor ───────────── */
    const fbQ = pool.query(
      `SELECT
         COALESCE(SUM(leads_count), 0)  AS fb_lidlar,
         COALESCE(SUM(spend), 0)        AS xarajat,
         COUNT(*)                       AS reklamalar
       FROM ads
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    const [lidlarR, kalitlarR, usullarR, boglanishR, touchR, adsR, fbR] = await Promise.all([
      lidlarQ,
      kalitlarQ,
      usullarQ,
      boglanishQ,
      touchQ,
      adsQ,
      fbQ,
    ]);

    const jamiLid = son(lidlarR.rows[0].jami);

    /**
     * Takroriy nomlar — atribusiyaning jim qotili (§5).
     *
     * Solishtirish SQL'da emas, JS'da: `normalizeName` decodeURIComponent
     * ishlatadi, uning SQL ekvivalenti yo'q. Taxminiy `lower(trim(...))`
     * bilan solishtirish boshqa javob berardi — va tashxis o'zi yolg'on
     * bo'lib qolardi.
     */
    const nomlar = new Map<string, string[]>();
    for (const a of adsR.rows) {
      const nom = normalizeName(a.name);
      if (!nom) continue;
      const royxat = nomlar.get(nom);
      if (royxat) royxat.push(a.id);
      else nomlar.set(nom, [a.id]);
    }
    const takroriy = [...nomlar.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([nom, ids]) => ({ nom, soni: ids.length }))
      .sort((a, b) => b.soni - a.soni)
      .slice(0, 20);
    const takroriyReklamalar = takroriy.reduce((s, t) => s + t.soni, 0);

    const kalit = (v: unknown): KalitHolati => {
      const bor = son(v);
      return { bor, foiz: foiz(bor, jamiLid) };
    };

    const k = kalitlarR.rows[0];
    const b = boglanishR.rows[0];
    const fbLidlar = son(fbR.rows[0].fb_lidlar);

    res.json({
      lidlar: {
        jami: jamiLid,
        yangi: son(lidlarR.rows[0].yangi),
        jarayonda: son(lidlarR.rows[0].jarayonda),
        sifatli: son(lidlarR.rows[0].sifatli),
        won: son(lidlarR.rows[0].won),
        lost: son(lidlarR.rows[0].lost),
        daromad: son(lidlarR.rows[0].daromad),
      },

      /**
       * Har lidda reklamaga bog'lash uchun kalit bormi. Hammasi 0 bo'lsa —
       * muammo bog'lash kodida emas, MA'LUMOTDA: CRM'ga kalit tushmayapti.
       */
      kalitlar: {
        utm_term: kalit(k.utm_term),
        utm_source: kalit(k.utm_source),
        fbclid: kalit(k.fbclid),
        fb_lead_id: kalit(k.fb_lead_id),
        source_line: kalit(k.source_line),
        telefon_hash: kalit(k.telefon),
        email_hash: kalit(k.email),
      },

      boglanish: {
        usullar: usullarR.rows.map((r) => ({
          usul: r.usul ?? 'bog‘lanmagan',
          lidlar: son(r.lidlar),
          won: son(r.won),
          daromad: son(r.daromad),
        })),
        boglangan: son(b.boglangan),
        boglangan_foiz: foiz(son(b.boglangan), jamiLid),
        won_boglangan: son(b.won_boglangan),
        won_boglanmagan: son(b.won_boglanmagan),
        daromad_boglangan: son(b.daromad_boglangan),
        // ⚠ ENG MUHIM RAQAM: reklamaga yozilmagan pul.
        daromad_boglanmagan: son(b.daromad_boglanmagan),
      },

      touchpointlar: {
        jami: son(touchR.rows[0].jami),
        lidli: son(touchR.rows[0].lidli),
        yetim: son(touchR.rows[0].yetim),
        fbclidli: son(touchR.rows[0].fbclidli),
      },

      reklamalar: {
        jami: son(fbR.rows[0].reklamalar),
        xarajat: son(fbR.rows[0].xarajat),
        takroriy_nomlar: takroriy,
        takroriy_reklamalar: takroriyReklamalar,
      },

      /**
       * FB "shuncha lid" deydi, CRM'da boshqa raqam turadi. Farqni
       * ko'rsatish majburiy (§7) — u bo'lmasa ikkala raqam ham
       * ishonchli ko'rinadi.
       */
      tafovut: {
        fb_lidlar: fbLidlar,
        crm_lidlar: jamiLid,
        farq: jamiLid - fbLidlar,
      },
    });
  } catch (err) {
    xatoQayd(err, { joy: 'atribusiya-tashxis', workspaceId });
    res.status(500).json({ error: 'Tashxis bajarilmadi' });
  }
}

/**
 * ---- GET /api/dashboard/form-kashfiyot ----
 *
 * B yo'li tajribasi: Instant Form → reklama xaritasi qurilishi mumkinmi.
 * FAQAT O'QIYDI. Natija saqlanmaydi — qaror odamniki (§3.5).
 */
export async function formKashfiyot(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  /**
   * Namuna hajmi. Standart 300 — tez javob. `?namuna=2000` butun akkauntni
   * skanerlaydi, lekin 1 600 reklama ≈ 33 sahifa so'rov: Vercel 300 soniyada
   * uzib qo'yishi mumkin. TEKSHIRILISHI KERAK: real vaqt o'lchanmagan.
   */
  const xom = Number(req.query.namuna);
  const namuna = Number.isFinite(xom) ? Math.min(Math.max(Math.trunc(xom), 50), 3000) : undefined;

  try {
    res.json(await formlarniKashfEt(workspaceId, namuna));
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status === 400) {
      res.status(400).json({ error: e.message });
      return;
    }
    xatoQayd(err, { joy: 'form-kashfiyot', workspaceId });
    res.status(500).json({ error: 'Kashfiyot bajarilmadi' });
  }
}

/**
 * ---- GET /api/dashboard/etap-taqsimoti ----
 *
 * "Pul qaysi voronkaning qaysi etapida turibdi?"
 *
 * `amocrm_won_pairs` ni tekshirishning yagona ishonchli yo'li. Har
 * juftlik nomi, lid soni va summasi bilan ko'rsatiladi; config bilan
 * solishtiriladi va nomuvofiqlik ogohlantirish sifatida chiqadi.
 *
 * FAQAT O'QIYDI (§4.3). Config'ga hech narsa yozmaydi — qaror odamniki.
 *
 * `?sahifa=<n>` — nechta sahifa o'qilsin (har sahifa 250 lid).
 * Standart 40 = 10 000 lid. Chegara bor, chunki Vercel funksiyasi
 * 300 soniyada uziladi va uzilish JIM o'tadi.
 */
export async function etapTaqsimoti(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const xom = Number(req.query.sahifa);
  const chegara = Number.isFinite(xom) ? Math.min(Math.max(Math.trunc(xom), 1), 120) : 40;

  try {
    const ws = await pool.query<{
      amocrm_won_pairs: string[] | null;
      amocrm_qualified_pairs: string[] | null;
      amocrm_lead_pairs: string[] | null;
      currency: string | null;
    }>(
      `SELECT amocrm_won_pairs, amocrm_qualified_pairs, amocrm_lead_pairs, currency
         FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    const cfg = ws.rows[0];
    if (!cfg) {
      res.status(404).json({ error: 'Workspace topilmadi' });
      return;
    }

    const voronkalar = await getPipelines(workspaceId);

    /* Lidlarni sahifalab o'qiymiz. amoCRM bo'sh sahifada 204 qaytaradi,
       `amoGetPath` uni bo'sh obyekt sifatida beradi — shuning uchun
       to'xtash sharti "lid kelmadi". */
    const lidlar: AmoLidXom[] = [];
    let sahifa = 1;
    let toliq = false;
    for (; sahifa <= chegara; sahifa++) {
      const javob = await amoGetPath<{ _embedded?: { leads?: AmoLidXom[] } }>(
        workspaceId,
        `/api/v4/leads?limit=250&page=${sahifa}`
      );
      const bolak = javob?._embedded?.leads ?? [];
      lidlar.push(...bolak);
      if (bolak.length < 250) {
        toliq = true;
        break;
      }
    }

    const natija = taqsimotYig(lidlar, voronkalar as AmoVoronka[], {
      yutildi: cfg.amocrm_won_pairs ?? [],
      sifatli: cfg.amocrm_qualified_pairs ?? [],
      yangi: cfg.amocrm_lead_pairs ?? [],
    });

    if (!toliq) {
      natija.ogohlantirishlar.unshift(
        `⚠ ${chegara} sahifa chegarasiga urildi — hamma lid o'qilmadi. Raqamlar TO'LIQ EMAS. \`?sahifa=${Math.min(chegara * 2, 120)}\` bilan qayta urinib ko'ring.`
      );
    }

    res.json({
      valyuta: cfg.currency ?? null,
      sahifa_soni: Math.min(sahifa, chegara),
      toliq,
      ...natija,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status === 400 || e.status === 403) {
      res.status(400).json({ error: e.message });
      return;
    }
    xatoQayd(err, { joy: 'etap-taqsimoti', workspaceId });
    res.status(500).json({ error: "Etap taqsimoti o'qilmadi" });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   ---- GET /api/dashboard/zanjir ----

   "Yangi lid zanjirni oxirigacha bosib o'tdimi?"

   Webhook 2026-09-19 da ulandi. Undan OLDINGI 15 690 lid import orqali
   kelgan — ularda Meta Lead ID ham, touchpoint ham yo'q va bo'lishi ham
   mumkin emas. Shuning uchun eski raqamlarga qarab hukm chiqarish
   noto'g'ri: ular boshqa yo'ldan kelgan.

   Bu endpoint FAQAT yangi lidlarni ko'radi va har bo'g'inni alohida
   ko'rsatadi:

     webhook keldi → fb_lead_id yozildi → reklamaga bog'landi → CAPI ketdi
          ↓               ↓                      ↓                  ↓
      leads qatori    fb_lead_id           match_method        capi_events

   Qaysi bo'g'inda to'xtaganini ko'rsatadi — "ishlamayapti" emas, aniq joy.

   ⚠ `leads.created_at` — bizning bazaga YOZILGAN vaqt, amoCRM'dagi
   yaratilgan vaqt emas (`crm_created_at`). Webhook orqali kelganini
   aynan shu ikkisi orasidagi farq ko'rsatadi: webhook'da ular deyarli
   teng, importda esa `created_at` ancha keyin.

   FAQAT O'QIYDI (§4.3).
   ═══════════════════════════════════════════════════════════════════════ */
export async function zanjir(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const xom = Number(req.query.soat);
  const soat = Number.isFinite(xom) ? Math.min(Math.max(Math.trunc(xom), 1), 720) : 72;

  try {
    const { rows } = await pool.query(
      `SELECT l.crm_lead_id,
              l.created_at,
              l.crm_created_at,
              l.status,
              l.crm_stage,
              l.revenue,
              l.fb_lead_id,
              l.source_line,
              l.match_method,
              l.utm_term,
              l.fbclid,
              (l.phone_hash IS NOT NULL)                       AS telefon_bor,
              (SELECT COUNT(*) FROM touchpoints t
                WHERE t.lead_id = l.id)                        AS touchpoint,
              (SELECT a.name FROM ads a
                WHERE a.id = l.last_click_ad_id)               AS reklama,
              COALESCE((
                SELECT json_agg(json_build_object(
                         'hodisa', c.event_name,
                         'holat',  c.status,
                         'kalit',  c.match_keys,
                         'xato',   c.error
                       ) ORDER BY c.sent_at)
                  FROM capi_events c
                 WHERE c.lead_id = l.id
              ), '[]'::json)                                   AS capi
         FROM leads l
        WHERE l.workspace_id = $1
          AND l.created_at > now() - ($2 || ' hours')::interval
          AND l.is_demo = false
        ORDER BY l.created_at DESC
        LIMIT 50`,
      [workspaceId, String(soat)]
    );

    const jami = rows.length;
    const bilan = (f: (r: Record<string, unknown>) => boolean) => rows.filter(f).length;

    const bogichlar = {
      webhook_keldi: jami,
      fb_lead_id_bor: bilan((r) => Boolean(r.fb_lead_id)),
      reklamaga_boglandi: bilan((r) => Boolean(r.match_method)),
      touchpoint_bor: bilan((r) => son(r.touchpoint) > 0),
      capi_ketdi: bilan((r) => Array.isArray(r.capi) && r.capi.length > 0),
      capi_xato: bilan(
        (r) =>
          Array.isArray(r.capi) &&
          (r.capi as Array<{ holat?: string }>).some((c) => c.holat === 'error')
      ),
    };

    /* Zanjir qayerda uzilgan — birinchi nol bo'g'in. */
    let uzilgan: string | null = null;
    if (jami === 0) {
      uzilgan = 'webhook';
    } else if (bogichlar.fb_lead_id_bor === 0) {
      uzilgan = 'fb_lead_id';
    } else if (bogichlar.reklamaga_boglandi === 0) {
      uzilgan = 'boglanish';
    } else if (bogichlar.capi_ketdi === 0) {
      uzilgan = 'capi';
    }

    const xulosa =
      jami === 0
        ? `Oxirgi ${soat} soatda BIRORTA yangi lid kelmadi. Yo reklama lid keltirmayapti, yo webhook ishlamayapti. Reklama faol bo'lsa — webhook'ni tekshiring.`
        : uzilgan === 'fb_lead_id'
          ? `${jami} ta yangi lid keldi, lekin birortasida Meta Lead ID yo'q. Zanjir shu yerda uzilgan — 'amocrm_lead_id_source' sozlamasi noto'g'ri bo'lishi mumkin.`
          : uzilgan === 'boglanish'
            ? `${jami} ta lid keldi va Lead ID bor, lekin hech biri reklamaga bog'lanmadi. Reklama sinxronida o'sha lead ID yo'q bo'lishi mumkin.`
            : uzilgan === 'capi'
              ? `${jami} ta lid keldi va bog'landi, lekin CAPI hodisasi yuborilmagan.`
              : `${jami} ta yangi lid: ${bogichlar.fb_lead_id_bor} tasida Lead ID, ${bogichlar.reklamaga_boglandi} tasi reklamaga bog'landi, ${bogichlar.capi_ketdi} tasidan CAPI ketdi.`;

    res.json({
      soat,
      bogichlar,
      uzilgan,
      xulosa,
      lidlar: rows.map((r) => ({
        crm_lead_id: r.crm_lead_id,
        bazaga: r.created_at,
        crmda: r.crm_created_at,
        status: r.status,
        etap: r.crm_stage,
        summa: son(r.revenue),
        fb_lead_id: r.fb_lead_id ?? null,
        liniya: r.source_line ?? null,
        boglanish: r.match_method ?? null,
        reklama: r.reklama ?? null,
        utm_term: r.utm_term ?? null,
        fbclid: r.fbclid ? 'bor' : null,
        telefon: r.telefon_bor ? 'bor' : null,
        touchpoint: son(r.touchpoint),
        capi: r.capi,
      })),
    });
  } catch (err) {
    xatoQayd(err, { joy: 'zanjir', workspaceId });
    res.status(500).json({ error: "Zanjir o'qilmadi" });
  }
}
