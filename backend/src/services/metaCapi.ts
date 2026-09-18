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

   XAVFSIZLIK (§4.1): token hech qachon kodda, bazada yoki log'da bo'lmaydi.
   Faqat .env / Vercel secret: META_CAPI_TOKEN__<KEY> yoki META_CAPI_TOKEN.
   ═══════════════════════════════════════════════════════════════ */

import axios, { AxiosError } from 'axios';
import { pool } from '../db/pool';
import { GRAPH_URL } from '../config/graph';

/** Meta `event_time` ni 7 kundan eskisini qabul qilmaydi. */
const MAX_EVENT_AGE_SEC = 7 * 24 * 60 * 60;

/**
 * Voronka bosqichi. Meta'ga ketadigan ASL NOM bundan emas,
 * konfiguratsiyadan olinadi (§3.1) — chunki standart hodisa
 * (Lead, Schedule, Purchase) Ads Manager'da darhol ishlaydi,
 * custom nom esa avval Custom Conversion talab qiladi.
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
}

/**
 * .env kaliti: META_CAPI_TOKEN__<KEY>, bu yerda <KEY> katta harfda va
 * harf/raqamdan boshqa hamma narsa "_" (§3.3 kalit qoidasi).
 */
function tokenFor(secretKey: string | null): string | null {
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
  }>(
    `SELECT meta_dataset_id, meta_capi_enabled, secret_key,
            COALESCE(currency, 'UZS')              AS currency,
            COALESCE(capi_event_lead, 'Lead')      AS capi_event_lead,
            COALESCE(capi_event_qualified, 'Schedule') AS capi_event_qualified,
            COALESCE(capi_event_purchase, 'Purchase')  AS capi_event_purchase
       FROM workspaces WHERE id = $1`,
    [workspaceId]
  );

  const ws = rows[0];
  if (!ws || !ws.meta_capi_enabled || !ws.meta_dataset_id) return null;

  const token = tokenFor(ws.secret_key);
  if (!token) {
    console.warn(`CAPI: ${workspaceId} uchun token topilmadi (META_CAPI_TOKEN__…) — o'tkazib yuborildi`);
    return null;
  }

  return {
    workspaceId,
    datasetId: ws.meta_dataset_id,
    token,
    currency: ws.currency ?? 'UZS',
    eventNames: {
      lead: ws.capi_event_lead ?? 'Lead',
      qualified: ws.capi_event_qualified ?? 'Schedule',
      purchase: ws.capi_event_purchase ?? 'Purchase',
    },
  };
}

/** `fbc` — Meta kutgan format: fb.1.<klik vaqti ms>.<fbclid> */
export function buildFbc(fbclid: string | null, clickedAt: Date | string | null): string | null {
  if (!fbclid) return null;
  const ms = clickedAt ? new Date(clickedAt).getTime() : Date.now();
  return `fb.1.${Number.isFinite(ms) ? ms : Date.now()}.${fbclid}`;
}

function toUnixSeconds(value: Date | string | null): number {
  const ms = value ? new Date(value).getTime() : NaN;
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ms)) return now;

  const sec = Math.floor(ms / 1000);
  // 7 kundan eski hodisani Meta rad etadi. Rad etilgandan ko'ra hozirgi
  // vaqt bilan yuborilgani ma'qul: Meta baribir o'z atribusiya oynasi
  // bo'yicha foydalanuvchining oldingi kligiga bog'laydi.
  if (now - sec > MAX_EVENT_AGE_SEC) return now;
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

    const occurredAt = stage === 'purchase' ? lead.won_at : lead.crm_created_at;

    const userData: Record<string, unknown> = {};
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

    const event: Record<string, unknown> = {
      event_name: eventName,
      event_time: toUnixSeconds(occurredAt),
      event_id: eventId,
      // CRM'dan kelib chiqqan, foydalanuvchi qurilmasida sodir bo'lmagan hodisa.
      action_source: 'system_generated',
      user_data: userData,
    };

    // Summa faqat sotuv bosqichida ketadi — hodisa nomi qanday
    // atalganidan qat'i nazar (mijoz uni 'Purchase' emas, boshqa
    // nom bilan atagan bo'lishi mumkin).
    if (stage === 'purchase') {
      const value = Number(lead.revenue ?? 0);
      if (value > 0) {
        event.custom_data = { value, currency: cfg.currency };
      }
    }

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
    `SELECT id, crm_lead_id, phone_hash, email_hash, fbclid,
            revenue, crm_created_at, won_at
       FROM leads
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, leadId]
  );
  return rows[0] ?? null;
}
