/* ═══════════════════════════════════════════════════════════════
   Meta Conversions API — CRM hodisalarini Meta'ga yuborish.

   YO'NALISH: amoCRM → biz → Meta. Bu servis dashboard'ga HECH NARSA
   qaytarmaydi. U Meta algoritmiga "bu lid sifatli edi / sotuvga aylandi"
   deb aytadi; Meta esa o'zi qaysi reklama bo'lganini topadi va biz uni
   keyinroq Insights API orqali `fb_purchases` / `fb_revenue` sifatida
   o'qiymiz (§"One owner per column").

   MOSLIK KALITLARI (user_data):
     fbc — fbclid dan yasaladi, eng kuchli
     ph  — E.164 telefon SHA-256   ← bizda allaqachon shu ko'rinishda
     em  — lowercase email SHA-256 ← bizda allaqachon shu ko'rinishda
   Meta aynan SHA-256 hex kutadi, ya'ni bazadagi qiymat to'g'ridan-to'g'ri
   ketadi — xom PII hech qachon chiqmaydi (§Privacy).

   DEDUP: `event_id` = "<crm_lead_id>:<event_name>". Meta 48 soat ichida
   bir xil (event_id, event_name) ni bitta deb hisoblaydi; biz qo'shimcha
   ravishda `capi_events` jadvalida ham takrorni to'sib turamiz.

   XAVFSIZLIK (§4.1): token kodda YO'Q va log'da YO'Q. Bazada esa faqat
   AES-256 bilan SHIFRLANGAN holda yotadi — xuddi Facebook va amoCRM
   tokenlari kabi. Javobda hech qachon qaytarilmaydi; UI faqat "bor/yo'q"
   holatini ko'radi.

   NEGA BAZADA: bu SaaS. Token .env da bo'lsa, yangi mijoz qo'shish uchun
   Vercel'ga kirib o'zgaruvchi qo'shish va qayta deploy qilish kerak
   bo'lardi — ya'ni mijoz o'zi ulana olmaydi (§3.1 testidan o'tmaydi).
   .env yo'li zaxira sifatida qoldi: loyiha egasining o'z akkauntlari
   uchun qulay.
   ═══════════════════════════════════════════════════════════════ */

import axios, { AxiosError } from 'axios';
import { pool } from '../db/pool';
import { decrypt } from '../utils/encryption';
import { GRAPH_URL } from '../config/graph';

/** Meta `event_time` ni 7 kundan eskisini qabul qilmaydi. */
const MAX_EVENT_AGE_SEC = 7 * 24 * 60 * 60;

/**
 * Mahsulotning voronka bosqichi. UCHTASI HAMMA MIJOZDA BIR XIL —
 * mijoz faqat qaysi CRM etapi qaysi bosqichga kirishini belgilaydi
 * (amocrm_lead_pairs / _qualified_pairs / _won_pairs).
 *
 * Meta'ga ketadigan nom konfiguratsiyadan (§3.1), lekin sukut
 * mahsulotniki: Lead / QualifiedLead / Purchase. Nomni o'zgartirish
 * faqat bitta holatda kerak — mijozning sayt pikseli allaqachon
 * `Purchase` yuborayotgan bo'lsa, ikkala oqim bir ustunda qo'shilib
 * ketmasligi uchun CRM oqimiga boshqa nom beriladi.
 */
export type CapiStage = 'lead' | 'qualified' | 'purchase';

/** Orqaga moslik uchun eski nom. */
export type CapiEventName = CapiStage;

export interface CapiLead {
  id: string;
  crm_lead_id: string | null;
  phone_hash: string | null;
  email_hash: string | null;
  fbclid: string | null;
  /**
   * Meta Lead ID (15–17 xonali). Eng kuchli moslik kaliti: piksel ham,
   * UTM ham, fbclid ham bo'lmasa ishlaydi.
   *
   * ⚠ MATN sifatida yuboriladi. Meta hujjatidagi misolda u tirnoqsiz
   * (son) ko'rsatilgan, lekin 17 xonali son JS'da aniqlikni yo'qotadi
   * (Number.MAX_SAFE_INTEGER ≈ 9.0e15). Matn xavfsizroq — BU
   * TEKSHIRILISHI KERAK: Meta matnni ham qabul qiladimi.
   */
  fb_lead_id: string | null;
  revenue: string | number | null;
  crm_created_at: Date | string | null;
  won_at: Date | string | null;
}

interface CapiConfig {
  workspaceId: string;
  datasetId: string;
  token: string;
  currency: string;
  /** Bosqich -> Meta hodisa nomi. Konfiguratsiyadan keladi. */
  eventNames: Record<CapiStage, string>;
  /** Meta CRM talabi: 'system_generated'. Sozlamadan o'zgartirish mumkin. */
  actionSource: string;
  /** custom_data.lead_event_source — manba tizim nomi. */
  leadEventSource: string;
}

/**
 * Token qayerdan olinadi — tartib muhim:
 *   1. BAZA (shifrlangan) — mijoz o'zi kiritgan. Asosiy yo'l.
 *   2. META_CAPI_TOKEN__<KEY> — loyiha egasining o'z akkaunti uchun.
 *   3. META_CAPI_TOKEN — umumiy zaxira.
 *
 * Baza birinchi turadi: mijoz o'zi ulaganidan keyin .env dagi eski
 * qiymat uni bosib ketmasligi kerak.
 *
 * Shifr ochilmasa null — bu XATO EMAS deb o'tkazib yuborilmaydi, log'da
 * ko'rinadi. Aks holda "CAPI yoqilgan, lekin hech narsa ketmayapti"
 * degan jim holat paydo bo'lardi.
 */
function tokenFor(secretKey: string | null, shifrlangan: string | null): string | null {
  if (shifrlangan) {
    try {
      const ochiq = decrypt(shifrlangan);
      if (ochiq) return ochiq;
    } catch (err) {
      console.error('CAPI tokenini ochib bo\'lmadi (ENCRYPTION_KEY o\'zgarganmi?):', (err as Error).message);
    }
  }
  if (secretKey) {
    const suffix = secretKey.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const scoped = process.env[`META_CAPI_TOKEN__${suffix}`];
    if (scoped) return scoped;
  }
  return process.env.META_CAPI_TOKEN ?? null;
}

/**
 * Workspace uchun CAPI sozlamalari. `null` — yuborilmaydi (o'chirilgan,
 * dataset yo'q yoki token qo'yilmagan). Bu xato emas: CAPI ixtiyoriy.
 */
export async function loadCapiConfig(workspaceId: string): Promise<CapiConfig | null> {
  const { rows } = await pool.query<{
    meta_dataset_id: string | null;
    meta_capi_enabled: boolean;
    secret_key: string | null;
    currency: string | null;
    capi_event_lead: string | null;
    capi_event_qualified: string | null;
    capi_event_purchase: string | null;
    capi_action_source: string | null;
    capi_lead_event_source: string | null;
    meta_capi_token: string | null;
  }>(
    `SELECT meta_dataset_id, meta_capi_enabled, secret_key,
            COALESCE(currency, 'UZS')              AS currency,
            COALESCE(capi_event_lead, 'Lead')      AS capi_event_lead,
            COALESCE(capi_event_qualified, 'QualifiedLead') AS capi_event_qualified,
            COALESCE(capi_event_purchase, 'Purchase')  AS capi_event_purchase,
            COALESCE(capi_action_source, 'system_generated') AS capi_action_source,
            COALESCE(capi_lead_event_source, 'amoCRM')       AS capi_lead_event_source,
            meta_capi_token
       FROM workspaces WHERE id = $1`,
    [workspaceId]
  );

  const ws = rows[0];
  if (!ws || !ws.meta_capi_enabled || !ws.meta_dataset_id) return null;

  const token = tokenFor(ws.secret_key, ws.meta_capi_token);
  if (!token) {
    console.warn(`CAPI: ${workspaceId} uchun token topilmadi — o'tkazib yuborildi`);
    return null;
  }

  return {
    workspaceId,
    datasetId: ws.meta_dataset_id,
    token,
    currency: ws.currency ?? 'UZS',
    eventNames: {
      lead: ws.capi_event_lead ?? 'Lead',
      qualified: ws.capi_event_qualified ?? 'QualifiedLead',
      purchase: ws.capi_event_purchase ?? 'Purchase',
    },
    actionSource: ws.capi_action_source ?? 'system_generated',
    leadEventSource: ws.capi_lead_event_source ?? 'amoCRM',
  };
}

/** `fbc` — Meta kutgan format: fb.1.<klik vaqti ms>.<fbclid> */
export function buildFbc(fbclid: string | null, clickedAt: Date | string | null): string | null {
  if (!fbclid) return null;
  const ms = clickedAt ? new Date(clickedAt).getTime() : Date.now();
  return `fb.1.${Number.isFinite(ms) ? ms : Date.now()}.${fbclid}`;
}

/**
 * Hodisa vaqti (sekund). `null` — yuborilmasligi kerak.
 *
 * ⚠ ILGARI XATO BOR EDI: 7 kundan eski hodisa HOZIRGI vaqt bilan
 * yuborilardi. Ya'ni Meta'ga "3 oy oldingi sotuv bugun bo'ldi" deb
 * aytardik. Bu shunchaki noto'g'ri emas — u optimallashtirishni
 * BUZADI: algoritm bugungi reklamani o'sha eski sotuv bilan
 * mukofotlaydi. Yolg'on signal signalsizlikdan yomon.
 *
 * Endi bunday hodisa yuborilmaydi. Amaliy oqibati: tarixiy importni
 * CAPI ga o'tkazib bo'lmaydi — Meta baribir qabul qilmagan bo'lardi.
 * CAPI ning foydasi yoqilgan kundan boshlanadi.
 */
export function toUnixSeconds(value: Date | string | null): number | null {
  const now = Math.floor(Date.now() / 1000);
  const ms = value ? new Date(value).getTime() : NaN;
  // Vaqt noma'lum — hodisa hozir sodir bo'ldi deb qaraymiz (webhook oqimi).
  if (!Number.isFinite(ms)) return now;

  const sec = Math.floor(ms / 1000);
  if (now - sec > MAX_EVENT_AGE_SEC) return null;
  // Kelajakdagi vaqt (soat farqi) — hozirgi vaqtga tekislaymiz.
  if (sec > now) return now;
  return sec;
}

/** Qaysi moslik kalitlari bor — diagnostika uchun ("fbc,ph"). */
function matchKeysOf(userData: Record<string, unknown>): string {
  return Object.keys(userData).join(',') || 'none';
}

/**
 * Bitta hodisani yuboradi. Fail-soft: hech qachon otmaydi — CAPI
 * ishlamasligi lid qayta ishlashni to'xtatmasligi kerak.
 *
 * Qaytaradi: yuborildi (true) / o'tkazib yuborildi yoki xato (false).
 */
export async function sendCapiEvent(
  workspaceId: string,
  lead: CapiLead,
  stage: CapiStage,
  config?: CapiConfig | null
): Promise<boolean> {
  // catch blokida ham kerak, shuning uchun try'dan tashqarida.
  let eventName: string = stage;
  let eventId = '';

  try {
    const cfg = config ?? (await loadCapiConfig(workspaceId));
    if (!cfg) return false;

    // Meta'ga ketadigan nom konfiguratsiyadan. Dedup kaliti ham
    // shu nomga tayanadi: nom o'zgarsa hodisa yangi signal sifatida
    // bir marta qayta ketadi, bu ataylab shunday.
    eventName = cfg.eventNames[stage];
    eventId = `${lead.crm_lead_id ?? lead.id}:${eventName}`;

    // Vaqtni DEDUP QATORIDAN OLDIN tekshiramiz: eski hodisa uchun
    // qator yozib qo'ysak, u keyin qayta yuborishni ham to'sib qo'yardi.
    const occurredAt = stage === 'purchase' ? lead.won_at : lead.crm_created_at;
    const eventTime = toUnixSeconds(occurredAt);
    if (eventTime === null) {
      console.warn(
        `CAPI ${eventName} o'tkazib yuborildi (lead ${lead.id}): hodisa 7 kundan eski, Meta qabul qilmaydi`
      );
      return false;
    }

    // Takror yuborishni bazada to'samiz — Meta'ning 48 soatlik dedup
    // oynasidan uzoqroq muddatda ham ishlaydi.
    const claimed = await pool.query(
      `INSERT INTO capi_events (workspace_id, lead_id, event_name, event_id, status)
            VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (workspace_id, event_id, event_name) DO NOTHING
         RETURNING id`,
      [workspaceId, lead.id, eventName, eventId]
    );
    if (!claimed.rowCount) return false; // allaqachon yuborilgan

    const userData: Record<string, unknown> = {};
    // Eng kuchli kalit birinchi: Meta Lead ID bo'lsa moslik deyarli
    // kafolatlangan — piksel, UTM va fbclid umuman kerak emas.
    if (lead.fb_lead_id) userData.lead_id = lead.fb_lead_id;
    const fbc = buildFbc(lead.fbclid, lead.crm_created_at);
    if (fbc) userData.fbc = fbc;
    if (lead.phone_hash) userData.ph = [lead.phone_hash];
    if (lead.email_hash) userData.em = [lead.email_hash];

    if (!Object.keys(userData).length) {
      await pool.query(
        `UPDATE capi_events SET status = 'error', match_keys = 'none',
                error = 'moslik kaliti yo''q (fbc/ph/em)'
          WHERE workspace_id = $1 AND event_id = $2 AND event_name = $3`,
        [workspaceId, eventId, eventName]
      );
      return false;
    }

    /**
     * custom_data HAR DOIM bo'ladi.
     *
     * Meta CRM hujjati: "at least one valid custom parameter is
     * mandatory" va `event_source` "crm" bo'lishi kerak. Ilgari bizda
     * custom_data faqat sotuv bosqichida (summa uchun) qo'shilardi —
     * ya'ni `qualified` hodisalarimiz talabga javob bermasdi.
     */
    const customData: Record<string, unknown> = {
      event_source: 'crm',
      lead_event_source: cfg.leadEventSource,
    };

    // Summa faqat sotuv bosqichida — hodisa nomi qanday atalganidan
    // qat'i nazar (mijoz uni 'Purchase' emas, boshqa nom bilan
    // atagan bo'lishi mumkin).
    if (stage === 'purchase') {
      const value = Number(lead.revenue ?? 0);
      if (value > 0) {
        customData.value = value;
        customData.currency = cfg.currency;
      }
    }

    const event: Record<string, unknown> = {
      event_name: eventName,
      event_time: eventTime,
      event_id: eventId,
      // CRM'dan kelib chiqqan, foydalanuvchi qurilmasida sodir bo'lmagan
      // hodisa. Meta CRM talabi 'system_generated'; qo'ng'iroq voronkasi
      // uchun boshqacha bo'lishi mumkin, shuning uchun sozlamadan (§3.1).
      action_source: cfg.actionSource,
      user_data: userData,
      custom_data: customData,
    };

    await axios.post(
      `${GRAPH_URL}/${cfg.datasetId}/events`,
      { data: [event], access_token: cfg.token },
      { timeout: 10_000 }
    );

    await pool.query(
      `UPDATE capi_events SET status = 'ok', match_keys = $4, sent_at = now()
        WHERE workspace_id = $1 AND event_id = $2 AND event_name = $3`,
      [workspaceId, eventId, eventName, matchKeysOf(userData)]
    );
    return true;
  } catch (err) {
    const ax = err as AxiosError<{ error?: { message?: string; code?: number } }>;
    // Token va butun URL log'ga tushmaydi — faqat Meta'ning sababi.
    const reason =
      ax.response?.data?.error?.message ?? (err as Error).message ?? 'noma\'lum xato';

    console.error(`CAPI ${eventName} yuborilmadi (lead ${lead.id}):`, reason.slice(0, 300));

    // eventId bo'sh bo'lsa config yuklashda uzilgan — yozadigan qator yo'q.
    if (!eventId) return false;

    try {
      await pool.query(
        `UPDATE capi_events SET status = 'error', error = $4
          WHERE workspace_id = $1 AND event_id = $2 AND event_name = $3`,
        [workspaceId, eventId, eventName, reason.slice(0, 500)]
      );
    } catch {
      /* diagnostika yozuvi ham yozilmasa — jim o'tamiz, bu asosiy oqim emas */
    }
    return false;
  }
}

/** Lidni CAPI uchun kerakli maydonlar bilan o'qish. */
export async function loadCapiLead(
  workspaceId: string,
  leadId: string
): Promise<CapiLead | null> {
  const { rows } = await pool.query<CapiLead>(
    `SELECT id, crm_lead_id, phone_hash, email_hash, fbclid, fb_lead_id,
            revenue, crm_created_at, won_at
       FROM leads
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, leadId]
  );
  return rows[0] ?? null;
}
