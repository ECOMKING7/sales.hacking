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
  results: 'results',
  costPerResult: 'cost_per_result',
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
           -- Natija maqsadga bog'liq: lid, sotuv, klik... Sync hisoblab qo'ygan.
           objective,
           result_type                             AS "resultType",
           results,
           cost_per_result                         AS "costPerResult",
           revenue,
           roas,
           -- Facebook'ning O'Z daromad raqami (piksel nima ko'rgan);
           -- revenue esa CRM haqiqati. Ikkalasi yonma-yon tursin —
           -- farqi tafovut metrikasi bo'ladi (§7).
           fb_revenue                              AS "fbRevenue"${extra}
    FROM ${table}`;
}

/**
 * Jadval ostidagi "jami" qatori — Ads Manager'dagi kabi.
 *
 * MUHIM: o'rtacha qiymatli ustunlar (CPC, CPM, CTR, cost per result)
 * QO'SHILMAYDI va o'rtacha ham olinmaydi — ular jamidan qayta hisoblanadi.
 * "Cost per result" larning o'rtachasi noto'g'ri raqam beradi: $1 ga 500 lid
 * va $10 ga 1 lid bo'lsa, haqiqiy o'rtacha $1.02, sodda o'rtacha esa $5.50.
 *
 * `resultType` faqat hamma qator bir xil natija turida bo'lsagina to'ldiriladi.
 * Aralash bo'lsa (lid + qo'ng'iroq + sotuv) — null, chunki "642 nima?" degan
 * savolga javob yo'q. UI bunda "natija" deb umumiy yozadi.
 */
function totalsSelect(table: 'campaigns' | 'adsets' | 'ads'): string {
  return `
    SELECT COUNT(*)                                   AS "rowCount",
           COALESCE(SUM(spend), 0)                    AS spend,
           COALESCE(SUM(clicks), 0)                   AS clicks,
           COALESCE(SUM(impressions), 0)              AS impressions,
           COALESCE(SUM(leads_count), 0)              AS leads,
           COALESCE(SUM(purchases_count), 0)          AS purchases,
           COALESCE(SUM(results), 0)                  AS results,
           COALESCE(SUM(revenue), 0)                  AS revenue,
           COALESCE(SUM(fb_revenue), 0)               AS "fbRevenue",
           SUM(spend) / NULLIF(SUM(clicks), 0)              AS cpc,
           SUM(spend) / NULLIF(SUM(impressions), 0) * 1000  AS cpm,
           SUM(clicks)::numeric / NULLIF(SUM(impressions), 0) * 100 AS ctr,
           SUM(spend) / NULLIF(SUM(leads_count), 0)         AS "costPerLead",
           SUM(spend) / NULLIF(SUM(purchases_count), 0)     AS "costPerPurchase",
           SUM(spend) / NULLIF(SUM(results), 0)             AS "costPerResult",
           SUM(revenue) / NULLIF(SUM(spend), 0)             AS roas,
           CASE WHEN COUNT(DISTINCT result_type) = 1
                THEN MIN(result_type) END              AS "resultType"
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
    // Jami qator butun ro'yxat bo'yicha hisoblanadi, ko'rinib turgan sahifa
    // bo'yicha emas — 2-sahifaga o'tganda "jami" o'zgarib ketmasligi kerak.
    const totalR = await pool.query(
      `${totalsSelect('campaigns')} ${where}`,
      params.slice(0, params.length - 2)
    );
    const t = totalR.rows[0];
    res.json({ data: rows.rows, page, limit, total: num(t.rowCount), totals: t });
  } catch (err) {
    console.error('campaigns error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load campaigns' });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   KO'P TANLASH — Ads Manager naqshi

   Ads Manager'da kampaniya tanlanadi → "Ad sets" yorlig'i FAQAT o'sha
   kampaniyalarning ad set'larini ko'rsatadi → ular tanlanadi → "Ads"
   yorlig'i faqat o'sha ad set'larning reklamalarini ko'rsatadi.

   Eski `/campaigns/:id/adsets` bitta ota-onaga bog'langan edi. Bu ikki
   endpoint ro'yxat qabul qiladi. Ro'yxat bo'sh bo'lsa — filtr yo'q, hammasi
   qaytadi (Ads Manager ham shunday: hech narsa tanlanmagan bo'lsa hammasi).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * "a,b,c" → ['a','b','c']. UUID bo'lmaganlari tashlanadi: so'rov
 * parametrlashtirilgan bo'lsa ham, buzuq qiymat Postgres'da cast xatosiga
 * olib keladi va 500 qaytaradi — foydalanuvchi uchun tushunarsiz.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idList(v: unknown): string[] {
  return String(v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => UUID_RE.test(x))
    .slice(0, 500);
}

async function listEntities(
  req: Request,
  res: Response,
  table: 'adsets' | 'ads',
  parents: Array<{ column: string; query: string }>
): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { limit, offset, page } = paginate(req);
  const sortCol = ENTITY_SORTS[String(req.query.sort ?? 'spend')] ?? 'spend';
  const order = String(req.query.order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const params: unknown[] = [workspaceId];
  let where = 'WHERE workspace_id = $1';

  // Eng aniq filtr yutadi: ad set tanlangan bo'lsa kampaniya filtri ortiqcha.
  for (const p of parents) {
    const ids = idList(req.query[p.query]);
    if (ids.length === 0) continue;
    params.push(ids);
    where += ` AND ${p.column} = ANY($${params.length}::uuid[])`;
    break;
  }

  const listParams = [...params, limit, offset];

  try {
    const rows = await pool.query(
      `${entitySelect(table)} ${where}
        ORDER BY ${sortCol} ${order} NULLS LAST
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    const totalR = await pool.query(`${totalsSelect(table)} ${where}`, params);
    const t = totalR.rows[0];
    res.json({ data: rows.rows, page, limit, total: num(t.rowCount), totals: t });
  } catch (err) {
    console.error(`${table} error:`, (err as Error).message);
    res.status(500).json({ error: `Failed to load ${table}` });
  }
}

/**
 * GET /api/dashboard/entity-ids?level=campaigns|adsets|ads&campaignIds=&adsetIds=
 *
 * Joriy filtrga mos HAMMA element id va nomini qaytaradi — sahifalashsiz.
 *
 * Nima uchun kerak: jadval bir vaqtda 50 qator ko'rsatadi, sarlavhadagi
 * katakcha faqat o'shalarni belgilaydi. "Barcha 247 tasini tanlash" tugmasi
 * esa ro'yxatning qolganini ham olishi kerak — lekin butun qatorni (spend,
 * revenue, thumbnail...) tortib kelish ortiqcha. Faqat id va nom keladi.
 *
 * Chegara 5000: undan katta ro'yxatda "hammasini tanlash" baribir ma'nosiz,
 * va javob hajmi brauzerni cho'ktiradi.
 */
export async function entityIds(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const levelRaw = String(req.query.level ?? 'campaigns');
  const table: 'campaigns' | 'adsets' | 'ads' =
    levelRaw === 'adsets' ? 'adsets' : levelRaw === 'ads' ? 'ads' : 'campaigns';

  const params: unknown[] = [workspaceId];
  let where = 'WHERE workspace_id = $1';

  if (table !== 'campaigns') {
    const parents =
      table === 'adsets'
        ? [{ column: 'campaign_id', query: 'campaignIds' }]
        : [
            { column: 'adset_id', query: 'adsetIds' },
            { column: 'campaign_id', query: 'campaignIds' },
          ];
    for (const p of parents) {
      const ids = idList(req.query[p.query]);
      if (ids.length === 0) continue;
      params.push(ids);
      where += ` AND ${p.column} = ANY($${params.length}::uuid[])`;
      break;
    }
  }

  try {
    const { rows } = await pool.query<{ id: string; name: string | null }>(
      `SELECT id, name FROM ${table} ${where} ORDER BY spend DESC LIMIT 5000`,
      params
    );
    res.json({ ids: rows });
  } catch (err) {
    console.error('entityIds error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load ids' });
  }
}

/** GET /api/dashboard/adsets?campaignIds=a,b,c */
export function adsets(req: Request, res: Response): Promise<void> {
  return listEntities(req, res, 'adsets', [{ column: 'campaign_id', query: 'campaignIds' }]);
}

/** GET /api/dashboard/ads?adsetIds=a,b | ?campaignIds=a,b */
export function ads(req: Request, res: Response): Promise<void> {
  return listEntities(req, res, 'ads', [
    { column: 'adset_id', query: 'adsetIds' },
    { column: 'campaign_id', query: 'campaignIds' },
  ]);
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
      `${totalsSelect('adsets')} WHERE workspace_id = $1 AND campaign_id = $2`,
      [workspaceId, campaignId]
    );
    const t = totalR.rows[0];
    res.json({ data: rows.rows, page, limit, total: num(t.rowCount), totals: t });
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
      `${totalsSelect('ads')} WHERE workspace_id = $1 AND adset_id = $2`,
      [workspaceId, adsetId]
    );
    const t = totalR.rows[0];
    res.json({ data: rows.rows, page, limit, total: num(t.rowCount), totals: t });
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
