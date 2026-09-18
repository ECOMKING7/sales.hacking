import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { getLead, getContact, hashPhone, hashEmail } from '../services/amocrmService';
import { phoneShape } from '../utils/phone';
import {
  loadCapiConfig,
  loadCapiLead,
  sendCapiEvent,
  type CapiStage,
} from '../services/metaCapi';
import { processLeadAttribution } from '../services/attributionEngine';
import { extractUtm, matchLeadToAd } from '../services/leadMatcher';
import { cacheDelPattern, overviewCachePattern } from '../utils/cache';
import { awaitWithDeadline } from '../utils/background';
import { xatoQayd } from '../utils/xatolar';

// AmoCRM's default "closed - lost" status id.
const DEFAULT_LOST_STATUS_ID = '143';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sameSecret(provided: string, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * AmoCRM webhook'ni HMAC bilan imzolay olmaydi, shuning uchun umumiy sir
 * ishlatiladi: `?secret=` yoki `X-Webhook-Secret` (URL ichiga yoziladi).
 *
 * Sir HAR MIJOZGA ALOHIDA. Ilgari bitta umumiy `.env` siri bor edi:
 * u sizib chiqsa, hamma mijozning webhook manziliga yolg'on lid
 * yuborish mumkin bo'lardi — ya'ni bitta sir butun bazani ochardi.
 *
 * `.env` dagi umumiy sir fallback sifatida qoldi: workspace'da sir
 * yo'q bo'lgan holatlar (migratsiyadan oldin ulangan akkauntlar)
 * ishlashda davom etadi.
 */
function verifySignature(req: Request, workspaceSecret: string | null): boolean {
  const provided =
    (typeof req.query.secret === 'string' ? req.query.secret : '') ||
    req.header('x-webhook-secret') ||
    '';

  if (workspaceSecret) return sameSecret(provided, workspaceSecret);

  const envSecret = process.env.AMOCRM_WEBHOOK_SECRET;
  if (!envSecret) return true; // hech qanday sir sozlanmagan (dev) → ruxsat
  return sameSecret(provided, envSecret);
}

interface AmoLeadEvent {
  id?: string;
  status_id?: string;
  pipeline_id?: string;
  price?: string;
  created_at?: string;
}
interface AmoContactEvent {
  id?: string;
}

interface WorkspaceCrmConfig {
  id: string;
  /**
   * ESKI maydonlar — 028 dan keyin QARORGA TA'SIR QILMAYDI.
   * Faqat hisobotning standart voronkasi uchun o'qiladi.
   */
  amocrm_pipeline_id: string | null;
  /** §3.1: bog'lanish kaliti kodda emas, konfiguratsiyada. */
  attribution_key: string;
  /** §3.1: telefon mamlakat kodi ham konfiguratsiyadan (E.164 uchun). */
  phone_country_code: string;
  /**
   * §3.3 etaplar — (voronka:etap) juftliklari, '10742882:142' ko'rinishida.
   *
   * Bitta voronka yetarli emas: mijozda voronka ikki bosqichli bo'lishi
   * mumkin (kvalifikatsiya -> sotuv) va pul ikkinchisida yopiladi.
   * Voronkasiz "142" ham yetarli emas — 142 har voronkada bor va
   * "otziv olindi" kabi etaplar ham 142 bo'lib chiqadi.
   */
  amocrm_won_pairs: string[];
  amocrm_qualified_pairs: string[];
  /** §3.3 etaplar.yangi — birinchi bosqich. */
  amocrm_lead_pairs: string[];
  /** Har mijozga alohida webhook siri; bo'lmasa .env dagi umumiysi. */
  amocrm_webhook_secret: string | null;
}

/** Hodisaning (voronka:etap) kaliti. Ikkisi ham bo'lmasa — null. */
function pairKey(pipelineId: string | null, statusId: string | null): string | null {
  if (!pipelineId || !statusId) return null;
  return `${pipelineId}:${statusId}`;
}

async function findWorkspaceBySubdomain(subdomain: string): Promise<WorkspaceCrmConfig | null> {
  const { rows } = await pool.query<WorkspaceCrmConfig>(
    `SELECT id, amocrm_pipeline_id,
            COALESCE(attribution_key, 'utm_term') AS attribution_key,
            COALESCE(phone_country_code, '998') AS phone_country_code,
            COALESCE(amocrm_won_pairs, '{}')           AS amocrm_won_pairs,
            COALESCE(amocrm_qualified_pairs, '{}')     AS amocrm_qualified_pairs,
            COALESCE(amocrm_lead_pairs, '{}')          AS amocrm_lead_pairs,
            amocrm_webhook_secret
       FROM workspaces WHERE amocrm_domain LIKE $1 LIMIT 1`,
    [`${subdomain}.%`]
  );
  return rows[0] ?? null;
}

/**
 * Fetch the authoritative deal value from the AmoCRM API. The webhook payload's
 * price can be missing or stale, so when a deal is won we pull the full lead and
 * use its price. Falls back to the webhook price if the API call fails.
 */
async function resolveWonRevenue(
  workspaceId: string,
  leadId: string,
  webhookPrice: number
): Promise<number> {
  try {
    const full = await getLead(workspaceId, leadId);
    const apiPrice = num(full.price);
    if (apiPrice > 0) return apiPrice;
  } catch (err) {
    console.error('could not fetch full lead price, using webhook price:', (err as Error).message);
  }
  return webhookPrice;
}

async function handleLeadAdd(
  workspaceId: string,
  lead: AmoLeadEvent,
  config: WorkspaceCrmConfig
): Promise<void> {
  if (!lead.id) return;

  let contactId: number | null = null;
  let phoneHash: string | null = null;
  let emailHash: string | null = null;
  let utm: ReturnType<typeof extractUtm> = {};

  // Enrich with contact info + UTM from the AmoCRM API (needs a valid token).
  try {
    const full = await getLead(workspaceId, lead.id);
    // UTM lid maydonlarida keladi — atribusiyaning asosiy kaliti (§5).
    utm = extractUtm(full.custom_fields_values);
    contactId = full._embedded?.contacts?.[0]?.id ?? null;
    if (contactId) {
      const contact = await getContact(workspaceId, contactId);
      if (contact.phone) {
        phoneHash = hashPhone(contact.phone, config.phone_country_code);
        // Raqamning o'zi emas, faqat "shakli" log'ga tushadi (§4.2 ruhida).
        if (!phoneHash) {
          console.warn(
            `lead ${lead.id}: telefon E.164 ga kelmadi (${phoneShape(
              contact.phone,
              config.phone_country_code
            )})`
          );
        }
      }
      if (contact.email) emailHash = hashEmail(contact.email);
    }
  } catch (err) {
    console.error('lead enrichment failed (will store minimal lead):', (err as Error).message);
  }

  // Reklamani darhol topamiz — sotuvni kutmasdan. Shunda lid hali yangi
  // bo'lganda ham "qaysi reklamadan keldi" ma'lum bo'ladi va voronkaning
  // birinchi bosqichi ishlaydi.
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

  if (match.note) console.warn(`lead ${lead.id}: ${match.note}`);

  await pool.query(
    `INSERT INTO leads
       (workspace_id, crm_lead_id, crm_contact_id, phone_hash, email_hash,
        status, revenue, crm_created_at,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
        last_click_ad_id, first_click_ad_id, match_method)
     VALUES ($1,$2,$3,$4,$5,'new',$6,
             CASE WHEN $7::bigint IS NULL THEN NULL ELSE to_timestamp($7::bigint) END,
             $8,$9,$10,$11,$12,$13,$14,$14,$15)
     ON CONFLICT (workspace_id, crm_lead_id) DO UPDATE SET
        crm_contact_id = COALESCE(EXCLUDED.crm_contact_id, leads.crm_contact_id),
        phone_hash = COALESCE(EXCLUDED.phone_hash, leads.phone_hash),
        email_hash = COALESCE(EXCLUDED.email_hash, leads.email_hash),
        -- UTM faqat bo'sh bo'lsa to'ldiriladi: birinchi qiymat haqiqat,
        -- keyingi webhook uni o'chirib yubormasin.
        utm_source   = COALESCE(leads.utm_source,   EXCLUDED.utm_source),
        utm_medium   = COALESCE(leads.utm_medium,   EXCLUDED.utm_medium),
        utm_campaign = COALESCE(leads.utm_campaign, EXCLUDED.utm_campaign),
        utm_content  = COALESCE(leads.utm_content,  EXCLUDED.utm_content),
        utm_term     = COALESCE(leads.utm_term,     EXCLUDED.utm_term),
        fbclid       = COALESCE(leads.fbclid,       EXCLUDED.fbclid),
        last_click_ad_id  = COALESCE(leads.last_click_ad_id,  EXCLUDED.last_click_ad_id),
        first_click_ad_id = COALESCE(leads.first_click_ad_id, EXCLUDED.first_click_ad_id),
        match_method      = COALESCE(leads.match_method,      EXCLUDED.match_method)`,
    [
      workspaceId,
      lead.id,
      contactId ? String(contactId) : null,
      phoneHash,
      emailHash,
      num(lead.price),
      lead.created_at ?? null,
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

  // Meta'ga "yangi lid" signali. Moslik kaliti bo'lmasa (telefon ham,
  // email ham, fbclid ham yo'q) metaCapi o'zi o'tkazib yuboradi.
  await notifyMeta(workspaceId, lead.id, 'lead');
}

async function handleLeadStatus(
  workspaceId: string,
  lead: AmoLeadEvent,
  config: WorkspaceCrmConfig
): Promise<void> {
  if (!lead.id) return;
  const statusId = lead.status_id ? String(lead.status_id) : null;
  const pipelineId = lead.pipeline_id ? String(lead.pipeline_id) : null;
  let revenue = num(lead.price);

  // "Sotuv" — (voronka:etap) juftligi ro'yxatda bo'lsa.
  //
  // Juftlik kerak, chunki amoCRM'da 142 (yutildi) va 143 (yutqazildi)
  // universal: har voronkada bor. Furninglass misolida sotuv `guli`
  // voronkasida yopiladi, `Kvalifikatsiya` da esa "sotuvga o'tkazildi"
  // degan boshqa ma'noli 142 turadi — ikkisini ajratish shart.
  const key = pairKey(pipelineId, statusId);

  // Juftliklar sozlanmagan bo'lsa — eski bitta-voronkali mantiqqa tushamiz,
  // shunda mavjud akkauntlar migratsiyadan keyin ham ishlashda davom etadi.
  // Zaxira yo'l 028 da olib tashlandi: sotuv ta'rifi FAQAT juftlikda.
  // Eski maydonlar bo'yicha "taxminan" javob berish xato bermasdi —
  // jimgina boshqa raqam berardi va sabab ko'rinmasdi.
  let newStatus: 'new' | 'won' | 'lost' | 'in_progress' = 'in_progress';
  if (key !== null && config.amocrm_won_pairs.includes(key)) {
    newStatus = 'won';
  } else if (statusId === DEFAULT_LOST_STATUS_ID) {
    newStatus = 'lost';
  } else if (key !== null && config.amocrm_lead_pairs.includes(key)) {
    // Birinchi bosqich: lid hali ishlov berilmagan. "Qotgan lid"
    // hisobi shu holatga tayanadi.
    newStatus = 'new';
  }

  // For a won deal, pull the authoritative deal value from the API.
  if (newStatus === 'won') {
    revenue = await resolveWonRevenue(workspaceId, lead.id, revenue);
  }

  // §3.3 etaplar.sifatli — lid shu etaplardan biriga YETGAN payt yoziladi.
  // Faqat birinchi marta: lid orqaga qaytsa ham "sifatli bo'lgan" fakti
  // yo'qolmasligi kerak, aks holda konversiya raqamlari o'zgaruvchan bo'ladi.
  const reachedQualified = key !== null && config.amocrm_qualified_pairs.includes(key);
  // Yutilgan lid ta'rifi bo'yicha sifatli bosqichdan o'tgan.
  const markQualified = reachedQualified || newStatus === 'won';

  const result = await pool.query(
    `UPDATE leads
       SET status = $1,
           revenue = CASE WHEN $1 = 'won' THEN $2 ELSE revenue END,
           won_at  = CASE WHEN $1 = 'won' THEN now() ELSE won_at END,
           lost_at = CASE WHEN $1 = 'lost' THEN COALESCE(lost_at, now()) ELSE lost_at END,
           qualified_at = CASE WHEN $5 THEN COALESCE(qualified_at, now()) ELSE qualified_at END,
           crm_stage = COALESCE($6, crm_stage)
     WHERE workspace_id = $3 AND crm_lead_id = $4`,
    [newStatus, revenue, workspaceId, lead.id, markQualified, statusId]
  );

  // Lead arrived via status event before we saw its add — create it.
  if (!result.rowCount) {
    await pool.query(
      `INSERT INTO leads (workspace_id, crm_lead_id, status, revenue, won_at)
       VALUES ($1,$2,$3,$4, CASE WHEN $3='won' THEN now() ELSE NULL END)
       ON CONFLICT (workspace_id, crm_lead_id) DO NOTHING`,
      [workspaceId, lead.id, newStatus, revenue]
    );
  }

  // When a lead is won, run the attribution engine to credit the ads.
  if (newStatus === 'won') {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM leads WHERE workspace_id = $1 AND crm_lead_id = $2`,
        [workspaceId, lead.id]
      );
      if (rows[0]) {
        await processLeadAttribution(rows[0].id, workspaceId);
      }
      // Fresh won deal — invalidate cached dashboard overviews.
      await cacheDelPattern(overviewCachePattern(workspaceId));
    } catch (err) {
      xatoQayd(err, { joy: 'webhook-atribusiya', workspaceId, qoshimcha: { crmLeadId: lead.id } });
    }
  }

  // Meta'ga xabar beramiz: shu lid sifatli bo'ldi / sotuvga aylandi.
  // Atribusiyadan KEYIN — o'shanda revenue va won_at yozilgan bo'ladi.
  if (markQualified || newStatus === 'won') {
    await notifyMeta(workspaceId, lead.id, newStatus === 'won' ? 'purchase' : 'qualified');
  }
}

/**
 * CAPI hodisasini yuborish — fail-soft o'ram. CAPI o'chirilgan bo'lsa yoki
 * xato bersa, lid qayta ishlash oqimi hech qanday zarar ko'rmaydi.
 */
async function notifyMeta(
  workspaceId: string,
  crmLeadId: string,
  stage: CapiStage
): Promise<void> {
  try {
    const config = await loadCapiConfig(workspaceId);
    if (!config) return; // CAPI yoqilmagan — normal holat

    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM leads WHERE workspace_id = $1 AND crm_lead_id = $2`,
      [workspaceId, crmLeadId]
    );
    if (!rows[0]) return;

    const capiLead = await loadCapiLead(workspaceId, rows[0].id);
    if (!capiLead) return;

    await sendCapiEvent(workspaceId, capiLead, stage, config);
  } catch (err) {
    xatoQayd(err, { joy: `capi-${stage}`, workspaceId, qoshimcha: { crmLeadId } });
  }
}

async function handleContactAdd(
  workspaceId: string,
  contact: AmoContactEvent,
  config: WorkspaceCrmConfig
): Promise<void> {
  if (!contact.id) return;
  try {
    const info = await getContact(workspaceId, contact.id);
    const phoneHash = info.phone ? hashPhone(info.phone, config.phone_country_code) : null;
    const emailHash = info.email ? hashEmail(info.email) : null;
    if (!phoneHash && !emailHash) return;
    // Attach hashes to any lead already linked to this contact.
    await pool.query(
      `UPDATE leads
         SET phone_hash = COALESCE($1, phone_hash),
             email_hash = COALESCE($2, email_hash)
       WHERE workspace_id = $3 AND crm_contact_id = $4`,
      [phoneHash, emailHash, workspaceId, String(contact.id)]
    );
  } catch (err) {
    xatoQayd(err, { joy: 'webhook-kontakt', workspaceId, qoshimcha: { contactId: contact.id } });
  }
}

interface AmoWebhookBody {
  account?: { subdomain?: string };
  leads?: { add?: AmoLeadEvent[]; status?: AmoLeadEvent[] };
  contacts?: { add?: AmoContactEvent[] };
}

/**
 * Webhook tanasini qayta ishlash. Workspace tashqarida topiladi, chunki
 * sirni tekshirish uchun u allaqachon kerak bo'ladi — ikki marta
 * so'rov yubormaymiz.
 */
async function processWebhookBody(
  body: AmoWebhookBody,
  workspace: WorkspaceCrmConfig
): Promise<void> {
  for (const lead of body.leads?.add ?? []) {
    await handleLeadAdd(workspace.id, lead, workspace);
  }
  for (const lead of body.leads?.status ?? []) {
    await handleLeadStatus(workspace.id, lead, workspace);
  }
  for (const contact of body.contacts?.add ?? []) {
    await handleContactAdd(workspace.id, contact, workspace);
  }
}

// amoCRM 2xx ni tez kutadi, lekin ish odatda 1–3 soniyada tugaydi.
// Shu oraliqda ulgursak — javobdan oldin tugatamiz (eng ishonchli yo'l).
const WEBHOOK_DEADLINE_MS = Number(process.env.WEBHOOK_DEADLINE_MS ?? 8000);

// ---- POST /api/webhooks/amocrm ----
export async function amocrmWebhook(req: Request, res: Response): Promise<void> {
  const body = req.body as AmoWebhookBody;

  // Workspace avval topiladi: sir har mijozga alohida bo'lgani uchun
  // tekshirishdan oldin kimning webhook'i kelganini bilish kerak.
  const subdomain = body.account?.subdomain;
  const workspace = subdomain ? await findWorkspaceBySubdomain(subdomain) : null;

  if (!verifySignature(req, workspace?.amocrm_webhook_secret ?? null)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  if (!workspace) {
    // Noma'lum subdomen. 200 qaytaramiz — aks holda amoCRM cheksiz
    // qayta yuborib turadi va bizning log'ni to'ldiradi.
    if (subdomain) console.warn('webhook: no workspace for subdomain', subdomain);
    res.status(200).json({ ok: true, processed: false });
    return;
  }

  /**
   * ⚠ SERVERLESS: oldin kod "200 qaytar → keyin async qayta ishla" qilardi.
   * Vercel'da javob ketishi bilan funksiya o'ldiriladi va
   * processLeadAttribution yarim yo'lda uziladi — sotuv YO'QOLADI.
   *
   * Endi: ishni boshlaymiz, WEBHOOK_DEADLINE_MS gacha kutamiz.
   * Ulgursa — tugagan holda 200 qaytaramiz.
   * Ulgurmasa — qolganini waitUntil ushlab qoladi va baribir 200 qaytaramiz
   * (amoCRM non-2xx da qayta yuboradi, bu esa dublikat ishga olib keladi).
   */
  const { finished } = await awaitWithDeadline(
    processWebhookBody(body, workspace),
    WEBHOOK_DEADLINE_MS,
    'amocrm webhook'
  );

  res.status(200).json({ ok: true, processed: finished });
}
