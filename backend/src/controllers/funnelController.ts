/* ═══════════════════════════════════════════════════════════════════════
   VORONKA — mahsulotning asosiy ekrani

   Ads Manager quyidagi zanjirning faqat BIRINCHI yarmini ko'radi:

     Reklama → xarajat → klik → natija │ lid → sifatli lid → sotuv → pul
     ─────────── Facebook biladi ──────┼──────── faqat CRM biladi ────────

   Bu endpoint ikkala yarmni bitta qatorga qo'yadi. Butun mahsulotning
   sababi shu: CPL bo'yicha eng arzon ko'ringan reklama ROAS bo'yicha eng
   yomoni bo'lib chiqishi mumkin, va Ads Manager buni hech qachon aytmaydi.

   Uchta savolga bir vaqtda javob beradi:
     1. Qaysi reklama PUL keltirdi           → revenue, CAC, ROAS
     2. Facebook va CRM raqami nega farq qiladi → tafovut %
     3. Qaysi reklama tez yopiladi            → deal time mediana / p90

   ⚠ Daromad `ads.revenue` dan EMAS, `leads` jadvalidan hisoblanadi.
     Sababi: Facebook sync `ads.revenue` ustunini o'zining raqami bilan
     qayta yozadi va CRM daromadi yo'qolardi. Lidlar jadvali sync'dan
     mustaqil.
   ═══════════════════════════════════════════════════════════════════════ */

import { Request, Response } from 'express';
import { pool } from '../db/pool';
import {
  loadCurrencyGuard,
  guardRoasAll,
  currencyMeta,
} from '../utils/currencyGuard';

type Level = 'campaigns' | 'adsets' | 'ads';

/** Qaysi darajada guruhlaymiz va ad qaysi ustun orqali bog'lanadi. */
const LEVELS: Record<Level, { table: string; adColumn: string }> = {
  campaigns: { table: 'campaigns', adColumn: 'campaign_id' },
  adsets: { table: 'adsets', adColumn: 'adset_id' },
  ads: { table: 'ads', adColumn: 'id' },
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Workspace'da demo (simulyatsiya qilingan) lid bormi.
 *
 * UI shu asosda butun ekran bo'ylab ogohlantirish chizig'ini chizadi.
 * Sababi oddiy: simulyatsiya raqamlarini kimgadir ko'rsatganda u ularni
 * real deb qabul qilmasligi kerak. Belgisiz demo — noto'g'ri taassurot,
 * va bu texnik emas, ishonch masalasi.
 */
export async function demoStatus(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM leads WHERE workspace_id = $1 AND is_demo = true`,
      [workspaceId]
    );
    const count = num(rows[0]?.n);
    res.json({ demo: count > 0, demoLeads: count });
  } catch (err) {
    // Fail-soft: banner chiqmagani sababli sahifa buzilmasin.
    console.error('demoStatus error:', (err as Error).message);
    res.json({ demo: false, demoLeads: 0 });
  }
}

export async function funnel(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const levelKey = String(req.query.level ?? 'campaigns') as Level;
  const level = LEVELS[levelKey] ? levelKey : 'campaigns';
  const { table, adColumn } = LEVELS[level];

  // "Qotgan lid" chegarasi. Keyinchalik akkaunt config'idan keladi
  // (config.qoidalar.qotgan_lid_kun); hozircha so'rov parametri.
  const stuckDays = Math.min(90, Math.max(1, parseInt(String(req.query.stuckDays ?? '7'), 10) || 7));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));

  try {
    // Valyuta qo'riqchisi: reklama akkaunti USD, CRM UZS bo'lsa
    // revenue/spend so'mni dollarga bo'ladi — ROAS chiqarilmaydi.
    const guard = await loadCurrencyGuard(workspaceId);

    const { rows } = await pool.query(
      `
      WITH lidlar AS (
        SELECT a.${adColumn} AS entity_id,
               COUNT(*)                                          AS leads,
               COUNT(*) FILTER (WHERE l.qualified_at IS NOT NULL) AS qualified,
               COUNT(*) FILTER (WHERE l.status = 'won')           AS won,
               COALESCE(SUM(l.revenue), 0)                        AS revenue,
               -- Mediana o'rtachadan ishonchliroq: bitta 90 kunlik bitim
               -- o'rtachani buzadi, medianaga ta'sir qilmaydi.
               percentile_cont(0.5) WITHIN GROUP (ORDER BY l.deal_time_days) AS deal_median,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY l.deal_time_days) AS deal_p90,
               COUNT(*) FILTER (
                 WHERE l.status = 'new'
                   AND l.crm_created_at < now() - ($2 || ' days')::interval
               )                                                  AS stuck
          FROM leads l
          JOIN ads a ON a.id = l.last_click_ad_id
         WHERE l.workspace_id = $1
           AND a.${adColumn} IS NOT NULL
         GROUP BY a.${adColumn}
      )
      SELECT e.id,
             e.name,
             e.status,
             e.spend,
             e.result_type                        AS "resultType",
             e.results                            AS "fbResults",
             COALESCE(g.leads, 0)                 AS leads,
             COALESCE(g.qualified, 0)             AS qualified,
             COALESCE(g.won, 0)                   AS won,
             COALESCE(g.revenue, 0)               AS revenue,
             COALESCE(g.stuck, 0)                 AS stuck,
             g.deal_median                        AS "dealMedian",
             g.deal_p90                           AS "dealP90",

             -- Bosqich narxlari. Nolga bo'linish NULLIF bilan yopilgan:
             -- lid bo'lmasa narx "cheksiz" emas, NULL — UI "—" chizadi.
             e.spend / NULLIF(g.leads, 0)         AS "cpl",
             e.spend / NULLIF(g.qualified, 0)     AS "cql",
             e.spend / NULLIF(g.won, 0)           AS "cac",
             g.revenue / NULLIF(e.spend, 0)       AS "roas",
             g.revenue / NULLIF(g.won, 0)         AS "aov",

             -- Bosqich konversiyalari
             g.qualified::numeric / NULLIF(g.leads, 0) * 100 AS "qualRate",
             g.won::numeric / NULLIF(g.qualified, 0) * 100   AS "closeRate",

             -- TAFOVUT: Facebook nechta natija dedi, CRM nechtasini ko'rdi.
             -- Musbat = yo'qotish. 10% dan yuqorisi tekshirishni talab qiladi.
             CASE WHEN e.results > 0
                  THEN (e.results - COALESCE(g.leads, 0))::numeric / e.results * 100
             END                                  AS "gapPct"
        FROM ${table} e
        LEFT JOIN lidlar g ON g.entity_id = e.id
       WHERE e.workspace_id = $1
         AND (e.spend > 0 OR g.leads > 0)
       ORDER BY e.spend DESC
       LIMIT $3
      `,
      [workspaceId, stuckDays, limit]
    );

    // Jami qatori — butun ro'yxat bo'yicha. O'rtacha ustunlar qo'shilmaydi,
    // jamidan qayta hisoblanadi (aks holda cost per X noto'g'ri chiqadi).
    const t = rows.reduce(
      (acc, r) => {
        acc.spend += num(r.spend);
        acc.fbResults += num(r.fbResults);
        acc.leads += num(r.leads);
        acc.qualified += num(r.qualified);
        acc.won += num(r.won);
        acc.revenue += num(r.revenue);
        acc.stuck += num(r.stuck);
        return acc;
      },
      { spend: 0, fbResults: 0, leads: 0, qualified: 0, won: 0, revenue: 0, stuck: 0 }
    );

    const per = (total: number, count: number) => (count > 0 ? total / count : null);

    res.json({
      level,
      stuckDays,
      currency: currencyMeta(guard),
      data: guardRoasAll(rows, guard),
      totals: {
        ...t,
        cpl: per(t.spend, t.leads),
        cql: per(t.spend, t.qualified),
        cac: per(t.spend, t.won),
        aov: per(t.revenue, t.won),
        roas: guard.mismatch ? null : t.spend > 0 ? t.revenue / t.spend : null,
        qualRate: t.leads > 0 ? (t.qualified / t.leads) * 100 : null,
        closeRate: t.qualified > 0 ? (t.won / t.qualified) * 100 : null,
        gapPct: t.fbResults > 0 ? ((t.fbResults - t.leads) / t.fbResults) * 100 : null,
      },
    });
  } catch (err) {
    console.error('funnel error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load funnel' });
  }
}
