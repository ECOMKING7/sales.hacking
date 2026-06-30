import { pool } from '../db/pool';
import { PoolClient } from 'pg';

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

interface PriorRow {
  ad_id: string;
  weight: number;
}

/** Sum per-ad weights from a list of {ad_id, weight}. */
function sumByAd(rows: Array<{ ad_id: string | null; weight: number }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.ad_id) continue;
    m.set(r.ad_id, (m.get(r.ad_id) ?? 0) + r.weight);
  }
  return m;
}

async function applyAdDelta(
  client: PoolClient,
  workspaceId: string,
  adId: string,
  revenueDelta: number,
  purchaseDelta: number
): Promise<void> {
  await client.query(
    `UPDATE ads
       SET purchases_count = GREATEST(purchases_count + $1, 0),
           revenue = GREATEST(revenue + $2, 0),
           roas = CASE WHEN spend > 0 THEN GREATEST(revenue + $2, 0) / spend ELSE roas END
     WHERE id = $3 AND workspace_id = $4`,
    [purchaseDelta, revenueDelta, adId, workspaceId]
  );
}

// ---------- core ----------

interface LeadRow {
  id: string;
  revenue: string;
  won_at: string | null;
  first_click_ad_id: string | null;
}

/**
 * Recompute attribution for one lead. Idempotent: re-running first reverses the
 * lead's previous contribution to ad metrics, then applies the fresh one.
 */
export async function processLeadAttribution(
  leadId: string,
  workspaceId: string,
  model: AttributionModel = 'time_decay'
): Promise<{ touches: number; firstAdId: string | null; lastAdId: string | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const leadRes = await client.query<LeadRow>(
      `SELECT id, revenue, won_at, first_click_ad_id
         FROM leads WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
      [leadId, workspaceId]
    );
    const lead = leadRes.rows[0];
    if (!lead) {
      await client.query('ROLLBACK');
      throw new Error('Lead not found');
    }
    const revenue = Number(lead.revenue) || 0;
    const cutoff = lead.won_at ?? new Date().toISOString();

    // 1) Reverse any previous attribution contribution for this lead.
    const priorRes = await client.query<PriorRow>(
      `SELECT ad_id, attribution_weight AS weight
         FROM touchpoints
        WHERE workspace_id = $1 AND lead_id = $2 AND attribution_weight IS NOT NULL`,
      [workspaceId, leadId]
    );
    const priorByAd = sumByAd(
      priorRes.rows.map((r) => ({ ad_id: r.ad_id, weight: Number(r.weight) }))
    );
    for (const [adId, w] of priorByAd) {
      await applyAdDelta(client, workspaceId, adId, -(revenue * w), -1);
    }
    // Clear old weights so a path that shrank doesn't keep stale ones.
    await client.query(
      `UPDATE touchpoints SET attribution_weight = NULL
         WHERE workspace_id = $1 AND lead_id = $2`,
      [workspaceId, leadId]
    );

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

    if (tps.length === 0) {
      await client.query(
        `UPDATE leads
           SET first_click_ad_id = NULL, last_click_ad_id = NULL,
               total_touches = 0, deal_time_days = NULL
         WHERE id = $1`,
        [leadId]
      );
      await client.query('COMMIT');
      return { touches: 0, firstAdId: null, lastAdId: null };
    }

    // 3) Models + lead update.
    const firstAdId = firstClickAttribution(tps);
    const lastAdId = lastClickAttribution(tps);
    const weights = computeWeights(tps, model);

    for (const tp of tps) {
      await client.query(
        `UPDATE touchpoints SET attribution_weight = $1 WHERE id = $2`,
        [weights.get(tp.id) ?? 0, tp.id]
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
             total_touches = $3, deal_time_days = $4
       WHERE id = $5`,
      [firstAdId, lastAdId, tps.length, dealTimeDays, leadId]
    );

    // 4) Distribute revenue/purchases to ads by the persisted weight.
    const freshByAd = sumByAd(
      storedRes.rows.map((r) => ({ ad_id: r.ad_id, weight: Number(r.weight) }))
    );
    for (const [adId, w] of freshByAd) {
      await applyAdDelta(client, workspaceId, adId, revenue * w, 1);
    }

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
