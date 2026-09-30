import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool';

/* ═══════════════════════════════════════════════════════════════════════
   DEMO WORKSPACE — bo'sh workspace'ni namunaviy ma'lumot bilan to'ldirish

   Kimga kerak
   ───────────
   • amoMarket moderatori va yangi mijoz: Facebook va amoCRM ulanmaguncha
     dashboard bo'sh turadi va mahsulot nima ko'rsatishini tushunib
     bo'lmaydi.
   • Hech qachon REAL mijoz ma'lumoti ko'rsatilmaydi — hammasi sintetik.

   Qat'iy chegaralar
   ─────────────────
   • Faqat so'rov yuborgan foydalanuvchining O'Z workspace'iga yozadi.
   • Faqat BO'SH workspace'ga: Facebook yoki amoCRM ulangan bo'lsa, yoki
     real kampaniya/lid bo'lsa — rad etadi. Real raqam bilan demo
     aralashib ketmasligi kerak.
   • Hamma qator belgilangan: kampaniya/adset/ad `fb_*_id` = 'demo_…',
     lid va touchpoint `is_demo = true`. O'chirish faqat shularni o'chiradi.
   • Takrorlanadi: tasodif urug'i workspace ID dan — har safar bir xil raqam.
   ═══════════════════════════════════════════════════════════════════════ */

export class DemoRadEtildi extends Error {}

function urug(text: string): number {
  return crypto.createHash('md5').update(text).digest().readUInt32LE(0);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const oraliq = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);
const butun = (r: () => number, lo: number, hi: number) => Math.round(oraliq(r, lo, hi));
const kun = (base: Date, n: number) => new Date(base.getTime() + n * 86_400_000);
const hash = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

/** Profil: arzon lid ≠ pul keltiradigan lid. Demo aynan shu farqni ko'rsatadi. */
interface Profil {
  cpl: [number, number]; // USD
  crmYetish: [number, number];
  sifatli: [number, number];
  yopilish: [number, number];
  chek: [number, number]; // USD
  kunlar: [number, number];
}

const ARZON: Profil = {
  cpl: [1.2, 2.2],
  crmYetish: [0.72, 0.82],
  sifatli: [0.15, 0.25],
  yopilish: [0.08, 0.14],
  chek: [150, 240],
  kunlar: [9, 24],
};
const ORTACHA: Profil = {
  cpl: [2.5, 4],
  crmYetish: [0.82, 0.9],
  sifatli: [0.35, 0.48],
  yopilish: [0.17, 0.24],
  chek: [220, 340],
  kunlar: [5, 15],
};
const SIFATLI: Profil = {
  cpl: [4.5, 7],
  crmYetish: [0.88, 0.95],
  sifatli: [0.55, 0.68],
  yopilish: [0.26, 0.35],
  chek: [300, 460],
  kunlar: [3, 10],
};

interface KampaniyaReja {
  nom: string;
  natija: 'lead' | 'call';
  adsetlar: { nom: string; adlar: { nom: string; profil: Profil; lid: [number, number] }[] }[];
}

const REJA: KampaniyaReja[] = [
  {
    nom: 'Mebel | Lid-forma | Toshkent',
    natija: 'lead',
    adsetlar: [
      {
        nom: 'Keng auditoriya 25-45',
        adlar: [
          { nom: 'video_chegirma_30', profil: ARZON, lid: [70, 95] },
          { nom: 'karusel_oshxona', profil: ORTACHA, lid: [40, 55] },
        ],
      },
      {
        nom: 'Lookalike 1% xaridorlar',
        adlar: [
          { nom: 'video_mijoz_fikri', profil: SIFATLI, lid: [25, 35] },
          { nom: 'rasm_yotoqxona', profil: ORTACHA, lid: [30, 42] },
        ],
      },
    ],
  },
  {
    nom: "Mebel | Qo'ng'iroq | Viloyatlar",
    natija: 'call',
    adsetlar: [
      {
        nom: 'Samarqand, Buxoro',
        adlar: [
          { nom: 'video_ustaxona', profil: SIFATLI, lid: [18, 26] },
          { nom: 'rasm_divan', profil: ORTACHA, lid: [20, 30] },
        ],
      },
      {
        nom: "Farg'ona vodiysi",
        adlar: [{ nom: 'video_yetkazish_bepul', profil: ORTACHA, lid: [22, 32] }],
      },
    ],
  },
  {
    nom: 'Mebel | Lid-forma | Retarget',
    natija: 'lead',
    adsetlar: [
      {
        nom: "Saytga kirganlar 30 kun",
        adlar: [
          { nom: 'video_kafolat_5yil', profil: SIFATLI, lid: [15, 22] },
          { nom: 'rasm_aksiya_hafta', profil: ARZON, lid: [35, 50] },
        ],
      },
    ],
  },
];

/** Demo pul miqdori workspace valyutasida. UZS da USD raqamlari juda kichik ko'rinardi. */
function kursKoef(valyuta: string): number {
  return valyuta.toUpperCase() === 'UZS' ? 12_000 : 1;
}

export interface DemoNatija {
  kampaniya: number;
  ad: number;
  lid: number;
  sotuv: number;
}

async function bosmi(c: PoolClient, workspaceId: string): Promise<string> {
  const { rows } = await c.query<{
    fb: boolean;
    amo: boolean;
    kamp: string;
    lid: string;
    currency: string;
  }>(
    `SELECT (w.fb_ad_account_id IS NOT NULL)     AS fb,
            (w.amocrm_access_token IS NOT NULL)  AS amo,
            w.currency,
            (SELECT COUNT(*) FROM campaigns k
              WHERE k.workspace_id = w.id
                AND COALESCE(k.fb_campaign_id, '') NOT LIKE 'demo\\_%') AS kamp,
            (SELECT COUNT(*) FROM leads l
              WHERE l.workspace_id = w.id AND l.is_demo = false)        AS lid
       FROM workspaces w
      WHERE w.id = $1
      FOR UPDATE OF w`,
    [workspaceId]
  );
  const w = rows[0];
  if (!w) throw new DemoRadEtildi('Workspace topilmadi.');
  if (w.fb || w.amo || Number(w.kamp) > 0 || Number(w.lid) > 0) {
    throw new DemoRadEtildi(
      "Demo faqat bo'sh workspace uchun: Facebook yoki amoCRM ulangan, yoki real ma'lumot bor."
    );
  }
  return w.currency || 'UZS';
}

/** Bo'sh workspace'ga demo kampaniya, lid va sotuvlar yozadi. Idempotent. */
export async function demoYarat(workspaceId: string): Promise<DemoNatija> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL statement_timeout = '25s'");
    const valyuta = await bosmi(c, workspaceId);
    const k = kursKoef(valyuta);

    // Avvalgi demo bo'lsa — toza boshlaymiz (qayta bosilsa dublikat bo'lmaydi).
    await demoOchirIchida(c, workspaceId);

    const r = mulberry32(urug(workspaceId));
    const hozir = new Date();
    let adSoni = 0;
    let lidSoni = 0;
    let sotuvSoni = 0;

    for (const [ki, kr] of REJA.entries()) {
      const kamp = await c.query<{ id: string }>(
        `INSERT INTO campaigns (workspace_id, fb_campaign_id, name, status, result_type, synced_at)
         VALUES ($1, $2, $3, 'ACTIVE', $4, now()) RETURNING id`,
        [workspaceId, `demo_c${ki + 1}`, kr.nom, kr.natija]
      );
      const kampId = kamp.rows[0].id;

      for (const [ai, as] of kr.adsetlar.entries()) {
        const adset = await c.query<{ id: string }>(
          `INSERT INTO adsets (workspace_id, campaign_id, fb_adset_id, name, status, result_type, synced_at)
           VALUES ($1, $2, $3, $4, 'ACTIVE', $5, now()) RETURNING id`,
          [workspaceId, kampId, `demo_c${ki + 1}_s${ai + 1}`, as.nom, kr.natija]
        );
        const adsetId = adset.rows[0].id;

        for (const [di, ad] of as.adlar.entries()) {
          const p = ad.profil;
          const fbNatija = butun(r, ...ad.lid);
          const spend = Math.round(fbNatija * oraliq(r, ...p.cpl) * k * 100) / 100;
          const clicks = butun(r, fbNatija * 9, fbNatija * 16);
          const impressions = butun(r, clicks * 55, clicks * 90);

          const adRow = await c.query<{ id: string }>(
            `INSERT INTO ads (workspace_id, campaign_id, adset_id, fb_ad_id, name, status,
                              spend, impressions, clicks, leads_count, result_type, results,
                              cost_per_result, synced_at)
             VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8,$9,$10,$11,$12, now()) RETURNING id`,
            [
              workspaceId, kampId, adsetId, `demo_c${ki + 1}_s${ai + 1}_a${di + 1}`, ad.nom,
              spend, impressions, clicks, fbNatija, kr.natija, fbNatija, spend / fbNatija,
            ]
          );
          const adId = adRow.rows[0].id;
          adSoni++;

          // CRM'ga yetgan lidlar — FB natijasidan kam (tafovut shu).
          const crm = Math.max(1, Math.round(fbNatija * oraliq(r, ...p.crmYetish)));
          const sEhtimol = oraliq(r, ...p.sifatli);
          const yEhtimol = oraliq(r, ...p.yopilish);
          const qiymatlar: unknown[] = [];
          const qatorlar: string[] = [];

          for (let i = 0; i < crm; i++) {
            const yosh = oraliq(r, 0, 30);
            const yaratilgan = kun(hozir, -yosh);
            const sKech = oraliq(r, 0.5, 4);
            const dealKun = butun(r, ...p.kunlar);
            const sifatli = r() < sEhtimol && yosh > sKech;
            const sotildi = sifatli && r() < yEhtimol && yosh > dealKun;
            const yoqotildi = !sotildi && !sifatli && r() < 0.25;
            const chek = sotildi ? Math.round(oraliq(r, ...p.chek) * k) : 0;
            const status = sotildi ? 'won' : sifatli ? 'in_progress' : yoqotildi ? 'lost' : 'new';
            const etap = sotildi
              ? 'Muvaffaqiyatli yakunlandi'
              : sifatli
                ? 'Sifatli lid'
                : yoqotildi
                  ? 'Yopildi va amalga oshmadi'
                  : 'Yangi lid';

            const b = qiymatlar.length;
            qatorlar.push(
              `(${Array.from({ length: 13 }, (_, j) => `$${b + j + 1}`).join(',')}, 1, true)`
            );
            qiymatlar.push(
              workspaceId,
              `demo-${ki + 1}${ai + 1}${di + 1}-${i}`,
              hash(`demo-tel-${workspaceId}-${adId}-${i}`),
              status,
              chek,
              adId,
              sotildi ? dealKun : null,
              yaratilgan,
              sifatli ? kun(yaratilgan, sKech) : null,
              sotildi ? kun(yaratilgan, dealKun) : null,
              yoqotildi ? kun(yaratilgan, oraliq(r, 1, 10)) : null,
              etap,
              'utm'
            );
            lidSoni++;
            if (sotildi) sotuvSoni++;
          }

          await c.query(
            `INSERT INTO leads
               (workspace_id, crm_lead_id, phone_hash, status, revenue, last_click_ad_id,
                deal_time_days, crm_created_at, qualified_at, won_at, lost_at, crm_stage,
                match_method, total_touches, is_demo)
             VALUES ${qatorlar.join(',')}
             ON CONFLICT (workspace_id, crm_lead_id) DO NOTHING`,
            qiymatlar
          );
        }
      }
    }

    // Har lidga bitta touchpoint — atribusiya dvigateli o'qiydigan yagona manba.
    await c.query(
      `INSERT INTO touchpoints
         (workspace_id, lead_id, ad_id, adset_id, campaign_id,
          event_type, touch_number, attribution_weight, fbclid, occurred_at, is_demo)
       SELECT l.workspace_id, l.id, a.id, a.adset_id, a.campaign_id,
              'lead', 1, 1.0, 'demo_' || replace(l.id::text, '-', ''), l.crm_created_at, true
         FROM leads l JOIN ads a ON a.id = l.last_click_ad_id
        WHERE l.workspace_id = $1 AND l.is_demo = true
          AND NOT EXISTS (SELECT 1 FROM touchpoints t WHERE t.lead_id = l.id)`,
      [workspaceId]
    );

    await rollup(c, workspaceId);

    // Valyuta mos bo'lsin (reklama va CRM bir valyutada), oyna — oxirgi 30 kun.
    await c.query(
      `UPDATE workspaces
          SET fb_currency     = COALESCE(fb_currency, currency),
              fb_window_start = COALESCE(fb_window_start, (now() - interval '30 days')::date),
              fb_window_end   = COALESCE(fb_window_end, now()::date)
        WHERE id = $1`,
      [workspaceId]
    );

    await c.query('COMMIT');
    return { kampaniya: REJA.length, ad: adSoni, lid: lidSoni, sotuv: sotuvSoni };
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

async function rollup(c: PoolClient, workspaceId: string): Promise<void> {
  await c.query(
    `UPDATE ads a SET
        revenue = COALESCE(d.revenue, 0),
        purchases_count = COALESCE(d.sotuv, 0),
        roas = CASE WHEN a.spend > 0 THEN COALESCE(d.revenue, 0) / a.spend END
       FROM (SELECT last_click_ad_id AS ad_id, SUM(revenue) AS revenue, COUNT(*) AS sotuv
               FROM leads
              WHERE workspace_id = $1 AND is_demo = true AND status = 'won'
              GROUP BY last_click_ad_id) d
      WHERE a.id = d.ad_id AND a.workspace_id = $1`,
    [workspaceId]
  );
  for (const [t, col] of [
    ['adsets', 'adset_id'],
    ['campaigns', 'campaign_id'],
  ] as const) {
    await c.query(
      `UPDATE ${t} p SET
          spend = d.spend, impressions = d.impressions, clicks = d.clicks,
          leads_count = d.leads, results = d.leads,
          revenue = d.revenue, purchases_count = d.sotuv,
          roas = CASE WHEN d.spend > 0 THEN d.revenue / d.spend END
         FROM (SELECT ${col} AS pid, SUM(spend) AS spend, SUM(impressions) AS impressions,
                      SUM(clicks) AS clicks, SUM(leads_count) AS leads,
                      SUM(revenue) AS revenue, SUM(purchases_count) AS sotuv
                 FROM ads
                WHERE workspace_id = $1 AND ${col} IS NOT NULL
                GROUP BY ${col}) d
        WHERE p.id = d.pid AND p.workspace_id = $1`,
      [workspaceId]
    );
  }
}

async function demoOchirIchida(c: PoolClient, workspaceId: string): Promise<number> {
  await c.query(`DELETE FROM touchpoints WHERE workspace_id = $1 AND is_demo = true`, [
    workspaceId,
  ]);
  const l = await c.query(`DELETE FROM leads WHERE workspace_id = $1 AND is_demo = true`, [
    workspaceId,
  ]);
  // adsets va ads kampaniyaga CASCADE bilan bog'langan.
  await c.query(
    `DELETE FROM campaigns WHERE workspace_id = $1 AND fb_campaign_id LIKE 'demo\\_%'`,
    [workspaceId]
  );
  return l.rowCount ?? 0;
}

/** Faqat demo qatorlarni o'chiradi. Real ma'lumotga tegmaydi. */
export async function demoOchir(workspaceId: string): Promise<number> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const n = await demoOchirIchida(c, workspaceId);
    // Demo qo'ygan valyuta/oynani, Facebook ulanmagan bo'lsa, qaytaramiz.
    await c.query(
      `UPDATE workspaces
          SET fb_currency = NULL, fb_window_start = NULL, fb_window_end = NULL
        WHERE id = $1 AND fb_ad_account_id IS NULL`,
      [workspaceId]
    );
    await c.query('COMMIT');
    return n;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}
