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
 *   - kontaktlar ham 250 talab, ALOHIDA ro'yxat bo'lib olinadi va
 *     xotirada xaritaga aylantiriladi (har lid uchun so'rov o'rniga),
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
  amocrm_won_pairs: string[];
  amocrm_qualified_pairs: string[];
  amocrm_won_stage_id: string | null;
  amocrm_pipeline_id: string | null;
  amocrm_qualified_stage_ids: string[];
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
            amocrm_won_stage_id,
            amocrm_pipeline_id,
            COALESCE(amocrm_qualified_stage_ids, '{}')   AS amocrm_qualified_stage_ids
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
): { status: 'won' | 'lost' | 'in_progress'; sifatli: boolean } {
  const key = juftlik(pipelineId, statusId);

  const wonByPair = key !== null && config.amocrm_won_pairs.includes(key);
  const wonByLegacy =
    config.amocrm_won_pairs.length === 0 &&
    Boolean(config.amocrm_won_stage_id) &&
    statusId === config.amocrm_won_stage_id &&
    (!config.amocrm_pipeline_id || pipelineId === config.amocrm_pipeline_id);

  let status: 'won' | 'lost' | 'in_progress' = 'in_progress';
  if (wonByPair || wonByLegacy) status = 'won';
  else if (statusId === YUTQAZILDI) status = 'lost';

  const sifatliEtap =
    (key !== null && config.amocrm_qualified_pairs.includes(key)) ||
    (config.amocrm_qualified_pairs.length === 0 &&
      statusId !== null &&
      config.amocrm_qualified_stage_ids.includes(statusId));

  return { status, sifatli: sifatliEtap || status === 'won' };
}

/**
 * Kontaktlar xaritasi: id -> { phone, email }.
 *
 * Har lid uchun alohida so'rov o'rniga hammasi ro'yxat bo'lib olinadi.
 * 5 000 kontakt = 20 so'rov, har lid uchun so'rovda esa 5 000 so'rov
 * bo'lardi — akkaunt aniq bloklanardi.
 */
async function kontaktXaritasi(
  workspaceId: string,
  hisob: { sorovlar: number }
): Promise<Map<string, { phone: string | null; email: string | null }>> {
  const xarita = new Map<string, { phone: string | null; email: string | null }>();

  for (let sahifa = 1; sahifa <= MAX_SAHIFA; sahifa += 1) {
    const data = await amoGetPath<AmoRoyxat<AmoKontakt>>(
      workspaceId,
      `/api/v4/contacts?limit=${SAHIFA}&page=${sahifa}`
    );
    hisob.sorovlar += 1;

    const list = data?._embedded?.contacts ?? [];
    if (list.length === 0) break;

    for (const k of list) {
      const f = k.custom_fields_values ?? [];
      const top = (code: string) =>
        f.find((x) => x.field_code === code)?.values?.[0]?.value ?? null;
      xarita.set(String(k.id), { phone: top('PHONE'), email: top('EMAIL') });
    }

    if (list.length < SAHIFA) break;
    await kut(PAUZA_MS);
  }

  return xarita;
}

/**
 * Tarixiy lidlarni import qiladi.
 *
 * @param kunlar  Necha kunlik tarix olinadi. 0 yoki undefined — hammasi.
 * @param onLog   Jarayonni ko'rsatish uchun (skript konsolga yozadi).
 */
export async function importAmoLeads(
  workspaceId: string,
  kunlar?: number,
  onLog: (s: string) => void = () => undefined
): Promise<ImportNatija> {
  const config = await loadImportConfig(workspaceId);
  const hisob = { sorovlar: 0 };

  if (config.amocrm_won_pairs.length === 0 && !config.amocrm_won_stage_id) {
    // Sotuv ta'rifi yo'q bo'lsa import ma'nosiz: hamma lid 'in_progress'
    // bo'lib qoladi va daromad hech qachon hisoblanmaydi.
    throw new Error(
      'Sotuv etaplari sozlanmagan (amocrm_won_pairs bo\'sh). ' +
        'Avval Sozlamalar > amoCRM da sotuv etaplarini belgilang.'
    );
  }

  onLog('Kontaktlar yuklanmoqda...');
  const kontaktlar = await kontaktXaritasi(workspaceId, hisob);
  onLog(`  ${kontaktlar.size} ta kontakt`);

  const natija: ImportNatija = {
    lidlar: 0,
    yangilangan: 0,
    yutilgan: 0,
    sifatli: 0,
    kontaktlar: kontaktlar.size,
    sorovlar: hisob.sorovlar,
    xatolar: 0,
  };

  const filtr =
    kunlar && kunlar > 0
      ? `&filter[created_at][from]=${Math.floor(Date.now() / 1000) - kunlar * 86400}`
      : '';

  const yutilganIdlar: string[] = [];

  onLog('Lidlar yuklanmoqda...');
  for (let sahifa = 1; sahifa <= MAX_SAHIFA; sahifa += 1) {
    const data = await amoGetPath<AmoRoyxat<AmoLid>>(
      workspaceId,
      `/api/v4/leads?limit=${SAHIFA}&page=${sahifa}&with=contacts${filtr}`
    );
    natija.sorovlar += 1;

    const list = data?._embedded?.leads ?? [];
    if (list.length === 0) break;

    for (const lid of list) {
      try {
        await lidYoz(workspaceId, lid, config, kontaktlar, natija, yutilganIdlar);
      } catch (err) {
        // Bitta lid qolganlarini to'xtatmaydi.
        natija.xatolar += 1;
        console.error(`lid ${lid.id}: ${(err as Error).message}`);
      }
    }

    onLog(`  ${natija.lidlar} ta lid...`);
    if (list.length < SAHIFA) break;
    await kut(PAUZA_MS);
  }

  // Atribusiya — yutilgan lidlar uchun. Bu bosqich amoCRM ga so'rov
  // yubormaydi, faqat bizning bazada hisoblanadi.
  if (yutilganIdlar.length) {
    onLog(`Atribusiya: ${yutilganIdlar.length} ta yutilgan lid...`);
    for (const leadId of yutilganIdlar) {
      try {
        await processLeadAttribution(leadId, workspaceId);
      } catch (err) {
        natija.xatolar += 1;
        console.error(`atribusiya ${leadId}: ${(err as Error).message}`);
      }
    }
  }

  return natija;
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
  const utm = extractUtm(lid.custom_fields_values ?? []);

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
        last_click_ad_id, first_click_ad_id, match_method)
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
             $14,$15,$16,$17,$18,$19,$20,$20,$21)
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
        match_method      = COALESCE(leads.match_method,      EXCLUDED.match_method)
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
