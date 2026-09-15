/* ═══════════════════════════════════════════════════════════════════════
   DEMO MA'LUMOT GENERATORI

   Nima uchun kerak
   ────────────────
   amoCRM hali ulanmagan, lekin voronka funksiyalarini (lid → sifatli lid →
   sotuv, tafovut, deal time, qotgan lid) qurish va odamlarga ko'rsatish
   kerak. Bu skript CRM yarmini SIMULYATSIYA qiladi.

   Muhim: reklama yarmi SIMULYATSIYA EMAS. Kampaniya, ad set, ad nomlari,
   xarajat, klik, natija — hammasi Facebook'dan kelgan REAL raqamlar.
   Faqat ustiga CRM voronkasi qo'yiladi. Shuning uchun demo ishonarli
   ko'rinadi: real reklama nomlari, real pul.

   Qayerga yozadi
   ──────────────
     leads         — yangi qatorlar,  is_demo = true
     touchpoints   — yangi qatorlar,  is_demo = true
     ads / adsets / campaigns — revenue, purchases_count, roas YANGILANADI

   Tozalash
   ────────
     npm run seed:clean
   is_demo = true bo'lgan hamma qatorni o'chiradi va roll-up ustunlarni
   nolga qaytaradi. Real lidlarga tegmaydi.

   ⚠ Keyingi Facebook sync `revenue` ustunini FB raqami bilan qayta yozadi.
     Demo daromadni ko'rsatib turish kerak bo'lsa, sync'dan keyin skriptni
     qayta ishga tushiring (u idempotent — dublikat yaratmaydi).

   Ishga tushirish
   ───────────────
     npm run seed:demo          → demo ma'lumot yaratadi
     npm run seed:clean         → o'chiradi
   ═══════════════════════════════════════════════════════════════════════ */

import crypto from 'crypto';
import { pool } from '../db/pool';

// ---------- takrorlanadigan tasodif ----------
//
// Math.random() ishlatilmaydi: har ishga tushirishda boshqa raqam chiqsa,
// "kecha ROAS 4.2 edi, bugun 7.1" degan savol tug'iladi va demo ishonchini
// yo'qotadi. Urug' — ad'ning o'z ID'si, shuning uchun har ad har doim
// o'sha raqamni oladi.

function seedFrom(text: string): number {
  const h = crypto.createHash('md5').update(text).digest();
  return h.readUInt32LE(0);
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

const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);
const intBetween = (r: () => number, lo: number, hi: number) => Math.round(between(r, lo, hi));

// ---------- reklama arxetiplari ----------
//
// Demo'ning butun ma'nosi shu yerda. Uchta profil ataylab bir-biridan keskin
// farq qiladi, chunki mahsulot aynan shuni ko'rsatishi kerak:
//
//   "arzon" ad   — CPL past, lekin sifatli lid kam, sotuv kam  → ROAS past
//   "sifatli" ad — CPL yuqori, lekin lidlar sotib oladi        → ROAS yuqori
//
// Ads Manager faqat CPL'ni ko'radi va "arzon" ad'ni kuchaytirishni aytadi.
// Bizning dashboard teskarisini ko'rsatadi. Demo shuni isbotlaydi.

interface Archetype {
  nom: string;
  /** CRM'ga yetib kelgan lid ulushi (tafovut shundan tug'iladi) */
  crmYetish: [number, number];
  /** Lidning sifatli etapga yetish ehtimoli */
  sifatli: [number, number];
  /** Sifatli lidning sotuvga aylanish ehtimoli */
  yopilish: [number, number];
  /** O'rtacha chek, USD */
  chek: [number, number];
  /** Sotuv necha kunda yopiladi (mediana atrofi) */
  kun: [number, number];
}

const ARXETIPLAR: Archetype[] = [
  {
    nom: 'arzon-lid',
    crmYetish: [0.7, 0.82],
    sifatli: [0.16, 0.27],
    yopilish: [0.09, 0.15],
    chek: [150, 240],
    kun: [9, 26],
  },
  {
    nom: 'o‘rtacha',
    crmYetish: [0.82, 0.9],
    sifatli: [0.34, 0.5],
    yopilish: [0.17, 0.25],
    chek: [220, 340],
    kun: [5, 16],
  },
  {
    nom: 'sifatli',
    crmYetish: [0.88, 0.95],
    sifatli: [0.55, 0.7],
    yopilish: [0.25, 0.36],
    chek: [300, 470],
    kun: [3, 11],
  },
];

/**
 * Ad qaysi arxetipga tushishi tasodifiy emas — natija turiga bog'langan.
 * Qo'ng'iroq va sotuvga optimizatsiya qilingan reklama tabiatan sifatliroq
 * lid beradi; forma va klik — arzonroq va zaifroq. Demo shu mantiqni
 * takrorlaydi, aks holda raqamlar ishonarsiz bo'lardi.
 */
function arxetipTanla(resultType: string | null, r: () => number): Archetype {
  const t = (resultType ?? '').toLowerCase();
  if (t.includes('call') || t.includes('purchase')) return ARXETIPLAR[2];
  if (t.includes('lead')) return r() < 0.45 ? ARXETIPLAR[1] : ARXETIPLAR[0];
  return r() < 0.3 ? ARXETIPLAR[1] : ARXETIPLAR[0];
}

// ---------- yordamchi ----------

function hash(v: string): string {
  return crypto.createHash('sha256').update(v).digest('hex');
}

function kunQosh(base: Date, kun: number): Date {
  return new Date(base.getTime() + kun * 86400_000);
}

interface AdRow {
  id: string;
  workspace_id: string;
  adset_id: string | null;
  campaign_id: string | null;
  name: string | null;
  results: string | number;
  result_type: string | null;
  spend: string | number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------- asosiy ----------

async function workspaceTop(): Promise<string | null> {
  // Ad'lari eng ko'p workspace — demo shu yerda ma'noli ko'rinadi.
  const { rows } = await pool.query<{ workspace_id: string; n: string }>(
    `SELECT workspace_id, COUNT(*) AS n
       FROM ads
      GROUP BY workspace_id
      ORDER BY COUNT(*) DESC
      LIMIT 1`
  );
  return rows[0]?.workspace_id ?? null;
}

async function clean(workspaceId: string): Promise<void> {
  const tp = await pool.query(
    `DELETE FROM touchpoints WHERE workspace_id = $1 AND is_demo = true`,
    [workspaceId]
  );
  const ld = await pool.query(
    `DELETE FROM leads WHERE workspace_id = $1 AND is_demo = true`,
    [workspaceId]
  );

  // Roll-up ustunlar nolga qaytadi. Facebook'ning o'z daromad raqami bo'lsa,
  // keyingi sync uni qaytadan yozadi.
  for (const t of ['ads', 'adsets', 'campaigns']) {
    await pool.query(
      `UPDATE ${t} SET revenue = 0, purchases_count = 0, roas = NULL
        WHERE workspace_id = $1`,
      [workspaceId]
    );
  }

  console.log(`🧹 Tozalandi: ${ld.rowCount} lid, ${tp.rowCount} touchpoint`);
  console.log('   ads/adsets/campaigns: revenue, purchases_count, roas → 0');
  console.log('   Real FB raqamlarini qaytarish uchun: Settings → Sync');
}

async function seed(workspaceId: string): Promise<void> {
  const { rows: ads } = await pool.query<AdRow>(
    `SELECT id, workspace_id, adset_id, campaign_id, name,
            results, result_type, spend
       FROM ads
      WHERE workspace_id = $1 AND results > 0
      ORDER BY spend DESC`,
    [workspaceId]
  );

  if (ads.length === 0) {
    console.log('⚠ Natijasi bor ad topilmadi. Avval Facebook sync qiling.');
    return;
  }

  let jamiLid = 0;
  let jamiSifatli = 0;
  let jamiSotuv = 0;
  let jamiDaromad = 0;
  let jamiFbNatija = 0;

  const hozir = new Date();

  for (const ad of ads) {
    const r = mulberry32(seedFrom(ad.id));
    const arx = arxetipTanla(ad.result_type, r);

    const fbNatija = num(ad.results);
    jamiFbNatija += fbNatija;

    // Tafovut shu yerda tug'iladi: FB 100 desa, CRM'ga 85 tasi yetadi.
    // Sababi real hayotda: UTM to'lmagan, dublikat birlashtirilgan,
    // in-app brauzerda localStorage bloklangan.
    const lidSoni = Math.max(1, Math.round(fbNatija * between(r, ...arx.crmYetish)));

    const sifatliEhtimol = between(r, ...arx.sifatli);
    const yopilishEhtimol = between(r, ...arx.yopilish);

    for (let i = 0; i < lidSoni; i++) {
      // Lid oxirgi 30 kun ichida tushgan
      const yaratilgan = kunQosh(hozir, -between(r, 0, 30));
      const crmId = `demo-${ad.id.slice(0, 8)}-${i}`;

      const sifatliMi = r() < sifatliEhtimol;
      const sotildiMi = sifatliMi && r() < yopilishEhtimol;

      // Sifatli etapga 0.5–4 kunda yetadi
      const sifatliSana = sifatliMi ? kunQosh(yaratilgan, between(r, 0.5, 4)) : null;

      const dealKun = intBetween(r, ...arx.kun);
      const yopilganSana = sotildiMi ? kunQosh(yaratilgan, dealKun) : null;
      const chek = sotildiMi ? Math.round(between(r, ...arx.chek)) : 0;

      // Kelajakdagi sana bo'lmasin
      if (yopilganSana && yopilganSana > hozir) continue;
      if (sifatliSana && sifatliSana > hozir) continue;

      let status: string;
      if (sotildiMi) status = 'won';
      else if (sifatliMi) status = 'in_progress';
      else if (r() < 0.25) status = 'lost';
      else status = 'new';

      const stageNomi = sotildiMi
        ? 'Muvaffaqiyatli yakunlandi'
        : sifatliMi
          ? 'Sifatli lid'
          : status === 'lost'
            ? 'Yopildi va amalga oshmadi'
            : 'Yangi lid';

      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO leads
           (workspace_id, crm_lead_id, phone_hash, email_hash, status, revenue,
            last_click_ad_id, total_touches, deal_time_days,
            crm_created_at, qualified_at, won_at, lost_at, crm_stage, is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, true)
         ON CONFLICT (workspace_id, crm_lead_id) DO NOTHING
         RETURNING id`,
        [
          workspaceId,
          crmId,
          hash(`998${intBetween(r, 900000000, 999999999)}`),
          hash(`demo${i}@example.uz`),
          status,
          chek,
          ad.id,
          1,
          sotildiMi ? dealKun : null,
          yaratilgan,
          sifatliSana,
          yopilganSana,
          status === 'lost' ? kunQosh(yaratilgan, between(r, 1, 12)) : null,
          stageNomi,
        ]
      );

      const leadId = rows[0]?.id;
      if (!leadId) continue; // allaqachon mavjud — idempotent

      await pool.query(
        `INSERT INTO touchpoints
           (workspace_id, lead_id, ad_id, adset_id, campaign_id,
            event_type, touch_number, attribution_weight,
            fbclid, occurred_at, is_demo)
         VALUES ($1,$2,$3,$4,$5,'lead',1,1.0,$6,$7,true)`,
        [
          workspaceId,
          leadId,
          ad.id,
          ad.adset_id,
          ad.campaign_id,
          `demo_${crypto.randomBytes(8).toString('hex')}`,
          yaratilgan,
        ]
      );

      jamiLid++;
      if (sifatliMi) jamiSifatli++;
      if (sotildiMi) {
        jamiSotuv++;
        jamiDaromad += chek;
      }
    }
  }

  // ---------- roll-up ----------
  // Daromad lidlardan ad → adset → kampaniyaga ko'tariladi. Atribusiya
  // dvigateli ham aynan shuni qiladi; demo o'sha yo'ldan boradi.
  await pool.query(
    `UPDATE ads a SET
        revenue = COALESCE(d.revenue, 0),
        purchases_count = COALESCE(d.sotuv, 0),
        roas = CASE WHEN a.spend > 0 THEN COALESCE(d.revenue,0) / a.spend END
       FROM (SELECT last_click_ad_id AS ad_id,
                    SUM(revenue) AS revenue,
                    COUNT(*) FILTER (WHERE status = 'won') AS sotuv
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
    await pool.query(
      `UPDATE ${t} p SET
          revenue = COALESCE(d.revenue, 0),
          purchases_count = COALESCE(d.sotuv, 0),
          roas = CASE WHEN p.spend > 0 THEN COALESCE(d.revenue,0) / p.spend END
         FROM (SELECT ${col} AS pid,
                      SUM(revenue) AS revenue,
                      SUM(purchases_count) AS sotuv
                 FROM ads
                WHERE workspace_id = $1 AND ${col} IS NOT NULL
                GROUP BY ${col}) d
        WHERE p.id = d.pid AND p.workspace_id = $1`,
      [workspaceId]
    );
  }

  const tafovut = jamiFbNatija > 0 ? ((jamiFbNatija - jamiLid) / jamiFbNatija) * 100 : 0;

  console.log('');
  console.log('✅ Demo ma\'lumot yaratildi');
  console.log('─────────────────────────────────────');
  console.log(`  Reklama (REAL, Facebook'dan):  ${ads.length} ta ad`);
  console.log(`  FB natijasi:                   ${jamiFbNatija}`);
  console.log(`  CRM lidlari (demo):            ${jamiLid}`);
  console.log(`  ↳ tafovut:                     ${tafovut.toFixed(1)}%`);
  console.log(`  Sifatli lid:                   ${jamiSifatli}  (${((jamiSifatli / jamiLid) * 100).toFixed(1)}%)`);
  console.log(`  Sotuv:                         ${jamiSotuv}`);
  console.log(`  Daromad:                       $${jamiDaromad.toLocaleString()}`);
  console.log('─────────────────────────────────────');
  console.log('  Hammasi is_demo = true bilan belgilandi.');
  console.log('  O\'chirish uchun: npm run seed:clean');
}

async function main(): Promise<void> {
  const rejim = process.argv[2] === 'clean' ? 'clean' : 'seed';
  const wsArg = process.argv[3];

  try {
    const workspaceId = wsArg ?? (await workspaceTop());
    if (!workspaceId) {
      console.log('⚠ Workspace topilmadi. Avval Facebook sync qiling.');
      return;
    }
    console.log(`Workspace: ${workspaceId}`);

    if (rejim === 'clean') await clean(workspaceId);
    else await seed(workspaceId);
  } catch (err) {
    console.error('❌ Xato:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
