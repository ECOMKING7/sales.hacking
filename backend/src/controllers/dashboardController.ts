import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { cacheGet, cacheSet, overviewCacheKey } from '../utils/cache';

// ---------- helpers ----------

interface DateRange {
  from: string; // ISO
  to: string; // ISO
}

function parseRange(req: Request): DateRange {
  const now = new Date();
  const toRaw = req.query.to ? new Date(String(req.query.to)) : now;
  const to = isNaN(toRaw.getTime()) ? now : toRaw;
  const fromRaw = req.query.from
    ? new Date(String(req.query.from))
    : new Date(to.getTime() - 30 * 86_400_000);
  const from = isNaN(fromRaw.getTime()) ? new Date(to.getTime() - 30 * 86_400_000) : fromRaw;
  return { from: from.toISOString(), to: to.toISOString() };
}

function previousRange(range: DateRange): DateRange {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const span = toMs - fromMs;
  return {
    from: new Date(fromMs - span).toISOString(),
    to: range.from,
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function paginate(req: Request): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

// Whitelists guard against SQL injection on dynamic ORDER BY.
const ENTITY_SORTS: Record<string, string> = {
  name: 'name',
  spend: 'spend',
  clicks: 'clicks',
  leads: 'leads_count',
  purchases: 'purchases_count',
  revenue: 'revenue',
  roas: 'roas',
};

const TOP_METRICS: Record<string, string> = {
  roas: 'roas',
  revenue: 'revenue',
  sales: 'purchases_count',
};

function ws(req: Request): string | null {
  return req.user?.workspaceId ?? null;
}

// Shared SELECT for campaign/adset/ad list rows.
function entitySelect(table: 'campaigns' | 'adsets' | 'ads'): string {
  const extra =
    table === 'ads'
      ? ', thumbnail_url AS "thumbnailUrl", creative_type AS "creativeType"'
      : '';
  return `
    SELECT id, name, status,
           spend,
           clicks,
           impressions,
           (spend / NULLIF(clicks, 0))            AS cpc,
           (spend / NULLIF(impressions, 0) * 1000) AS cpm,
           (clicks::numeric / NULLIF(impressions, 0) * 100) AS ctr,
           leads_count                             AS leads,
           (spend / NULLIF(leads_count, 0))        AS "costPerLead",
           purchases_count                         AS purchases,
           (spend / NULLIF(purchases_count, 0))    AS "costPerPurchase",
           revenue,
           roas${extra}
    FROM ${table}`;
}

// ---------- GET /api/dashboard/overview ----------
export async function overview(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const range = parseRange(req);

  const key = overviewCacheKey(workspaceId, range.from, range.to);
  const cached = await cacheGet(key);
  if (cached) {
    res.json({ ...cached, cached: true });
    return;
  }

  const prev = previousRange(range);
  try {
    const spendQ = pool.query(
      `SELECT COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(clicks),0) AS clicks
         FROM campaigns WHERE workspace_id = $1`,
      [workspaceId]
    );
    const wonQ = pool.query(
      `SELECT COUNT(*) AS won, COALESCE(SUM(revenue),0) AS revenue, AVG(deal_time_days) AS deal_time
         FROM leads
        WHERE workspace_id = $1 AND status = 'won' AND won_at >= $2 AND won_at < $3`,
      [workspaceId, range.from, range.to]
    );
    const totalLeadsQ = pool.query(
      `SELECT COUNT(*) AS total
         FROM leads
        WHERE workspace_id = $1
          AND COALESCE(crm_created_at, created_at) >= $2
          AND COALESCE(crm_created_at, created_at) < $3`,
      [workspaceId, range.from, range.to]
    );
    const prevQ = pool.query(
      `SELECT COALESCE(SUM(revenue),0) AS revenue
         FROM leads
        WHERE workspace_id = $1 AND status = 'won' AND won_at >= $2 AND won_at < $3`,
      [workspaceId, prev.from, prev.to]
    );
    const sourceQ = pool.query(
      `SELECT
         COALESCE(SUM(revenue) FILTER (WHERE first_click_ad_id IS NOT NULL),0) AS meta,
         COALESCE(SUM(revenue) FILTER (WHERE first_click_ad_id IS NULL),0)     AS direct
       FROM leads
       WHERE workspace_id = $1 AND status = 'won' AND won_at >= $2 AND won_at < $3`,
      [workspaceId, range.from, range.to]
    );

    const [spendR, wonR, totalR, prevR, sourceR] = await Promise.all([
      spendQ,
      wonQ,
      totalLeadsQ,
      prevQ,
      sourceQ,
    ]);

    const amountSpent = num(spendR.rows[0].spend);
    const revenue = num(wonR.rows[0].revenue);
    const wonCount = num(wonR.rows[0].won);
    const totalLeads = num(totalR.rows[0].total);
    const prevRevenue = num(prevR.rows[0].revenue);

    const payload = {
      amountSpent,
      revenue,
      roas: amountSpent > 0 ? revenue / amountSpent : 0,
      cac: wonCount > 0 ? amountSpent / wonCount : 0,
      conversionRate: totalLeads > 0 ? (wonCount / totalLeads) * 100 : 0,
      dealTime: num(wonR.rows[0].deal_time),
      arpl: totalLeads > 0 ? revenue / totalLeads : 0,
      revenueGrowth:
        prevRevenue > 0
          ? ((revenue - prevRevenue) / prevRevenue) * 100
          : revenue > 0
            ? 100
            : 0,
      revenueBySource: {
        metaAds: num(sourceR.rows[0].meta),
        direct: num(sourceR.rows[0].direct),
        igOrganic: 0,
        fbOrganic: 0,
      },
      range,
    };

    await cacheSet(key, payload, 300); // 5 minutes
    res.json(payload);
  } catch (err) {
    console.error('overview error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load overview' });
  }
}

// ---------- GET /api/dashboard/campaigns ----------
export async function campaigns(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { limit, offset, page } = paginate(req);

  const sortKey = String(req.query.sort ?? 'spend');
  const sortCol = ENTITY_SORTS[sortKey] ?? 'spend';
  const order = String(req.query.order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const params: unknown[] = [workspaceId];
  let where = 'WHERE workspace_id = $1';
  if (req.query.status) {
    params.push(String(req.query.status));
    where += ` AND status = $${params.length}`;
  }
  params.push(limit, offset);

  try {
    const rows = await pool.query(
      `${entitySelect('campaigns')} ${where}
        ORDER BY ${sortCol} ${order} NULLS LAST
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const totalR = await pool.query(
      `SELECT COUNT(*) AS total FROM campaigns ${where}`,
      params.slice(0, params.length - 2)
    );
    res.json({ data: rows.rows, page, limit, total: num(totalR.rows[0].total) });
  } catch (err) {
    console.error('campaigns error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load campaigns' });
  }
}

// ---------- GET /api/dashboard/campaigns/:id/adsets ----------
export async function campaignAdsets(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { limit, offset, page } = paginate(req);
  const campaignId = String(req.params.id);

  const sortCol = ENTITY_SORTS[String(req.query.sort ?? 'spend')] ?? 'spend';
  const order = String(req.query.order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  try {
    const rows = await pool.query(
      `${entitySelect('adsets')}
        WHERE workspace_id = $1 AND campaign_id = $2
        ORDER BY ${sortCol} ${order} NULLS LAST
        LIMIT $3 OFFSET $4`,
      [workspaceId, campaignId, limit, offset]
    );
    const totalR = await pool.query(
      `SELECT COUNT(*) AS total FROM adsets WHERE workspace_id = $1 AND campaign_id = $2`,
      [workspaceId, campaignId]
    );
    res.json({ data: rows.rows, page, limit, total: num(totalR.rows[0].total) });
  } catch (err) {
    console.error('campaignAdsets error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load adsets' });
  }
}

// ---------- GET /api/dashboard/adsets/:id/ads ----------
export async function adsetAds(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { limit, offset, page } = paginate(req);
  const adsetId = String(req.params.id);

  const sortCol = ENTITY_SORTS[String(req.query.sort ?? 'spend')] ?? 'spend';
  const order = String(req.query.order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  try {
    const rows = await pool.query(
      `${entitySelect('ads')}
        WHERE workspace_id = $1 AND adset_id = $2
        ORDER BY ${sortCol} ${order} NULLS LAST
        LIMIT $3 OFFSET $4`,
      [workspaceId, adsetId, limit, offset]
    );
    const totalR = await pool.query(
      `SELECT COUNT(*) AS total FROM ads WHERE workspace_id = $1 AND adset_id = $2`,
      [workspaceId, adsetId]
    );
    res.json({ data: rows.rows, page, limit, total: num(totalR.rows[0].total) });
  } catch (err) {
    console.error('adsetAds error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load ads' });
  }
}

// ---------- top-N helpers ----------
async function topEntities(
  req: Request,
  res: Response,
  table: 'campaigns' | 'adsets' | 'ads'
): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const metricCol = TOP_METRICS[String(req.query.metric ?? 'roas')] ?? 'roas';
  try {
    const rows = await pool.query(
      `${entitySelect(table)}
        WHERE workspace_id = $1
        ORDER BY ${metricCol} DESC NULLS LAST
        LIMIT 5`,
      [workspaceId]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    console.error(`top ${table} error:`, (err as Error).message);
    res.status(500).json({ error: 'Failed to load top entities' });
  }
}

export const topCampaigns = (req: Request, res: Response) => topEntities(req, res, 'campaigns');
export const topAdsets = (req: Request, res: Response) => topEntities(req, res, 'adsets');
export const topAds = (req: Request, res: Response) => topEntities(req, res, 'ads');

// ---------- GET /api/dashboard/won-deals ----------
export async function wonDeals(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { limit, offset, page } = paginate(req);
  const range = parseRange(req);

  const params: unknown[] = [workspaceId, range.from, range.to];
  let where = `WHERE l.workspace_id = $1 AND l.status = 'won' AND l.won_at >= $2 AND l.won_at < $3`;

  if (req.query.search) {
    const term = `%${String(req.query.search)}%`;
    params.push(term);
    where += ` AND (l.crm_contact_id ILIKE $${params.length} OR l.crm_lead_id ILIKE $${params.length})`;
  }
  params.push(limit, offset);

  try {
    const rows = await pool.query(
      `SELECT
         l.id,
         COALESCE(l.crm_contact_id, l.crm_lead_id) AS "customerName",
         CASE WHEN l.first_click_ad_id IS NOT NULL THEN 'Meta Ads' ELSE 'Direct' END AS source,
         c.name  AS "campaignName",
         s.name  AS "adsetName",
         a.name  AS "adName",
         l.revenue,
         l.deal_time_days AS "dealTime",
         l.won_at AS "wonAt"
       FROM leads l
       LEFT JOIN ads a       ON a.id = l.first_click_ad_id
       LEFT JOIN adsets s    ON s.id = a.adset_id
       LEFT JOIN campaigns c ON c.id = a.campaign_id
       ${where}
       ORDER BY l.won_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const totalR = await pool.query(
      `SELECT COUNT(*) AS total FROM leads l ${where}`,
      params.slice(0, params.length - 2)
    );
    res.json({ data: rows.rows, page, limit, total: num(totalR.rows[0].total) });
  } catch (err) {
    console.error('wonDeals error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load won deals' });
  }
}

// ---------- GET /api/dashboard/leads/:id ----------
export async function leadDetail(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const leadId = String(req.params.id);

  try {
    const leadR = await pool.query(
      `SELECT id, status, revenue, total_touches, deal_time_days, won_at, created_at
         FROM leads WHERE id = $1 AND workspace_id = $2`,
      [leadId, workspaceId]
    );
    if (!leadR.rowCount) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const tpR = await pool.query(
      `SELECT t.id, t.event_type AS "eventType", t.touch_number AS "touchNumber",
              t.attribution_weight AS "attributionWeight",
              t.occurred_at AS "occurredAt",
              a.name AS "adName", c.name AS "campaignName"
         FROM touchpoints t
         LEFT JOIN ads a       ON a.id = t.ad_id
         LEFT JOIN campaigns c ON c.id = t.campaign_id
        WHERE t.workspace_id = $1 AND t.lead_id = $2
        ORDER BY t.occurred_at ASC NULLS LAST, t.created_at ASC`,
      [workspaceId, leadId]
    );

    const journey = tpR.rows;
    res.json({
      lead: leadR.rows[0],
      journey,
      clicks: journey.filter((t) => t.eventType === 'click'),
      purchases: journey.filter((t) => t.eventType === 'purchase'),
    });
  } catch (err) {
    console.error('leadDetail error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load lead' });
  }
}

// ---------- GET /api/dashboard/won-deals/export (protected + plan-gated) ----------
export async function exportWonDeals(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const range = parseRange(req);
  try {
    const rows = await pool.query(
      `SELECT
         COALESCE(l.crm_contact_id, l.crm_lead_id) AS customer,
         CASE WHEN l.first_click_ad_id IS NOT NULL THEN 'Meta Ads' ELSE 'Direct' END AS source,
         c.name AS campaign, s.name AS adset, a.name AS ad,
         l.revenue, l.deal_time_days, l.won_at
       FROM leads l
       LEFT JOIN ads a       ON a.id = l.first_click_ad_id
       LEFT JOIN adsets s    ON s.id = a.adset_id
       LEFT JOIN campaigns c ON c.id = a.campaign_id
       WHERE l.workspace_id = $1 AND l.status = 'won' AND l.won_at >= $2 AND l.won_at < $3
       ORDER BY l.won_at DESC`,
      [workspaceId, range.from, range.to]
    );
    const header = ['Customer', 'Source', 'Campaign', 'Ad Set', 'Ad', 'Revenue', 'Deal Time (days)', 'Won At'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      header.join(','),
      ...rows.rows.map((r) =>
        [r.customer, r.source, r.campaign, r.adset, r.ad, r.revenue, r.deal_time_days, r.won_at]
          .map(esc)
          .join(',')
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="won-deals.csv"');
    res.status(200).send(csv);
  } catch (err) {
    console.error('exportWonDeals error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to export' });
  }
}
