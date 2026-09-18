import { pool } from '../db/pool';
import { PoolClient } from 'pg';
import { matchLeadToAd } from './leadMatcher';

export type AttributionModel = 'first_click' | 'last_click' | 'linear' | 'time_decay';

export interface Touchpoint {
  id: string;
  ad_id: string | null;
  adset_id: string | null;
  campaign_id: string | null;
  occurred_at: string | null;
  touch_number: number | null;
}

// ---------- attribution models (pure) ----------

/** 100% credit to the first touch. Returns its ad_id. */
export function firstClickAttribution(tps: Touchpoint[]): string | null {
  return tps[0]?.ad_id ?? null;
}

/** 100% credit to the last touch. Returns its ad_id. */
export function lastClickAttribution(tps: Touchpoint[]): string | null {
  return tps[tps.length - 1]?.ad_id ?? null;
}

/** Equal weight 1/n for every touch. Returns a map touchpointId -> weight. */
export function linearAttribution(tps: Touchpoint[]): Map<string, number> {
  const w = new Map<string, number>();
  const n = tps.length;
  if (n === 0) return w;
  for (const tp of tps) w.set(tp.id, 1 / n);
  return w;
}

/**
 * Exponential time decay: the i-th touch (0 = oldest) gets 2^i, normalized so
 * weights sum to 1. Recent touches get exponentially more credit.
 */
export function timeDecayAttribution(tps: Touchpoint[]): Map<string, number> {
  const w = new Map<string, number>();
  const n = tps.length;
  if (n === 0) return w;
  const denom = 2 ** n - 1; // sum of 2^0 .. 2^(n-1)
  tps.forEach((tp, i) => w.set(tp.id, 2 ** i / denom));
  return w;
}

function computeWeights(tps: Touchpoint[], model: AttributionModel): Map<string, number> {
  switch (model) {
    case 'linear':
      return linearAttribution(tps);
    case 'first_click': {
      const w = new Map<string, number>();
      if (tps[0]) w.set(tps[0].id, 1);
      return w;
    }
    case 'last_click': {
      const w = new Map<string, number>();
      const last = tps[tps.length - 1];
      if (last) w.set(last.id, 1);
      return w;
    }
    case 'time_decay':
    default:
      return timeDecayAttribution(tps);
  }
}

// ---------- ad metric helpers ----------

/** Takrorlanmas ad id lar — qayta hisoblanishi kerak bo'lganlar ro'yxati. */
function uniqueAdIds(rows: Array<{ ad_id: string | null }>): string[] {
  const set = new Set<string>();
  for (const r of rows) if (r.ad_id) set.add(r.ad_id);
  return [...set];
}

/**
 * Reklama metrikalarini lidlardan QAYTA HISOBLAYDI — o'sish emas, mutlaq.
 *
 * Ilgari bu yerda `revenue = revenue + delta` turardi va shu sababli butun
 * dvigatel "reverse-then-reapply" invariantiga bog'langan edi: har qayta
 * hisoblash avval o'z eski hissasini AYIRISHI kerak edi, aks holda daromad
 * ikki marta qo'shilardi.
 *
 * Bu naqsh ikki jihatdan zaif:
 *   1. Facebook sync `revenue` ni butunlay qayta yozadi. Shundan keyin
 *      "eski hissani ayirish" endi mavjud bo'lmagan qiymatdan ayiriladi va
 *      raqam jimgina siljiydi. GREATEST(...,0) buni yashiradi.
 *   2. Har yangi yo'l (UTM mosligi kabi) invariantni buzish xavfini olib
 *      keladi — hissa touchpoint'ga yozilmasa, reverse uni topolmaydi.
 *
 * Mutlaq qayta hisoblashda bu muammolarning IKKALASI HAM yo'q: natija faqat
 * hozirgi holatga bog'liq, necha marta chaqirilgani ahamiyatsiz.
 *
 * Manba yagona: yutilgan lidlar × touchpoint og'irligi.
 */
async function recomputeAdMetrics(
  client: PoolClient,
  workspaceId: string,
  adIds: string[]
): Promise<void> {
  if (adIds.length === 0) return;
  await client.query(
    `UPDATE ads a
        SET revenue = COALESCE(g.revenue, 0),
            purchases_count = COALESCE(g.purchases, 0),
            roas = CASE WHEN a.spend > 0 THEN COALESCE(g.revenue, 0) / a.spend END
       FROM (
         SELECT t.ad_id,
                SUM(l.revenue * t.attribution_weight) AS revenue,
                SUM(t.attribution_weight)             AS purchases
           FROM touchpoints t
           JOIN leads l ON l.id = t.lead_id
          WHERE t.workspace_id = $1
            AND t.ad_id = ANY($2::uuid[])
            AND t.attribution_weight IS NOT NULL
            AND l.status = 'won'
          GROUP BY t.ad_id
       ) g
      WHERE a.id = g.ad_id AND a.workspace_id = $1`,
    [workspaceId, adIds]
  );

  // Hech qanday yutilgan lidi qolmagan reklamalar yuqoridagi JOIN'ga
  // tushmaydi — ularni alohida nolga qaytaramiz. Aks holda oxirgi sotuvi
  // bekor qilingan reklama eski daromadini saqlab qolardi.
  await client.query(
    `UPDATE ads a
        SET revenue = 0, purchases_count = 0,
            roas = CASE WHEN a.spend > 0 THEN 0 END
      WHERE a.workspace_id = $1
        AND a.id = ANY($2::uuid[])
        AND NOT EXISTS (
          SELECT 1 FROM touchpoints t
            JOIN leads l ON l.id = t.lead_id
           WHERE t.ad_id = a.id AND t.workspace_id = $1
             AND t.attribution_weight IS NOT NULL AND l.status = 'won'
        )`,
    [workspaceId, adIds]
  );
}

/**
 * Touchpoint bo'lmaganda deal time'ni lidning o'zidan hisoblaydi:
 * CRM'da yaratilgan sana → yutilgan sana.
 */
function dealTimeFromLead(lead: { won_at: string | null; crm_created_at?: string | null }): number | null {
  if (!lead.won_at || !lead.crm_created_at) return null;
  const ms = new Date(lead.won_at).getTime() - new Date(lead.crm_created_at).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

// ---------- core ----------

interface LeadRow {
  id: string;
  revenue: string;
  won_at: string | null;
  first_click_ad_id: string | null;
  utm_term: string | null;
  utm_content: string | null;
  utm_campaign: string | null;
  fbclid: string | null;
  phone_hash: string | null;
  email_hash: string | null;
  crm_created_at: string | null;
}

/**
 * Bitta lid uchun atribusiyani qayta hisoblaydi.
 *
 * Idempotent — lekin endi "reverse-then-reapply" hisobiga emas. Reklama
 * metrikalari lidlardan MUTLAQ qayta hisoblanadi, ya'ni natija faqat hozirgi
 * holatga bog'liq. Funksiyani 1 marta ham, 100 marta ham chaqirish bir xil
 * raqam beradi va oraliqda Facebook sync o'tib ketsa ham buzilmaydi.
 */
export async function processLeadAttribution(
  leadId: string,
  workspaceId: string,
  model: AttributionModel = 'last_click'
): Promise<{ touches: number; firstAdId: string | null; lastAdId: string | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const leadRes = await client.query<LeadRow>(
      `SELECT id, revenue, won_at, first_click_ad_id,
              utm_term, utm_content, utm_campaign, fbclid, phone_hash, email_hash,
              crm_created_at
         FROM leads WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
      [leadId, workspaceId]
    );
    const lead = leadRes.rows[0];
    if (!lead) {
      await client.query('ROLLBACK');
      throw new Error('Lead not found');
    }
    // Daromad bu yerda o'qilmaydi — recomputeAdMetrics uni to'g'ridan-to'g'ri
    // `leads` dan oladi. Bitta manba: ikki joyda hisoblanmasin.
    const cutoff = lead.won_at ?? new Date().toISOString();

    // 1) Ilgari shu lid tegib o'tgan reklamalarni eslab qolamiz.
    //
    // Ular "ayirilmaydi" — metrikalar mutlaq qayta hisoblanadi. Lekin ro'yxat
    // baribir kerak: lid yo'lidan CHIQIB KETGAN reklama ham qayta hisoblanishi
    // shart, aks holda u o'zining eski daromadini saqlab qoladi.
    const priorRes = await client.query<{ ad_id: string | null }>(
      `SELECT ad_id
         FROM touchpoints
        WHERE workspace_id = $1 AND lead_id = $2 AND attribution_weight IS NOT NULL`,
      [workspaceId, leadId]
    );
    const priorAdIds = uniqueAdIds(priorRes.rows);

    // Eski og'irliklarni tozalaymiz — qisqargan yo'l eskisini saqlamasin.
    await client.query(
      `UPDATE touchpoints SET attribution_weight = NULL
         WHERE workspace_id = $1 AND lead_id = $2`,
      [workspaceId, leadId]
    );

    // 1.5) YETIM TOUCHPOINT'LARNI BOG'LASH.
    //
    // Odatiy ketma-ketlik: odam reklamani bosadi → piksel touchpoint yozadi,
    // lekin lid hali CRM'da YO'Q, shuning uchun lead_id NULL bo'lib qoladi.
    // Keyin amoCRM webhook'i lidni yaratadi. Ilgari bu ikkisini biriktiradigan
    // kod umuman yo'q edi — natijada har lid uchun 0 ta touchpoint topilardi
    // va reklamaga hech qachon daromad yozilmasdi.
    //
    // Endi lid o'z fbclid'i bo'yicha yetimlarni o'ziga oladi.
    if (lead.fbclid) {
      await client.query(
        `UPDATE touchpoints
            SET lead_id = $1
          WHERE workspace_id = $2 AND fbclid = $3 AND lead_id IS NULL`,
        [leadId, workspaceId, lead.fbclid]
      );
    }

    // 2) Find touchpoints for this lead before the conversion, oldest first.
    const tpRes = await client.query<Touchpoint>(
      `SELECT id, ad_id, adset_id, campaign_id, occurred_at, touch_number
         FROM touchpoints
        WHERE workspace_id = $1 AND lead_id = $2
          AND (occurred_at IS NULL OR occurred_at < $3)
        ORDER BY occurred_at ASC NULLS LAST, created_at ASC`,
      [workspaceId, leadId, cutoff]
    );
    const tps = tpRes.rows;

    // Touchpoint yo'q — piksel ishlamagan yoki fbclid yo'qolgan.
    // Bu NORMAL holat, chunki §5 bo'yicha asosiy kalit UTM, piksel emas.
    //
    // ⚠ MUHIM: bu yerda daromadni to'g'ridan-to'g'ri ads'ga yozib bo'lmaydi.
    // Butun idempotentlik kafolati "oldingi hissa touchpoints.attribution_weight
    // da yozilgan" degan shartga tayanadi. Agar hissa hech qayerda yozilmasa,
    // ikkinchi chaqiruvda 1-qadam (reverse) uni topolmaydi va daromad IKKI
    // MARTA qo'shiladi.
    //
    // Shuning uchun UTM mosligi uchun touchpoint YARATAMIZ. U soxta emas:
    // "bu lid shu reklamadan keldi" — bu aynan touchpoint ma'nosi. Shundan
    // keyin butun oqim bitta mexanizm bilan ishlaydi va reverse to'g'ri yuradi.
    if (tps.length === 0) {
      // §3.1: bog'lanish kaliti kodda qotirilmaydi — konfiguratsiyadan.
      // Shu tranzaksiyaning klienti bilan o'qiladi (yuqoridagi sabab).
      const cfg = await client.query<{ attribution_key: string }>(
        `SELECT COALESCE(attribution_key, 'utm_term') AS attribution_key
           FROM workspaces WHERE id = $1`,
        [workspaceId]
      );
      const attributionKey = cfg.rows[0]?.attribution_key ?? 'utm_term';

      // ⚠ `client` UZATILISHI SHART. Bu chaqiruv OCHIQ TRANZAKSIYA
      // ichida turibdi; serverless'da pool `max: 1`, ya'ni yagona
      // ulanish shu tranzaksiyada. `pool.query` bo'lsa u bo'sh ulanish
      // kutadi va 10 soniyadan keyin timeout beradi.
      //
      // Bu real xato edi: importda 14 ta yutilgan lidning hammasi shu
      // yerda yiqildi va atribusiyasiz qoldi.
      const m = await matchLeadToAd(
        workspaceId,
        {
          utmTerm: lead.utm_term,
          utmContent: lead.utm_content,
          utmCampaign: lead.utm_campaign,
          fbclid: lead.fbclid,
          phoneHash: lead.phone_hash,
          emailHash: lead.email_hash,
        },
        attributionKey,
        client
      );

      if (m.note) console.warn(`attribution [${leadId}]: ${m.note}`);

      if (!m.adId) {
        // Bog'lanmadi — atribusiyasiz lid. Tafovut hisobida ko'rinadi.
        await client.query(
          `UPDATE leads
             SET first_click_ad_id = NULL, last_click_ad_id = NULL,
                 total_touches = 0, deal_time_days = $1, match_method = NULL
           WHERE id = $2 AND workspace_id = $3`,
          [dealTimeFromLead(lead), leadId, workspaceId]
        );
        // Lid endi hech qaysi reklamaga tegmaydi — ilgari tekkanlari
        // o'zining eski daromadini saqlab qolmasin.
        await recomputeAdMetrics(client, workspaceId, priorAdIds);
        await client.query('COMMIT');
        return { touches: 0, firstAdId: null, lastAdId: null };
      }

      const tpIns = await client.query<{ id: string }>(
        `INSERT INTO touchpoints
           (workspace_id, lead_id, ad_id, adset_id, campaign_id,
            event_type, touch_number, attribution_weight, fbclid, occurred_at)
         VALUES ($1,$2,$3,$4,$5,'lead',1,1.0,$6, COALESCE($7::timestamptz, now()))
         RETURNING id`,
        [workspaceId, leadId, m.adId, m.adsetId, m.campaignId, lead.fbclid, lead.crm_created_at]
      );

      await client.query(
        `UPDATE leads
           SET first_click_ad_id = $1, last_click_ad_id = $1,
               total_touches = 1, deal_time_days = $2, match_method = $3
         WHERE id = $4 AND workspace_id = $5`,
        [m.adId, dealTimeFromLead(lead), m.method, leadId, workspaceId]
      );

      // Og'irlik 1.0 — last-click. Daromad va sotuv bitta reklamaga to'liq
      // ketadi, ya'ni purchases_count ham to'g'ri (0.2-band shu bilan yopiladi).
      await recomputeAdMetrics(client, workspaceId, [...new Set([...priorAdIds, m.adId])]);

      await client.query('COMMIT');
      void tpIns;
      return { touches: 1, firstAdId: m.adId, lastAdId: m.adId };
    }

    // 3) Models + lead update.
    const firstAdId = firstClickAttribution(tps);
    const lastAdId = lastClickAttribution(tps);
    const weights = computeWeights(tps, model);

    for (const tp of tps) {
      await client.query(
        `UPDATE touchpoints SET attribution_weight = $1 WHERE id = $2 AND workspace_id = $3`,
        [weights.get(tp.id) ?? 0, tp.id, workspaceId]
      );
    }
    // Re-read the persisted (rounded) weights so revenue distribution uses the
    // exact same values a later reverse pass will read — keeps reprocess idempotent.
    const storedRes = await client.query<{ ad_id: string | null; weight: string }>(
      `SELECT ad_id, attribution_weight AS weight
         FROM touchpoints
        WHERE workspace_id = $1 AND lead_id = $2 AND attribution_weight IS NOT NULL`,
      [workspaceId, leadId]
    );

    let dealTimeDays: number | null = null;
    const firstOccurred = tps[0].occurred_at;
    if (lead.won_at && firstOccurred) {
      const ms = new Date(lead.won_at).getTime() - new Date(firstOccurred).getTime();
      dealTimeDays = Math.max(0, Math.floor(ms / 86_400_000));
    }

    await client.query(
      `UPDATE leads
         SET first_click_ad_id = $1, last_click_ad_id = $2,
             total_touches = $3, deal_time_days = $4,
             match_method = COALESCE(match_method, 'fbclid')
       WHERE id = $5 AND workspace_id = $6`,
      [firstAdId, lastAdId, tps.length, dealTimeDays, leadId, workspaceId]
    );

    // 4) Ta'sirlangan reklamalarni qayta hisoblaymiz — eskilari ham, yangilari
    //    ham. Yig'indi lidlardan olinadi, shuning uchun necha marta
    //    chaqirilgani ahamiyatsiz.
    await recomputeAdMetrics(client, workspaceId, [
      ...new Set([...priorAdIds, ...uniqueAdIds(storedRes.rows)]),
    ]);

    await client.query('COMMIT');
    return { touches: tps.length, firstAdId, lastAdId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------- touchpoint recording ----------

export interface RecordTouchpointData {
  workspaceId: string;
  fbclid?: string | null;
  adId?: string | null;
  adsetId?: string | null;
  campaignId?: string | null;
  eventType: 'view' | 'click' | 'lead' | 'purchase';
  fbEventId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  occurredAt?: string | null;
  emailHash?: string | null;
  phoneHash?: string | null;
}

/**
 * Record a touchpoint, linking it to an existing lead (matched by fbclid, then
 * by hashed email/phone) and assigning the next touch_number in that path.
 */
export async function recordTouchpoint(data: RecordTouchpointData): Promise<{ id: string }> {
  // Find a lead already associated with this fbclid via a prior touchpoint.
  let leadId: string | null = null;
  if (data.fbclid) {
    const found = await pool.query<{ lead_id: string | null }>(
      `SELECT lead_id FROM touchpoints
        WHERE workspace_id = $1 AND fbclid = $2 AND lead_id IS NOT NULL
        ORDER BY occurred_at DESC NULLS LAST LIMIT 1`,
      [data.workspaceId, data.fbclid]
    );
    leadId = found.rows[0]?.lead_id ?? null;
  }

  // Fall back to matching a lead by hashed email/phone (CRM-sourced leads).
  if (!leadId && (data.emailHash || data.phoneHash)) {
    const found = await pool.query<{ id: string }>(
      `SELECT id FROM leads
        WHERE workspace_id = $1
          AND ( ($2::text IS NOT NULL AND email_hash = $2)
             OR ($3::text IS NOT NULL AND phone_hash = $3) )
        ORDER BY created_at DESC LIMIT 1`,
      [data.workspaceId, data.emailHash ?? null, data.phoneHash ?? null]
    );
    leadId = found.rows[0]?.id ?? null;
  }

  // Next touch_number within the path (per lead, else per fbclid).
  let touchNumber = 1;
  if (leadId) {
    const r = await pool.query<{ max: number | null }>(
      `SELECT MAX(touch_number) AS max FROM touchpoints WHERE workspace_id = $1 AND lead_id = $2`,
      [data.workspaceId, leadId]
    );
    touchNumber = (r.rows[0]?.max ?? 0) + 1;
  } else if (data.fbclid) {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM touchpoints WHERE workspace_id = $1 AND fbclid = $2`,
      [data.workspaceId, data.fbclid]
    );
    touchNumber = Number(r.rows[0]?.count ?? 0) + 1;
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO touchpoints
       (workspace_id, lead_id, ad_id, adset_id, campaign_id, event_type,
        touch_number, fbclid, fb_event_id, ip_hash, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11::timestamptz, now()))
     RETURNING id`,
    [
      data.workspaceId,
      leadId,
      data.adId ?? null,
      data.adsetId ?? null,
      data.campaignId ?? null,
      data.eventType,
      touchNumber,
      data.fbclid ?? null,
      data.fbEventId ?? null,
      data.ipHash ?? null,
      data.occurredAt ?? null,
    ]
  );
  return inserted.rows[0];
}
