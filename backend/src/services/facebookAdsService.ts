import axios, { AxiosError } from 'axios';
import { pool } from '../db/pool';
import { decrypt } from '../utils/encryption';
import { GRAPH_URL as GRAPH } from '../config/graph';

const MAX_RETRIES = 3;
// campaign_id/adset_id/ad_id must be requested explicitly — Facebook does not
// include them by default, even though insightsMap() keys its results by them.
const INSIGHT_FIELDS =
  'campaign_id,adset_id,ad_id,spend,impressions,clicks,actions,action_values';

// Action types Facebook uses for leads / purchases (varies by pixel setup).
const LEAD_ACTIONS = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
];
const PURCHASE_ACTIONS = [
  'purchase',
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
];

export type DateRange =
  | { datePreset: string }
  | { since: string; until: string };

interface FbAction {
  action_type: string;
  value: string;
}

interface InsightRow {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: FbAction[];
  action_values?: FbAction[];
}

interface Metrics {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
}

// ---------- helpers ----------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumActions(actions: FbAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((acc, a) => acc + num(a.value), 0);
}

function metricsFromInsight(row: InsightRow | undefined): Metrics {
  if (!row) {
    return { spend: 0, impressions: 0, clicks: 0, leads: 0, purchases: 0, revenue: 0 };
  }
  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    leads: sumActions(row.actions, LEAD_ACTIONS),
    purchases: sumActions(row.actions, PURCHASE_ACTIONS),
    revenue: sumActions(row.action_values, PURCHASE_ACTIONS),
  };
}

function roasOf(revenue: number, spend: number): number | null {
  return spend > 0 ? revenue / spend : null;
}

function cacOf(spend: number, purchases: number): number | null {
  return purchases > 0 ? spend / purchases : null;
}

function dateParams(range: DateRange): Record<string, string> {
  if ('datePreset' in range) return { date_preset: range.datePreset };
  return { time_range: JSON.stringify({ since: range.since, until: range.until }) };
}

function normalizeActId(id: string): string {
  return id.startsWith('act_') ? id : `act_${id}`;
}

function fbErrorCode(err: AxiosError): number | undefined {
  const data = err.response?.data as { error?: { code?: number } } | undefined;
  return data?.error?.code;
}

function isRateLimit(err: AxiosError): boolean {
  if (err.response?.status === 429) return true;
  const code = fbErrorCode(err);
  // 4 = app rate limit, 17 = user rate limit, 32/613 = page/custom rate limits
  return code === 4 || code === 17 || code === 32 || code === 613;
}

// Ad-account "too many calls" (code 17) has a long cooldown — retrying within the
// same request only makes it worse, so we fail fast and let a later sync retry.
function isHardAccountLimit(err: AxiosError): boolean {
  return fbErrorCode(err) === 17;
}

/**
 * GET a Graph API node with exponential backoff on rate limits (max 3 retries).
 */
async function fbGet<T = unknown>(
  path: string,
  params: Record<string, string | number>
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await axios.get(`${GRAPH}/${path}`, { params });
      return res.data as T;
    } catch (e) {
      const err = e as AxiosError;
      // Fail fast on the ad-account hard limit — don't burn time retrying.
      if (isRateLimit(err) && !isHardAccountLimit(err) && attempt < MAX_RETRIES) {
        const backoff = 2 ** attempt * 1000; // 1s, 2s, 4s
        await sleep(backoff);
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

interface Paged<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

/**
 * Fetch every page of a cursor-paginated edge.
 */
async function fetchAll<T>(
  path: string,
  params: Record<string, string | number>,
  token: string
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  do {
    const page = await fbGet<Paged<T>>(path, {
      ...params,
      access_token: token,
      limit: 100,
      ...(after ? { after } : {}),
    });
    out.push(...(page.data ?? []));
    after = page.paging?.cursors?.after && page.paging?.next ? page.paging.cursors.after : undefined;
  } while (after);
  return out;
}

/**
 * Fetch insights for a node at a given level, returning a map keyed by the
 * level's id (campaign_id / adset_id / ad_id).
 */
async function insightsMap(
  node: string,
  level: 'campaign' | 'adset' | 'ad',
  token: string,
  range: DateRange
): Promise<Map<string, InsightRow>> {
  const rows = await fetchAll<InsightRow>(
    `${node}/insights`,
    { level, fields: INSIGHT_FIELDS, ...dateParams(range) },
    token
  );
  const key = `${level}_id` as 'campaign_id' | 'adset_id' | 'ad_id';
  const map = new Map<string, InsightRow>();
  for (const row of rows) {
    const id = row[key];
    if (id) map.set(id, row);
  }
  return map;
}

// ---------- entity types ----------

interface FbCampaign {
  id: string;
  name?: string;
  status?: string;
}
interface FbAdSet {
  id: string;
  name?: string;
  status?: string;
  campaign_id?: string;
}
interface FbCreative {
  thumbnail_url?: string;
  video_id?: string;
  object_story_spec?: {
    link_data?: { child_attachments?: unknown[] };
    video_data?: unknown;
  };
}
interface FbAd {
  id: string;
  name?: string;
  status?: string;
  adset_id?: string;
  campaign_id?: string;
  creative?: FbCreative;
}

function creativeType(creative?: FbCreative): string | null {
  if (!creative) return null;
  if (creative.video_id || creative.object_story_spec?.video_data) return 'video';
  if (creative.object_story_spec?.link_data?.child_attachments) return 'carousel';
  return 'image';
}

// ---------- sync functions ----------

// All sync functions fetch at the AD-ACCOUNT level (one paginated call each)
// instead of per-entity, so a full sync is ~6 Graph calls total — avoids the
// "Ad Account Has Too Many API Calls" rate limit (error code 17).

export async function syncCampaigns(
  workspaceId: string,
  actId: string,
  token: string,
  range: DateRange
): Promise<Map<string, string>> {
  const campaigns = await fetchAll<FbCampaign>(
    `${actId}/campaigns`,
    { fields: 'id,name,status,objective,daily_budget,start_time', limit: 200 },
    token
  );
  const ins = await insightsMap(actId, 'campaign', token, range);

  const map = new Map<string, string>(); // fbCampaignId -> dbId
  for (const c of campaigns) {
    const m = metricsFromInsight(ins.get(c.id));
    const row = await pool.query<{ id: string }>(
      `INSERT INTO campaigns
         (workspace_id, fb_campaign_id, name, status, spend, impressions, clicks,
          leads_count, purchases_count, revenue, roas, cac, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (workspace_id, fb_campaign_id) DO UPDATE SET
          name=EXCLUDED.name, status=EXCLUDED.status, spend=EXCLUDED.spend,
          impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks,
          leads_count=EXCLUDED.leads_count, purchases_count=EXCLUDED.purchases_count,
          revenue=EXCLUDED.revenue, roas=EXCLUDED.roas, cac=EXCLUDED.cac,
          synced_at=now()
       RETURNING id`,
      [workspaceId, c.id, c.name ?? null, c.status ?? null, m.spend, m.impressions,
       m.clicks, m.leads, m.purchases, m.revenue, roasOf(m.revenue, m.spend),
       cacOf(m.spend, m.purchases)]
    );
    map.set(c.id, row.rows[0].id);
  }
  return map;
}

export async function syncAdSets(
  workspaceId: string,
  actId: string,
  token: string,
  range: DateRange,
  campaignMap: Map<string, string>
): Promise<Map<string, { dbId: string; campaignDbId: string | null }>> {
  const adsets = await fetchAll<FbAdSet>(
    `${actId}/adsets`,
    { fields: 'id,name,status,campaign_id,daily_budget', limit: 200 },
    token
  );
  const ins = await insightsMap(actId, 'adset', token, range);

  const map = new Map<string, { dbId: string; campaignDbId: string | null }>();
  for (const a of adsets) {
    const campaignDbId = a.campaign_id ? campaignMap.get(a.campaign_id) ?? null : null;
    const m = metricsFromInsight(ins.get(a.id));
    const costPerLead = m.leads > 0 ? m.spend / m.leads : null;
    const row = await pool.query<{ id: string }>(
      `INSERT INTO adsets
         (workspace_id, campaign_id, fb_adset_id, name, status, spend, impressions,
          clicks, leads_count, purchases_count, revenue, roas, cost_per_lead, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
       ON CONFLICT (workspace_id, fb_adset_id) DO UPDATE SET
          campaign_id=EXCLUDED.campaign_id, name=EXCLUDED.name, status=EXCLUDED.status,
          spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks,
          leads_count=EXCLUDED.leads_count, purchases_count=EXCLUDED.purchases_count,
          revenue=EXCLUDED.revenue, roas=EXCLUDED.roas, cost_per_lead=EXCLUDED.cost_per_lead,
          synced_at=now()
       RETURNING id`,
      [workspaceId, campaignDbId, a.id, a.name ?? null, a.status ?? null, m.spend,
       m.impressions, m.clicks, m.leads, m.purchases, m.revenue,
       roasOf(m.revenue, m.spend), costPerLead]
    );
    map.set(a.id, { dbId: row.rows[0].id, campaignDbId });
  }
  return map;
}

export async function syncAds(
  workspaceId: string,
  actId: string,
  token: string,
  range: DateRange,
  adsetMap: Map<string, { dbId: string; campaignDbId: string | null }>,
  campaignMap: Map<string, string>
): Promise<number> {
  const ads = await fetchAll<FbAd>(
    `${actId}/ads`,
    {
      fields: 'id,name,status,adset_id,campaign_id,creative{thumbnail_url,video_id,object_story_spec}',
      limit: 200,
    },
    token
  );
  const ins = await insightsMap(actId, 'ad', token, range);

  for (const ad of ads) {
    const adsetInfo = ad.adset_id ? adsetMap.get(ad.adset_id) : undefined;
    const adsetDbId = adsetInfo?.dbId ?? null;
    const campaignDbId =
      (ad.campaign_id ? campaignMap.get(ad.campaign_id) : undefined) ??
      adsetInfo?.campaignDbId ??
      null;
    const m = metricsFromInsight(ins.get(ad.id));
    await pool.query(
      `INSERT INTO ads
         (workspace_id, adset_id, campaign_id, fb_ad_id, name, status, creative_type,
          thumbnail_url, spend, impressions, clicks, leads_count, purchases_count,
          revenue, roas, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
       ON CONFLICT (workspace_id, fb_ad_id) DO UPDATE SET
          adset_id=EXCLUDED.adset_id, campaign_id=EXCLUDED.campaign_id,
          name=EXCLUDED.name, status=EXCLUDED.status, creative_type=EXCLUDED.creative_type,
          thumbnail_url=EXCLUDED.thumbnail_url, spend=EXCLUDED.spend,
          impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks,
          leads_count=EXCLUDED.leads_count, purchases_count=EXCLUDED.purchases_count,
          revenue=EXCLUDED.revenue, roas=EXCLUDED.roas, synced_at=now()`,
      [workspaceId, adsetDbId, campaignDbId, ad.id, ad.name ?? null, ad.status ?? null,
       creativeType(ad.creative), ad.creative?.thumbnail_url ?? null, m.spend,
       m.impressions, m.clicks, m.leads, m.purchases, m.revenue,
       roasOf(m.revenue, m.spend)]
    );
  }
  return ads.length;
}

interface WorkspaceTokenRow {
  fb_ad_account_id: string | null;
  fb_access_token: string | null;
  fb_token_expires_at: string | null;
}

/**
 * Full sync for one workspace: campaigns → adsets → ads.
 * Token is read from the workspace owner's user row so that one Facebook
 * login covers all workspaces belonging to the same user.
 */
export async function syncWorkspace(
  workspaceId: string,
  range: DateRange = { datePreset: 'last_30d' }
): Promise<{ campaigns: number; adsets: number; ads: number }> {
  const wsRes = await pool.query<WorkspaceTokenRow>(
    `SELECT w.fb_ad_account_id,
            u.fb_access_token,
            u.fb_token_expires_at
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
      WHERE w.id = $1`,
    [workspaceId]
  );
  const ws = wsRes.rows[0];
  if (!ws) throw new Error('Workspace not found');
  if (!ws.fb_access_token) throw new Error('Facebook is not connected');
  if (!ws.fb_ad_account_id) throw new Error('No ad account selected');
  if (ws.fb_token_expires_at && new Date(ws.fb_token_expires_at).getTime() < Date.now()) {
    throw new Error('Facebook token expired — reconnect required');
  }

  const token = decrypt(ws.fb_access_token);
  const actId = normalizeActId(ws.fb_ad_account_id);

  // Account-level bulk sync: campaigns → adsets → ads (≈6 Graph calls total).
  const campaignMap = await syncCampaigns(workspaceId, actId, token, range);
  const adsetMap = await syncAdSets(workspaceId, actId, token, range, campaignMap);
  const adCount = await syncAds(workspaceId, actId, token, range, adsetMap, campaignMap);

  await pool.query(`UPDATE workspaces SET updated_at = now() WHERE id = $1`, [workspaceId]);

  return { campaigns: campaignMap.size, adsets: adsetMap.size, ads: adCount };
}
