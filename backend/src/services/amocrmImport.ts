/**
 * amoCRM tarixiy lidlarini import qilish.
 *
 * NEGA KERAK
 * Tizim lidlarni FAQAT webhook orqali oladi. Webhook esa faqat
 * ulangandan KEYINGI hodisalarni ko'radi. Ya'ni yangi mijoz ulanganda
 * dashboard bo'sh turadi va u mahsulotni baholay olmaydi — birinchi
 * sotuvni kutish kerak bo'ladi.
 *
 * Bu modul tarixni bir marta tortib oladi: lidlar, etaplari, summasi,
 * UTM maydonlari va kontakt (telefon/email). Keyin atribusiya
 * hisoblanadi va voronka darhol to'ladi.
 *
 * SO'ROVLAR SONI — ASOSIY CHEKLOV
 * amoCRM akkaunti 15.09 da limitdan oshgani uchun bloklangan edi.
 * Shuning uchun:
 *   - lidlar 250 talab sahifa bilan olinadi (maksimal ruxsat etilgan),
 *   - UTM lid javobining o'zida keladi — har lid uchun alohida so'rov YO'Q,
 *   - kontaktlar id bo'yicha guruhlab olinadi (40 tadan), har lid
 *     uchun alohida so'rov o'rniga,
 *   - har so'rovdan keyin pauza (PAUZA_MS), ya'ni ~4 so'rov/sekund.
 * 10 000 lid ≈ 40 sahifa ≈ 10 soniya. Bu amoCRM uchun xavfsiz tezlik.
 *
 * ⚠ TEKSHIRILISHI KERAK: amoCRM hujjatida limit "7 so'rov/sekund" deb
 * yozilgan, lekin amalda akkaunt turiga qarab pastroq bo'lishi mumkin.
 *
 * YOZISH QOIDASI (§4.3)
 * Bu modul amoCRM ga HECH NARSA YOZMAYDI — faqat GET. Yozish bizning
 * bazamizga ketadi.
 */
import { pool } from '../db/pool';
import { amoGetPath, hashPhone, hashEmail } from './amocrmService';
import { extractUtm, matchLeadToAd } from './leadMatcher';
import { extractLeadId, extractLine } from './amocrmFields';
import { processLeadAttribution } from './attributionEngine';

/** Bitta sahifadagi yozuvlar soni — amoCRM ruxsat bergan maksimum. */
const SAHIFA = 250;
/** So'rovlar orasidagi pauza. 250ms ≈ 4 so'rov/sekund. */
const PAUZA_MS = 250;
/** Xavfsizlik to'ri: cheksiz sahifalashdan saqlaydi. */
const MAX_SAHIFA = 400;
/** amoCRM'da universal "yutqazildi" etapi. */
const YUTQAZILDI = '143';

function kut(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface AmoMaydon {
  field_id?: number;
  field_name?: string;
  field_code?: string;
  values?: Array<{ value?: string }>;
}

interface AmoLid {
  id: number;
  price?: number;
  status_id?: number;
  pipeline_id?: number;
  created_at?: number;
  closed_at?: number;
  custom_fields_values?: AmoMaydon[] | null;
  _embedded?: { contacts?: Array<{ id: number }> };
}

interface AmoKontakt {
  id: number;
  custom_fields_values?: AmoMaydon[] | null;
}

interface AmoRoyxat<T> {
  _embedded?: { leads?: T[]; contacts?: T[] };
  _page?: number;
}

export interface ImportConfig {
  attribution_key: string;
  phone_country_code: string;
  /**
   * Etap ta'riflari — FAQAT juftlik shaklida ('voronka:etap').
   *
   * Eski maydonlar (amocrm_won_stage_id, amocrm_qualified_stage_ids)
   * 028 migratsiyasida juftliklarga ko'chirildi va bu yerdan olib
   * tashlandi. Zaxira yo'l xato bermasdi — JIMGINA BOSHQA javob
   * berardi, va aynan shu Furninglass'da daromadning 97.6% ini
   * ko'rinmas qilgan edi.
   */
  amocrm_won_pairs: string[];
  amocrm_qualified_pairs: string[];
  /** §3.3 etaplar.yangi — voronkaning birinchi bosqichi. */
  amocrm_lead_pairs: string[];
  /** Meta Lead ID qaysi maydonda (amoCRM field_id). NULL — sozlanmagan. */
  amocrm_lead_id_field: string | null;
  /** Qo'ng'iroq liniyasi qaysi maydonda. NULL — sozlanmagan. */
  amocrm_line_field: string | null;
}

export interface ImportNatija {
  lidlar: number;
  yangilangan: number;
  yutilgan: number;
  sifatli: number;
  kontaktlar: number;
  sorovlar: number;
  xatolar: number;
}

export async function loadImportConfig(workspaceId: string): Promise<ImportConfig> {
  const { rows } = await pool.query<ImportConfig>(
    `SELECT COALESCE(attribution_key, 'utm_term')        AS attribution_key,
            COALESCE(phone_country_code, '998')          AS phone_country_code,
            COALESCE(amocrm_won_pairs, '{}')             AS amocrm_won_pairs,
            COALESCE(amocrm_qualified_pairs, '{}')       AS amocrm_qualified_pairs,
            COALESCE(amocrm_lead_pairs, '{}')            AS amocrm_lead_pairs,
            amocrm_lead_id_field,
            amocrm_line_field
       FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  if (!rows[0]) throw new Error('Workspace topilmadi');
  return rows[0];
}

/** (voronka:etap) kaliti — webhook bilan bir xil qoida. */
function juftlik(pipelineId: string | null, statusId: string | null): string | null {
  if (!pipelineId || !statusId) return null;
  return `${pipelineId}:${statusId}`;
}

/**
 * Etapdan holat. Webhook'dagi mantiqning aynan o'zi:
 * 142 va 143 har voronkada bor, shuning uchun juftlik bo'yicha qaraladi.
 */
export function holatAniqla(
  pipelineId: string | null,
  statusId: string | null,
  config: ImportConfig
): { status: 'new' | 'won' | 'lost' | 'in_progress'; sifatli: boolean } {
  const key = juftlik(pipelineId, statusId);

  let status: 'new' | 'won' | 'lost' | 'in_progress' = 'in_progress';
  if (key !== null && config.amocrm_won_pairs.includes(key)) status = 'won';
  else if (statusId === YUTQAZILDI) status = 'lost';
  // Birinchi bosqich — hali ishlov berilmagan lid. Belgilanmagan
  // bo'lsa xatti-harakat o'zgarmaydi ('in_progress' qoladi).
  else if (key !== null && config.amocrm_lead_pairs.includes(key)) status = 'new';

  const sifatliEtap = key !== null && config.amocrm_qualified_pairs.includes(key);

  return { status, sifatli: sifatliEtap || status === 'won' };
}

/**
 * Kerakli kontaktlarni id bo'yicha oladi: id -> { phone, email }.
 *
 * Ilgari BUTUN kontaktlar ro'yxati oldindan yuklanardi. Bo'lakli
 * import'da bu ishlamaydi: har bo'lak butun bazani qayta tortardi.
 * Endi faqat shu bo'lakdagi lidlarning kontaktlari so'raladi.
 *
 * URL uzunligi cheklovi bor, shuning uchun id lar 40 talab yuboriladi.
 * 250 lid ≈ 7 so'rov.
 */
async function kontaktlarniOl(
  workspaceId: string,
  idlar: string[],
  hisob: { sorovlar: number }
): Promise<Map<string, { phone: string | null; email: string | null }>> {
  const xarita = new Map<string, { phone: string | null; email: string | null }>();
  const noyob = [...new Set(idlar)].filter(Boolean);
  const BOLAK = 40;

  for (let i = 0; i < noyob.length; i += BOLAK) {
    const qism = noyob.slice(i, i + BOLAK);
    const q = qism.map((id) => `filter[id][]=${encodeURIComponent(id)}`).join('&');

    try {
      const data = await amoGetPath<AmoRoyxat<AmoKontakt>>(
        workspaceId,
        `/api/v4/contacts?limit=${BOLAK}&${q}`
      );
      hisob.sorovlar += 1;

      for (const k of data?._embedded?.contacts ?? []) {
        const f = k.custom_fields_values ?? [];
        const top = (code: string) =>
          f.find((x) => x.field_code === code)?.values?.[0]?.value ?? null;
        xarita.set(String(k.id), { phone: top('PHONE'), email: top('EMAIL') });
      }
    } catch (err) {
      // Kontakt olinmasa lid baribir yoziladi — faqat telefon/email bo'lmaydi.
      console.error('kontaktlar olinmadi:', (err as Error).message);
    }

    if (i + BOLAK < noyob.length) await kut(PAUZA_MS);
  }

  return xarita;
}

/** Bitta bo'lak natijasi. */
export interface BolakNatija extends ImportNatija {
  /** Keyingi sahifa raqami; null — tugadi. */
  keyingiSahifa: number | null;
  sahifa: number;
}

/**
 * BITTA sahifani (250 lid) import qiladi.
 *
 * NEGA BO'LAK-BO'LAK: serverless funksiya 10–60 soniyada uziladi.
 * Butun tarixni bitta so'rovda tortib bo'lmaydi — funksiya o'rtada
 * o'ladi va qayerda to'xtaganini hech kim bilmaydi. Bo'lak esa o'zini
 * o'zi tugatadi va "keyingi sahifa" raqamini qaytaradi; chaqiruvchi
 * (frontend yoki skript) oxirigacha aylantiradi.
 *
 * Har bo'lak idempotent: ON CONFLICT bilan yoziladi, ya'ni bir sahifa
 * ikki marta ishlansa ham dublikat paydo bo'lmaydi.
 */
export async function importChunk(
  workspaceId: string,
  opts: { kunlar?: number; sahifa?: number } = {}
): Promise<BolakNatija> {
  const config = await loadImportConfig(workspaceId);

  if (config.amocrm_won_pairs.length === 0) {
    // Sotuv ta'rifi yo'q bo'lsa import ma'nosiz: hamma lid 'in_progress'
    // bo'lib qoladi va daromad hech qachon hisoblanmaydi.
    throw Object.assign(
      new Error(
        "Sotuv etaplari sozlanmagan. Avval Sozlamalar > amoCRM da sotuv etapini belgilang."
      ),
      { status: 400 }
    );
  }

  const sahifa = Math.max(1, Math.min(MAX_SAHIFA, opts.sahifa ?? 1));
  const kunlar = opts.kunlar;
  const filtr =
    kunlar && kunlar > 0
      ? `&filter[created_at][from]=${Math.floor(Date.now() / 1000) - kunlar * 86400}`
      : '';

  const natija: BolakNatija = {
    lidlar: 0,
    yangilangan: 0,
    yutilgan: 0,
    sifatli: 0,
    kontaktlar: 0,
    sorovlar: 0,
    xatolar: 0,
    sahifa,
    keyingiSahifa: null,
  };

  const data = await amoGetPath<AmoRoyxat<AmoLid>>(
    workspaceId,
    `/api/v4/leads?limit=${SAHIFA}&page=${sahifa}&with=contacts${filtr}`
  );
  natija.sorovlar += 1;

  const list = data?._embedded?.leads ?? [];
  if (list.length === 0) return natija;

  // Shu sahifadagi lidlarning kontaktlari — bitta guruh bo'lib.
  const kontaktIdlar = list
    .map((l) => l._embedded?.contacts?.[0]?.id)
    .filter((v): v is number => typeof v === 'number')
    .map(String);
  const hisob = { sorovlar: 0 };
  const kontaktlar = await kontaktlarniOl(workspaceId, kontaktIdlar, hisob);
  natija.sorovlar += hisob.sorovlar;
  natija.kontaktlar = kontaktlar.size;

  const yutilganIdlar: string[] = [];

  for (const lid of list) {
    try {
      await lidYoz(workspaceId, lid, config, kontaktlar, natija, yutilganIdlar);
    } catch (err) {
      // Bitta lid qolganlarini to'xtatmaydi.
      natija.xatolar += 1;
      console.error(`lid ${lid.id}: ${(err as Error).message}`);
    }
  }

  // Atribusiya — faqat yutilganlar uchun, va faqat bizning bazada
  // (amoCRM ga so'rov ketmaydi).
  for (const leadId of yutilganIdlar) {
    try {
      await processLeadAttribution(leadId, workspaceId);
    } catch (err) {
      natija.xatolar += 1;
      console.error(`atribusiya ${leadId}: ${(err as Error).message}`);
    }
  }

  // To'liq sahifa kelgan bo'lsa — yana bor demak.
  natija.keyingiSahifa = list.length === SAHIFA ? sahifa + 1 : null;
  return natija;
}

/**
 * Hamma bo'lakni ketma-ket ishlaydi. Skript uchun — u yerda vaqt
 * cheklovi yo'q.
 */
export async function importAmoLeads(
  workspaceId: string,
  kunlar?: number,
  onLog: (s: string) => void = () => undefined
): Promise<ImportNatija> {
  const jami: ImportNatija = {
    lidlar: 0,
    yangilangan: 0,
    yutilgan: 0,
    sifatli: 0,
    kontaktlar: 0,
    sorovlar: 0,
    xatolar: 0,
  };

  let sahifa: number | null = 1;
  while (sahifa !== null) {
    const b = await importChunk(workspaceId, { kunlar, sahifa });
    jami.lidlar += b.lidlar;
    jami.yangilangan += b.yangilangan;
    jami.yutilgan += b.yutilgan;
    jami.sifatli += b.sifatli;
    jami.kontaktlar += b.kontaktlar;
    jami.sorovlar += b.sorovlar;
    jami.xatolar += b.xatolar;

    onLog(`  sahifa ${b.sahifa}: ${b.lidlar} lid, ${b.yutilgan} sotuv`);

    sahifa = b.keyingiSahifa;
    if (sahifa !== null) await kut(PAUZA_MS);
  }

  return jami;
}

async function lidYoz(
  workspaceId: string,
  lid: AmoLid,
  config: ImportConfig,
  kontaktlar: Map<string, { phone: string | null; email: string | null }>,
  natija: ImportNatija,
  yutilganIdlar: string[]
): Promise<void> {
  const crmLeadId = String(lid.id);
  const statusId = lid.status_id != null ? String(lid.status_id) : null;
  const pipelineId = lid.pipeline_id != null ? String(lid.pipeline_id) : null;

  const { status, sifatli } = holatAniqla(pipelineId, statusId, config);
  const maydonlar = lid.custom_fields_values ?? [];
  const utm = extractUtm(maydonlar);
  // Meta Lead ID va qo'ng'iroq liniyasi — ikkalasi ham konfiguratsiyadagi
  // maydondan o'qiladi. Sozlanmagan bo'lsa null, bu xato emas.
  const fbLeadId = extractLeadId(maydonlar, config.amocrm_lead_id_field);
  const sourceLine = extractLine(maydonlar, config.amocrm_line_field);

  const contactId = lid._embedded?.contacts?.[0]?.id ?? null;
  const kontakt = contactId ? kontaktlar.get(String(contactId)) : undefined;
  const phoneHash = kontakt?.phone
    ? hashPhone(kontakt.phone, config.phone_country_code)
    : null;
  const emailHash = kontakt?.email ? hashEmail(kontakt.email) : null;

  const match = await matchLeadToAd(
    workspaceId,
    {
      utmTerm: utm.utm_term,
      utmContent: utm.utm_content,
      utmCampaign: utm.utm_campaign,
      fbclid: utm.fbclid,
      phoneHash,
      emailHash,
    },
    config.attribution_key
  );

  // Vaqtlar amoCRM'dan olinadi, import kunidan EMAS. Aks holda butun
  // tarix bugungi kunga yig'ilib qolardi va deal time 0 chiqardi.
  //
  // ⚠ CHEKLOV: amoCRM lid ro'yxatida "qaysi etapga qachon o'tgan"
  // tarixi yo'q — faqat HOZIRGI etap va yopilgan sana bor. Shuning
  // uchun `qualified_at` yopilgan (yoki yaratilgan) sanaga qo'yiladi.
  // SONI to'g'ri (sifatli lid sanaladi), SANASI taxminiy.
  // Aniq sana kerak bo'lsa amoCRM events API dan o'qish kerak —
  // bu har lid uchun alohida so'rov, ya'ni limitni yeydi.
  // Webhook orqali kelgan yangi lidlarda sana aniq bo'ladi.
  const created = lid.created_at ?? null;
  const closed = lid.closed_at ?? null;
  const wonAt = status === 'won' ? closed ?? created : null;

  const { rows } = await pool.query<{ id: string; yangi: boolean }>(
    `INSERT INTO leads
       (workspace_id, crm_lead_id, crm_contact_id, phone_hash, email_hash,
        status, revenue, crm_created_at, won_at, lost_at, qualified_at, crm_stage,
        deal_time_days,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
        last_click_ad_id, first_click_ad_id, match_method,
        fb_lead_id, source_line)
     VALUES ($1,$2,$3,$4,$5,$6,$7,
             CASE WHEN $8::bigint IS NULL THEN NULL ELSE to_timestamp($8::bigint) END,
             CASE WHEN $9::bigint IS NULL THEN NULL ELSE to_timestamp($9::bigint) END,
             CASE WHEN $10 = 'lost' AND $11::bigint IS NOT NULL
                  THEN to_timestamp($11::bigint) END,
             CASE WHEN $12 THEN
                  COALESCE(
                    CASE WHEN $9::bigint IS NULL THEN NULL ELSE to_timestamp($9::bigint) END,
                    CASE WHEN $8::bigint IS NULL THEN NULL ELSE to_timestamp($8::bigint) END
                  )
             END,
             $13,
             CASE WHEN $9::bigint IS NOT NULL AND $8::bigint IS NOT NULL
                  THEN GREATEST(0, (($9::bigint - $8::bigint) / 86400)::int) END,
             $14,$15,$16,$17,$18,$19,$20,$20,$21,$22,$23)
     ON CONFLICT (workspace_id, crm_lead_id) DO UPDATE SET
        crm_contact_id = COALESCE(EXCLUDED.crm_contact_id, leads.crm_contact_id),
        phone_hash     = COALESCE(EXCLUDED.phone_hash, leads.phone_hash),
        email_hash     = COALESCE(EXCLUDED.email_hash, leads.email_hash),
        -- Etap va summa CRM'niki: import haqiqatni CRM'dan oladi.
        status   = EXCLUDED.status,
        revenue  = EXCLUDED.revenue,
        crm_stage = COALESCE(EXCLUDED.crm_stage, leads.crm_stage),
        won_at   = COALESCE(EXCLUDED.won_at, leads.won_at),
        lost_at  = COALESCE(EXCLUDED.lost_at, leads.lost_at),
        -- "Sifatli bo'lgan" fakti yo'qolmaydi: lid orqaga qaytsa ham
        -- birinchi yetgan vaqti saqlanadi.
        qualified_at = COALESCE(leads.qualified_at, EXCLUDED.qualified_at),
        deal_time_days = COALESCE(EXCLUDED.deal_time_days, leads.deal_time_days),
        -- UTM faqat bo'sh bo'lsa to'ldiriladi.
        utm_source   = COALESCE(leads.utm_source,   EXCLUDED.utm_source),
        utm_medium   = COALESCE(leads.utm_medium,   EXCLUDED.utm_medium),
        utm_campaign = COALESCE(leads.utm_campaign, EXCLUDED.utm_campaign),
        utm_content  = COALESCE(leads.utm_content,  EXCLUDED.utm_content),
        utm_term     = COALESCE(leads.utm_term,     EXCLUDED.utm_term),
        fbclid       = COALESCE(leads.fbclid,       EXCLUDED.fbclid),
        last_click_ad_id  = COALESCE(leads.last_click_ad_id,  EXCLUDED.last_click_ad_id),
        first_click_ad_id = COALESCE(leads.first_click_ad_id, EXCLUDED.first_click_ad_id),
        match_method      = COALESCE(leads.match_method,      EXCLUDED.match_method),
        -- Manba kalitlari: bir marta topilgach yo'qolmaydi. Maydon
        -- keyinroq sozlansa, keyingi import ularni to'ldiradi.
        fb_lead_id        = COALESCE(leads.fb_lead_id,        EXCLUDED.fb_lead_id),
        source_line       = COALESCE(leads.source_line,       EXCLUDED.source_line)
     RETURNING id, (xmax = 0) AS yangi`,
    [
      workspaceId,
      crmLeadId,
      contactId ? String(contactId) : null,
      phoneHash,
      emailHash,
      status,
      num(lid.price),
      created,
      wonAt,
      status,
      closed,
      sifatli,
      statusId,
      utm.utm_source ?? null,
      utm.utm_medium ?? null,
      utm.utm_campaign ?? null,
      utm.utm_content ?? null,
      utm.utm_term ?? null,
      utm.fbclid ?? null,
      match.adId,
      match.method,
      fbLeadId,
      sourceLine,
    ]
  );

  const row = rows[0];
  natija.lidlar += 1;
  if (row && !row.yangi) natija.yangilangan += 1;
  if (sifatli) natija.sifatli += 1;
  if (status === 'won') {
    natija.yutilgan += 1;
    if (row) yutilganIdlar.push(row.id);
  }
}
