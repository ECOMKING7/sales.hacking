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

/**
 * Og'ir so'rovni o'z tranzaksiyasida, uzaytirilgan timeout bilan yurgizadi.
 *
 * Supabase'da `statement_timeout` qisqa qo'yilgan va katta INSERT/DELETE
 * "canceling statement due to statement timeout" bilan yiqiladi. Oddiy
 * `SET statement_timeout` yordam bermaydi: transaction pooler har so'rovni
 * boshqa server ulanishiga yuborishi mumkin, sozlama yo'qoladi. `SET LOCAL`
 * esa tranzaksiyaga bog'langan — butun tranzaksiya bitta ulanishda qoladi.
 *
 * `qadam` — xato bo'lganda qaysi bosqichda yiqilgani logda ko'rinsin uchun.
 */
async function katta(qadam: string, sql: string, params: unknown[] = []): Promise<number> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL statement_timeout = '180s'");
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r.rowCount ?? 0;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw new Error(`[${qadam}] ${(err as Error).message}`);
  } finally {
    c.release();
  }
}

/**
 * Katta DELETE'ni bo'lakka bo'lib o'chiradi. Bitta so'rovda 10 000 qator
 * o'chirish timeout'ga urilishi mumkin; 2000 talab hech qachon urilmaydi.
 */
async function bolakOchir(qadam: string, sql: string, params: unknown[]): Promise<number> {
  let jami = 0;
  for (;;) {
    const n = await katta(qadam, sql, params);
    jami += n;
    if (n === 0) break;
    process.stdout.write(`  … ${qadam}: ${jami}\r`);
  }
  if (jami > 0) process.stdout.write('\n');
  return jami;
}

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
  const tp = await bolakOchir(
    'touchpoints',
    `DELETE FROM touchpoints
      WHERE ctid IN (
        SELECT ctid FROM touchpoints
         WHERE workspace_id = $1 AND is_demo = true
         LIMIT 2000
      )`,
    [workspaceId]
  );
  const ld = await bolakOchir(
    'leads',
    `DELETE FROM leads
      WHERE ctid IN (
        SELECT ctid FROM leads
         WHERE workspace_id = $1 AND is_demo = true
         LIMIT 2000
      )`,
    [workspaceId]
  );

  // Roll-up ustunlar nolga qaytadi. Facebook'ning o'z daromad raqami bo'lsa,
  // keyingi sync uni qaytadan yozadi.
  for (const t of ['ads', 'adsets', 'campaigns']) {
    await katta(
      `reset:${t}`,
      `UPDATE ${t} SET revenue = 0, purchases_count = 0, roas = NULL
        WHERE workspace_id = $1 AND (revenue <> 0 OR purchases_count <> 0 OR roas IS NOT NULL)`,
      [workspaceId]
    );
  }

  console.log(`🧹 Tozalandi: ${ld} lid, ${tp} touchpoint`);
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

  // Barcha lidlar avval xotirada yig'iladi, keyin PARTIYALAB yoziladi.
  //
  // Ilgari har lid uchun alohida INSERT ketardi: 500 lid = 1000 ta so'rov
  // Frankfurt'dagi bazaga. Toshkentdan har biri ~150ms — jami 2.5 daqiqa va
  // ko'pincha oxirigacha yetmasdi. Partiyada 4-5 so'rov qoladi.
  type LeadRow = [
    string, string, string, string, string, number,
    string, number, number | null,
    Date, Date | null, Date | null, Date | null, string,
  ];
  const batch: LeadRow[] = [];

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
      // Lid oxirgi 30 kun ichida tushgan. Sifatli/sotuv sanalari undan
      // KEYIN keladi, shuning uchun lid yetarlicha eski bo'lishi kerak —
      // aks holda "kelajakda yopilgan" lid chiqadi.
      const yosh = between(r, 0, 30);
      const yaratilgan = kunQosh(hozir, -yosh);
      const crmId = `demo-${ad.id.slice(0, 8)}-${i}`;

      const sifatliKechikish = between(r, 0.5, 4);
      const dealKun = intBetween(r, ...arx.kun);

      // Yosh yetmasa bosqichga o'tmaydi — tabiiy: kecha tushgan lid
      // bugun yopilgan bo'lolmaydi.
      const sifatliMi = r() < sifatliEhtimol && yosh > sifatliKechikish;
      const sotildiMi = sifatliMi && r() < yopilishEhtimol && yosh > dealKun;

      const sifatliSana = sifatliMi ? kunQosh(yaratilgan, sifatliKechikish) : null;
      const yopilganSana = sotildiMi ? kunQosh(yaratilgan, dealKun) : null;
      const chek = sotildiMi ? Math.round(between(r, ...arx.chek)) : 0;

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

      batch.push([
        workspaceId,
        crmId,
        hash(`998${intBetween(r, 900000000, 999999999)}`),
        hash(`demo-${ad.id.slice(0, 8)}-${i}@example.uz`),
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
      ]);

      jamiLid++;
      if (sifatliMi) jamiSifatli++;
      if (sotildiMi) {
        jamiSotuv++;
        jamiDaromad += chek;
      }
    }
  }

  // ---------- partiyalab yozish ----------
  const FIELDS = 14;
  const CHUNK = 200; // 200 × 14 = 2800 parametr; kichik partiya timeout'ga urilmaydi

  for (let ofs = 0; ofs < batch.length; ofs += CHUNK) {
    const chunk = batch.slice(ofs, ofs + CHUNK);
    const values = chunk
      .map((_, i) => {
        const b = i * FIELDS;
        const p = Array.from({ length: FIELDS }, (_, k) => `$${b + k + 1}`).join(',');
        return `(${p}, true)`;
      })
      .join(',');

    await katta(
      'leads-insert',
      `INSERT INTO leads
         (workspace_id, crm_lead_id, phone_hash, email_hash, status, revenue,
          last_click_ad_id, total_touches, deal_time_days,
          crm_created_at, qualified_at, won_at, lost_at, crm_stage, is_demo)
       VALUES ${values}
       ON CONFLICT (workspace_id, crm_lead_id) DO NOTHING`,
      chunk.flat()
    );
    console.log(`  … ${Math.min(ofs + CHUNK, batch.length)} / ${batch.length} lid`);
  }

  // Touchpoint'lar lidlardan hosil qilinadi — alohida so'rov ketmaydi.
  // `ad_id` lidda allaqachon bor, adset/campaign ads jadvalidan olinadi.
  await katta(
    'touchpoints-insert',
    `INSERT INTO touchpoints
       (workspace_id, lead_id, ad_id, adset_id, campaign_id,
        event_type, touch_number, attribution_weight, fbclid, occurred_at, is_demo)
     SELECT l.workspace_id, l.id, a.id, a.adset_id, a.campaign_id,
            'lead', 1, 1.0, 'demo_' || replace(l.id::text, '-', ''), l.crm_created_at, true
       FROM leads l
       JOIN ads a ON a.id = l.last_click_ad_id
      WHERE l.workspace_id = $1
        AND l.is_demo = true
        AND NOT EXISTS (SELECT 1 FROM touchpoints t WHERE t.lead_id = l.id)`,
    [workspaceId]
  );

  // ---------- roll-up ----------
  // Daromad lidlardan ad → adset → kampaniyaga ko'tariladi. Atribusiya
  // dvigateli ham aynan shuni qiladi; demo o'sha yo'ldan boradi.
  await katta(
    'rollup:ads',
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
    await katta(
      `rollup:${t}`,
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
