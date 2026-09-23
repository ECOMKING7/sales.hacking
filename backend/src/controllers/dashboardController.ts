import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { cacheGet, cacheSet, overviewCacheKey } from '../utils/cache';
import {
  loadCurrencyGuard,
  applyRoas,
  applyRoasAll,
  spendInCrmCurrency,
  currencyMeta,
} from '../utils/currencyGuard';

// ---------- helpers ----------

interface DateRange {
  from: string; // ISO
  to: string; // ISO
}

function parseRange(req: Request): DateRange {
  const now = new Date();
  /**
   * ⚠ `to=2026-09-23` — bu KUN, bir lahza emas.
   *
   * `new Date('2026-09-23')` UTC yarim tunni beradi, ya'ni o'sha kunning
   * o'zi oraliqdan tushib qoladi. Shuning uchun yalang sana kelsa
   * ertangi yarim tun olinadi (oxiri ochiq oraliq). Bu faqat
   * `revenueGrowth` ga ta'sir qiladi — qolgan hamma raqam `kunOraliq`
   * dan keladi.
   */
  const toStr = String(req.query.to ?? '');
  const toRaw = req.query.to
    ? new Date(KUN_RE.test(toStr) ? `${toStr}T00:00:00.000Z` : toStr)
    : now;
  if (req.query.to && KUN_RE.test(toStr)) toRaw.setUTCDate(toRaw.getUTCDate() + 1);
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

/**
 * Jadval javobi. ROAS reklama valyutasi CRM valyutasidan farq qilsa
 * chiqarilmaydi — revenue/spend so'mni dollarga bo'lardi (~12 600x xato).
 * Sabab `currency` blokida boradi, UI shuni ko'rsatadi.
 */
async function entityPayload(
  workspaceId: string,
  rows: Array<Record<string, unknown>>,
  totals: Record<string, unknown>,
  page: number,
  limit: number,
  o: KunOraliq | null = null
) {
  const guard = await loadCurrencyGuard(workspaceId);
  const qamrov = await kunlikQamrov(workspaceId);
  return {
    data: applyRoasAll(rows, guard),
    page,
    limit,
    total: num(totals.rowCount),
    totals: applyRoas(totals, guard),
    currency: currencyMeta(guard),
    /**
     * Raqamlar qaysi rejimda hisoblangani. UI shu bloksiz foydalanuvchiga
     * "bu raqam qaysi davrniki?" degan savolga javob bera olmaydi — va
     * aynan shu savolga javob yo'qligi sana tanlagichni ishlamaydigan
     * qilib ko'rsatardi.
     */
    vaqt: {
      rejim: o ? 'kunlik' : 'butun_davr',
      from: o?.from ?? null,
      to: o?.to ?? null,
      qamrov,
      izoh: o
        ? 'Xarajat, klik, ko\'rsatish va lid — tanlangan kunlar bo\'yicha. Sotuv, daromad va ROAS kunlik jadvalda yo\'q, shuning uchun "—".'
        : 'Butun davr. Sana tanlansa xarajat va lid o\'sha kunlar bo\'yicha hisoblanadi.',
    },
  };
}


/* ═══════════════════════════════════════════════════════════════════════
   SANA REJIMI — tanlagich nihoyat ishlaydigan joy

   Ikki manba, ikki ma'no:

     ads.spend                → BUTUN DAVR (date_preset=maximum)
     ad_insights_daily.spend  → ANIQ KUN

   Foydalanuvchi oraliq tanlasa ikkinchisidan o'qiymiz. Tanlamasa —
   birinchisidan, ya'ni eski xulq saqlanadi.

   ⚠ HAMMA USTUN SANA BO'YICHA FILTRLANMAYDI. `results`, `cost_per_result`,
   `revenue`, `roas`, `purchases_count` — bular yo maqsadga bog'liq
   hisoblangan, yo CRM tomonidan (`leads.won_at`) keladi va kunlik jadvalda
   yo'q. Ularni "0" qilib ko'rsatish yoki butun davr raqamini qoldirish —
   ikkalasi ham YOLG'ON bo'lardi: birinchisi "pul kelmadi" deydi,
   ikkinchisi tanlangan oraliqqa boshqa davrning pulini yozadi.

   Shuning uchun ular `null` qaytadi va sabab `vaqt.izoh` da boradi —
   bu valyuta qo'riqchisidagi bilan bir xil naqsh: hisoblab bo'lmasa
   raqam emas, "—" chiqadi.
   ═══════════════════════════════════════════════════════════════════════ */

/** Faqat `YYYY-MM-DD`. Boshqa hech narsa SQL ga tushmaydi. */
const KUN_RE = /^\d{4}-\d{2}-\d{2}$/;

interface KunOraliq {
  from: string;
  to: string;
}

/**
 * Foydalanuvchi ANIQ oraliq berdimi.
 *
 * `parseRange` dan farqi: u har doim oraliq qaytaradi (standart 30 kun),
 * bu esa faqat so'rovda `from`/`to` bo'lsa. Ya'ni "tanlanmagan" va
 * "oxirgi 30 kun tanlangan" farqlanadi — birinchisi butun davr degani.
 */
type KunNatija = { xato: null; oraliq: KunOraliq | null } | { xato: string; oraliq: null };

/**
 * ⚠ ISO VAQT BELGISI QABUL QILINMAYDI — bu jim xatoning manbai edi.
 *
 * Ilgari bu yerda `.slice(0, 10)` turardi. Frontend `overview` ga
 * `from=2026-08-23T19:00:00.000Z` (Toshkent 24-avgust 00:00 ning UTC
 * ko'rinishi) yuborardi, jadvalga esa `from=2026-08-24`. Kesish natijasi
 * `2026-08-23` — ya'ni kartochka jadvaldan BIR KUN ortiqcha hisoblardi.
 * Ekranda "$36 sarflandi" va pastda "Jami $14" turardi; farq — 22-avgust.
 *
 * Kesish xato emas, TAXMIN edi: qaysi vaqt zonasida ekanini bilmay
 * turib UTC deb qabul qilardi. Endi taxmin qilmaydi — 400 qaytaradi.
 * Shovqinli xato jim noto'g'ri raqamdan arzon.
 */
function kunOraliq(req: Request): KunNatija {
  const f = String(req.query.from ?? '');
  const t = String(req.query.to ?? '');
  // Ikkalasi ham yo'q — oraliq tanlanmagan, butun davr.
  if (!f && !t) return { xato: null, oraliq: null };
  if (!KUN_RE.test(f) || !KUN_RE.test(t)) {
    return {
      xato: `from/to faqat YYYY-MM-DD bo'lishi mumkin (kelgani: from=${f}, to=${t})`,
      oraliq: null,
    };
  }
  if (f > t) return { xato: 'from sanasi to dan keyin', oraliq: null };
  return { xato: null, oraliq: { from: f, to: t } };
}

/** Kunlik jadval qaysi oraliqni qamragan. */
async function kunlikQamrov(
  workspaceId: string
): Promise<{ start: string | null; end: string | null }> {
  const { rows } = await pool.query<{ s: string | null; e: string | null }>(
    `SELECT daily_backfill_start::text AS s, daily_backfill_end::text AS e
       FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  return { start: rows[0]?.s ?? null, end: rows[0]?.e ?? null };
}

/**
 * Kunlik manba — `FROM` o'rniga qo'yiladigan hosila jadval.
 *
 * Sana qiymatlari SQL ga MATN sifatida qo'yiladi, parametr emas: bu
 * funksiya har uch daraja uchun bitta matn quradi va parametr raqamlari
 * chaqiruvchilarda turlicha. Xavfsiz, chunki `KUN_RE` dan o'tmagan
 * qiymat bu yergacha yetib kelmaydi — boshqa hech qanday matn
 * qo'shilmaydi.
 *
 * `$1` — workspace_id, u tashqi so'rovdan meros qoladi.
 */
function kunlikManba(table: 'campaigns' | 'adsets' | 'ads', o: KunOraliq): string {
  const qism = `
      SELECT %KEY% AS bog,
             SUM(i.spend)        AS spend,
             SUM(i.clicks)       AS clicks,
             SUM(i.impressions)  AS impressions,
             SUM(i.leads_count)  AS leads_count,
             SUM(i.calls_count)  AS calls_count,
             SUM(i.fb_purchases) AS fb_purchases,
             SUM(i.fb_revenue)   AS fb_revenue
        FROM ad_insights_daily i
        %JOIN%
       WHERE i.workspace_id = $1
         AND i.kun BETWEEN DATE '${o.from}' AND DATE '${o.to}'
       GROUP BY %KEY%`;

  const kunlik =
    table === 'ads'
      ? qism.replace(/%KEY%/g, 'i.ad_id').replace('%JOIN%', '')
      : qism
          .replace(/%KEY%/g, table === 'adsets' ? 'a.adset_id' : 'a.campaign_id')
          .replace('%JOIN%', 'JOIN ads a ON a.id = i.ad_id');

  const qoshimcha =
    table === 'ads' ? ', e.thumbnail_url, e.creative_type, e.adset_id, e.campaign_id' : '';
  const ota = table === 'adsets' ? ', e.campaign_id' : '';

  return `(
    SELECT e.id, e.name, e.status, e.workspace_id, e.objective, e.result_type${qoshimcha}${ota},
           COALESCE(d.spend, 0)        AS spend,
           COALESCE(d.clicks, 0)       AS clicks,
           COALESCE(d.impressions, 0)  AS impressions,
           COALESCE(d.leads_count, 0)  AS leads_count,
           COALESCE(d.fb_revenue, 0)   AS fb_revenue,
           /*
            * "Natija" maqsadga qarab boshqa hodisa. Kunlik jadvalda
            * uchalasi ham bor, shuning uchun uni to'g'ri tanlay olamiz.
            * Tanish bo'lmagan tur — NULL, nol emas: "0 natija" va
            * "natija turi noma'lum" bir xil ko'rinmasligi kerak.
            */
           CASE e.result_type
             WHEN 'lead'     THEN COALESCE(d.leads_count, 0)
             WHEN 'call'     THEN COALESCE(d.calls_count, 0)
             WHEN 'purchase' THEN COALESCE(d.fb_purchases, 0)
           END::numeric AS results,
           (COALESCE(d.spend, 0) / NULLIF(
              CASE e.result_type
                WHEN 'lead'     THEN d.leads_count
                WHEN 'call'     THEN d.calls_count
                WHEN 'purchase' THEN d.fb_purchases
              END, 0))::numeric AS cost_per_result,
           -- CRM tomoni: reklama kesimida sanaga bog'lab bo'lmaydi
           -- (atribusiya hali ishlamayapti). Taxmin qilinmaydi.
           NULL::numeric AS purchases_count,
           NULL::numeric AS revenue,
           NULL::numeric AS roas
      FROM ${table} e
      LEFT JOIN (${kunlik}) d ON d.bog = e.id
  ) AS ${table}`;
}

// Shared SELECT for campaign/adset/ad list rows.
function entitySelect(table: 'campaigns' | 'adsets' | 'ads', o: KunOraliq | null = null): string {
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
    FROM ${o ? kunlikManba(table, o) : table}`;
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
function totalsSelect(table: 'campaigns' | 'adsets' | 'ads', o: KunOraliq | null = null): string {
  /**
   * ⚠ KUNLIK REJIMDA `COALESCE(..., 0)` ISHLATILMAYDI.
   *
   * Qator darajasida sotuv/daromad `null` qaytadi (kunlik jadvalda yo'q).
   * Agar jami qatorida ularni `COALESCE(SUM(...), 0)` bilan yig'sak,
   * `null` jimgina `0` ga aylanadi va ekranda "daromad $0" chiqadi.
   *
   * "$0" = "reklama pul keltirmadi" degani. "—" = "hisoblab bo'lmadi".
   * Ikkisi bir xil ko'rinsa, operator birinchi ma'noni o'qiydi va
   * ishlayotgan kampaniyani o'chirib yuborishi mumkin. Bu loyihadagi
   * eng qat'iy qoidalardan biri: `null` hech qachon `0` ga aylantirilmaydi.
   */
  const nol = (ifoda: string) => (o ? 'NULL::numeric' : `COALESCE(${ifoda}, 0)`);
  const hisob = (ifoda: string) => (o ? 'NULL::numeric' : ifoda);

  return `
    SELECT COUNT(*)                                   AS "rowCount",
           COALESCE(SUM(spend), 0)                    AS spend,
           COALESCE(SUM(clicks), 0)                   AS clicks,
           COALESCE(SUM(impressions), 0)              AS impressions,
           COALESCE(SUM(leads_count), 0)              AS leads,
           ${nol('SUM(purchases_count)')}             AS purchases,
           -- natija kunlik rejimda ham hisoblanadi (maqsad bo'yicha)
           COALESCE(SUM(results), 0)                  AS results,
           ${nol('SUM(revenue)')}                     AS revenue,
           COALESCE(SUM(fb_revenue), 0)               AS "fbRevenue",
           SUM(spend) / NULLIF(SUM(clicks), 0)              AS cpc,
           SUM(spend) / NULLIF(SUM(impressions), 0) * 1000  AS cpm,
           SUM(clicks)::numeric / NULLIF(SUM(impressions), 0) * 100 AS ctr,
           SUM(spend) / NULLIF(SUM(leads_count), 0)         AS "costPerLead",
           ${hisob('SUM(spend) / NULLIF(SUM(purchases_count), 0)')} AS "costPerPurchase",
           SUM(spend) / NULLIF(SUM(results), 0)             AS "costPerResult",
           ${hisob('SUM(revenue) / NULLIF(SUM(spend), 0)')}         AS roas,
           CASE WHEN COUNT(DISTINCT result_type) = 1
                THEN MIN(result_type) END              AS "resultType"
    FROM ${o ? kunlikManba(table, o) : table}`;
}

// ---------- GET /api/dashboard/overview ----------
export async function overview(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const range = parseRange(req);
  const sana = kunOraliq(req);
  if (sana.xato) {
    res.status(400).json({ error: sana.xato });
    return;
  }
  const o = sana.oraliq;

  const key = overviewCacheKey(workspaceId, range.from, range.to);
  const cached = await cacheGet(key);
  if (cached) {
    res.json({ ...cached, cached: true });
    return;
  }

  const prev = previousRange(range);
  try {
    /**
     * Xarajat va klik: sana tanlangan bo'lsa KUNLIK jadvaldan.
     *
     * Kartochkalar va jadval bir ekranda turadi — ular bir xil davrni
     * ko'rsatishi shart. Jadval "bugun $14" deb, kartochka "$47 536"
     * deb tursa, foydalanuvchi qaysi biriga ishonishni bilmaydi va
     * ikkalasiga ham ishonmay qo'yadi.
     */
    const spendQ = o
      ? pool.query(
          `SELECT COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(clicks),0) AS clicks
             FROM ad_insights_daily
            WHERE workspace_id = $1
              AND kun BETWEEN DATE '${o.from}' AND DATE '${o.to}'`,
          [workspaceId]
        )
      : pool.query(
          `SELECT COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(clicks),0) AS clicks
             FROM campaigns WHERE workspace_id = $1`,
          [workspaceId]
        );
    /**
     * Daromad va lidlar SANA BO'YICHA FILTRLANMAYDI.
     *
     * Sababi: `campaigns.spend` vaqt bo'yicha bo'linmagan — u oxirgi
     * sync yozgan qiymat, ya'ni butun davr (date_preset=maximum).
     * Daromadni 30 kun bilan cheklab, xarajatni butun davr qoldirsak,
     * ROAS va CAC ikki xil oynani bo'ladi. Aynan shu xato valyutada
     * ~12 600 barobar shishish bergan edi; vaqt o'lchovida ham xuddi
     * shunday jim yolg'on chiqadi.
     *
     * Oyna chegarasi javobdagi `window` da aytiladi.
     */
    /**
     * CRM tomoni ham AYNAN SHU OYNADA.
     *
     * Xarajat endi kunlik jadvaldan keladi, ya'ni tanlangan kunlarniki.
     * Daromadni butun davr qoldirsak, ROAS va CAC ikki xil oynani
     * bo'lardi — bu valyuta bug'ining vaqt o'lchovidagi aynan o'zi.
     * Ikkalasi bir oynada bo'lgani uchun endi hisoblash HALOL.
     *
     * `won_at` — sotuv sanasi, `crm_created_at` — lid tushgan sana.
     * Har ko'rsatkich o'z sanasiga qarab filtrlanadi: sotuv yopilgan
     * kun bo'yicha, lid esa kelgan kun bo'yicha.
     *
     * ⚠ TEKSHIRILISHI KERAK: `won_at` UTC da saqlanadi, kunlik jadval
     * esa reklama akkauntining vaqt zonasida. Kun chegarasida bir necha
     * soatlik farq bo'lishi mumkin — kunlik kesimda sezilarli, oylikda
     * deyarli yo'q.
     */
    const wonOyna = o ? `AND won_at >= DATE '${o.from}' AND won_at < DATE '${o.to}' + 1` : '';
    const lidOyna = o
      ? `AND crm_created_at >= DATE '${o.from}' AND crm_created_at < DATE '${o.to}' + 1`
      : '';

    const wonQ = pool.query(
      `SELECT COUNT(*) AS won, COALESCE(SUM(revenue),0) AS revenue, AVG(deal_time_days) AS deal_time
         FROM leads
        WHERE workspace_id = $1 AND status = 'won' ${wonOyna}`,
      [workspaceId]
    );
    const totalLeadsQ = pool.query(
      `SELECT COUNT(*) AS total FROM leads WHERE workspace_id = $1 ${lidOyna}`,
      [workspaceId]
    );
    /**
     * O'sish — yagona sanaga bog'liq ko'rsatkich: oxirgi 30 kun oldingi
     * 30 kunga nisbatan. U yuqoridagi "butun davr" raqamlari bilan
     * solishtirilmaydi va UI'da alohida yorliq bilan chiqadi.
     */
    const growthQ = pool.query(
      `SELECT
         COALESCE(SUM(revenue) FILTER (WHERE won_at >= $2 AND won_at < $3),0) AS hozir,
         COALESCE(SUM(revenue) FILTER (WHERE won_at >= $4 AND won_at < $2),0) AS oldin
       FROM leads
       WHERE workspace_id = $1 AND status = 'won'`,
      [workspaceId, range.from, range.to, prev.from]
    );
    const sourceQ = pool.query(
      `SELECT
         COALESCE(SUM(revenue) FILTER (WHERE first_click_ad_id IS NOT NULL),0) AS meta,
         COALESCE(SUM(revenue) FILTER (WHERE first_click_ad_id IS NULL),0)     AS direct
       FROM leads
       WHERE workspace_id = $1 AND status = 'won' ${wonOyna}`,
      [workspaceId]
    );
    const windowQ = pool.query<{ fb_window_start: string | null; fb_window_end: string | null }>(
      `SELECT fb_window_start::text, fb_window_end::text FROM workspaces WHERE id = $1`,
      [workspaceId]
    );

    const [spendR, wonR, totalR, growthR, sourceR, windowR] = await Promise.all([
      spendQ,
      wonQ,
      totalLeadsQ,
      growthQ,
      sourceQ,
      windowQ,
    ]);

    const amountSpent = num(spendR.rows[0].spend);
    const revenue = num(wonR.rows[0].revenue);
    const wonCount = num(wonR.rows[0].won);
    const totalLeads = num(totalR.rows[0].total);
    const nowRevenue = num(growthR.rows[0].hozir);
    const prevRevenue = num(growthR.rows[0].oldin);
    const guard = await loadCurrencyGuard(workspaceId);

    /**
     * Hamma ko'rsatkich BIR OYNADA: xarajat kunlik jadvaldan, daromad va
     * sotuv `leads` dan, ikkalasi ham tanlangan sanalar bo'yicha.
     * Shuning uchun ROAS, CAC va ARPL to'g'ri hisoblanadi.
     */
    const payload = {
      amountSpent,
      revenue,
      currency: currencyMeta(guard),
      // Xarajat CRM valyutasiga o'girilib bo'linadi. Kurs yo'q bo'lsa
      // null — 0 emas: 0 "reklama pul keltirmadi", null "hisoblab
      // bo'lmaydi" degani.
      roas: (() => {
        const spend = spendInCrmCurrency(amountSpent, guard);
        if (spend === null) return null;
        return spend > 0 ? revenue / spend : 0;
      })(),
      cac: wonCount > 0 ? amountSpent / wonCount : 0,
      conversionRate: totalLeads > 0 ? (wonCount / totalLeads) * 100 : 0,
      dealTime: num(wonR.rows[0].deal_time),
      arpl: totalLeads > 0 ? revenue / totalLeads : 0,
      vaqt: {
        rejim: o ? ('kunlik' as const) : ('butun_davr' as const),
        from: o?.from ?? null,
        to: o?.to ?? null,
        qamrov: await kunlikQamrov(workspaceId),
        izoh: o
          ? "Hamma raqam tanlangan kunlar bo'yicha: xarajat Facebook'dan, sotuv va daromad CRM'dan (sotuv yopilgan sana bo'yicha)."
          : 'Butun davr.',
      },
      // Oxirgi 30 kun ↔ oldingi 30 kun. "revenue" (butun davr) bilan
      // bog'liq emas — bu trend ko'rsatkichi.
      revenueGrowth:
        prevRevenue > 0
          ? ((nowRevenue - prevRevenue) / prevRevenue) * 100
          : nowRevenue > 0
            ? 100
            : 0,
      revenueBySource: {
        metaAds: num(sourceR.rows[0].meta),
        direct: num(sourceR.rows[0].direct),
        igOrganic: 0,
        fbOrganic: 0,
      },
      range,
      // Raqamlar qaysi davrni qamraydi. Facebook aytgan sana — taxmin
      // emas. `start` yo'q bo'lsa hali sync bo'lmagan.
      window: {
        start: windowR.rows[0]?.fb_window_start ?? null,
        end: windowR.rows[0]?.fb_window_end ?? null,
      },
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

  const sana = kunOraliq(req);
  if (sana.xato) {
    res.status(400).json({ error: sana.xato });
    return;
  }
  const o = sana.oraliq;
  const params: unknown[] = [workspaceId];
  let where = 'WHERE workspace_id = $1';
  if (req.query.status) {
    params.push(String(req.query.status));
    where += ` AND status = $${params.length}`;
  }
  params.push(limit, offset);

  try {
    const rows = await pool.query(
      `${entitySelect('campaigns', o)} ${where}
        ORDER BY ${sortCol} ${order} NULLS LAST
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    // Jami qator butun ro'yxat bo'yicha hisoblanadi, ko'rinib turgan sahifa
    // bo'yicha emas — 2-sahifaga o'tganda "jami" o'zgarib ketmasligi kerak.
    const totalR = await pool.query(
      `${totalsSelect('campaigns', o)} ${where}`,
      params.slice(0, params.length - 2)
    );
    const t = totalR.rows[0];
    res.json(await entityPayload(workspaceId, rows.rows, t, page, limit, o));
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
  const sana = kunOraliq(req);
  if (sana.xato) {
    res.status(400).json({ error: sana.xato });
    return;
  }
  const o = sana.oraliq;
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
      `${entitySelect(table, o)} ${where}
        ORDER BY ${sortCol} ${order} NULLS LAST
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    const totalR = await pool.query(`${totalsSelect(table, o)} ${where}`, params);
    const t = totalR.rows[0];
    res.json(await entityPayload(workspaceId, rows.rows, t, page, limit, o));
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
    res.json(await entityPayload(workspaceId, rows.rows, t, page, limit));
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
    res.json(await entityPayload(workspaceId, rows.rows, t, page, limit));
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
    // Tartib saqlanadi: bitta workspace ichida hamma qator bir xil valyuta
    // juftligida, shuning uchun ROAS bo'yicha saralash to'g'ri qoladi —
    // faqat RAQAMNI ko'rsatib bo'lmaydi.
    const guard = await loadCurrencyGuard(workspaceId);
    res.json({ data: applyRoasAll(rows.rows, guard), currency: currencyMeta(guard) });
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
