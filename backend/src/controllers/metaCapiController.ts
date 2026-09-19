/**
 * Meta Conversions API sozlamalari.
 *
 * TOKEN: mijoz uni shu formadan kiritadi va u AES-256 bilan SHIFRLANIB
 * bazaga yoziladi — xuddi Facebook va amoCRM tokenlari kabi. Javobda
 * hech qachon qaytarilmaydi, log'ga tushmaydi; UI faqat "bor/yo'q"
 * holatini ko'radi.
 *
 * NEGA .env EMAS: bu SaaS. Token .env da bo'lsa, har yangi mijoz uchun
 * Vercel'ga o'zgaruvchi qo'shib qayta deploy qilish kerak bo'lardi —
 * ya'ni mijoz o'zi ulana olmaydi. §3.1 testi: "yangi mijoz qo'shish
 * uchun deploy'ga tegish kerakmi?" Javob "ha" bo'lsa, arxitektura
 * noto'g'ri.
 *
 * .env yo'li zaxira bo'lib qoldi (loyiha egasining o'z akkauntlari uchun).
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { encrypt } from '../utils/encryption';
import { sendCapiTest } from '../services/metaCapi';

interface CapiStatusRow {
  meta_dataset_id: string | null;
  meta_capi_enabled: boolean;
  secret_key: string | null;
  currency: string;
  phone_country_code: string;
  capi_event_lead: string;
  capi_event_qualified: string;
  capi_event_purchase: string;
  meta_capi_token: string | null;
}

/**
 * Meta'ning standart hodisalari. Standart nom Ads Manager'da darhol
 * ishlaydi; boshqa har qanday nom — custom, va uni ishlatish uchun
 * Events Manager'da Custom Conversion yasash kerak.
 */
const STANDARD_EVENTS = [
  'Lead',
  'Contact',
  'Schedule',
  'SubmitApplication',
  'CompleteRegistration',
  'StartTrial',
  'Subscribe',
  'Purchase',
] as const;

/** Nom Meta talabiga mos keladimi: harf, raqam va pastki chiziq. */
const eventNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9_]{1,39}$/, 'Hodisa nomi harf bilan boshlanib, faqat harf/raqam/_ dan iborat bo\'lsin');

/** Faqat BOR/YO'Q. Tokenning o'zi hech qachon javobga qo'shilmaydi. */
function tokenPresent(secretKey: string | null, bazadagi: string | null): boolean {
  if (bazadagi) return true;
  if (secretKey) {
    const suffix = secretKey.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    if (process.env[`META_CAPI_TOKEN__${suffix}`]) return true;
  }
  return Boolean(process.env.META_CAPI_TOKEN);
}

// ---- GET /api/workspace/meta-capi ----
export async function status(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const { rows } = await pool.query<CapiStatusRow>(
      `SELECT meta_dataset_id, meta_capi_enabled, secret_key,
              COALESCE(currency, 'UZS') AS currency,
              COALESCE(phone_country_code, '998') AS phone_country_code,
              COALESCE(capi_event_lead, 'Lead')          AS capi_event_lead,
              COALESCE(capi_event_qualified, 'Schedule') AS capi_event_qualified,
              COALESCE(capi_event_purchase, 'Purchase')  AS capi_event_purchase,
              meta_capi_token
         FROM workspaces WHERE id = $1`,
      [req.user.workspaceId]
    );
    const ws = rows[0];

    // Oxirgi yuborilgan hodisalar — CAPI ishlayotganini ko'rsatadi.
    const { rows: stats } = await pool.query<{
      event_name: string;
      status: string;
      count: string;
      last_at: Date | null;
    }>(
      `SELECT event_name, status, COUNT(*)::text AS count, MAX(sent_at) AS last_at
         FROM capi_events
        WHERE workspace_id = $1
        GROUP BY event_name, status
        ORDER BY event_name`,
      [req.user.workspaceId]
    );

    res.json({
      enabled: Boolean(ws?.meta_capi_enabled),
      datasetId: ws?.meta_dataset_id ?? null,
      currency: ws?.currency ?? 'UZS',
      phoneCountryCode: ws?.phone_country_code ?? '998',
      /** Token .env da bormi — qiymati emas, faqat bor/yo'q. */
      tokenConfigured: tokenPresent(ws?.secret_key ?? null, ws?.meta_capi_token ?? null),
      secretKey: ws?.secret_key ?? null,
      /** Bosqichlar uchun Meta hodisa nomlari (§3.1 — kodda emas). */
      eventNames: {
        lead: ws?.capi_event_lead ?? 'Lead',
        qualified: ws?.capi_event_qualified ?? 'Schedule',
        purchase: ws?.capi_event_purchase ?? 'Purchase',
      },
      /** UI ro'yxati uchun: standart nomlar darhol ishlaydi. */
      standardEvents: STANDARD_EVENTS,
      events: stats.map((s) => ({
        eventName: s.event_name,
        status: s.status,
        count: Number(s.count),
        lastAt: s.last_at,
      })),
    });
  } catch (err) {
    console.error('meta capi status error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load Meta CAPI status' });
  }
}

// ---- POST /api/workspace/meta-capi ----
const saveSchema = z.object({
  datasetId: z
    .string()
    .trim()
    .regex(/^\d{5,}$/, 'Dataset ID faqat raqamlardan iborat bo\'lishi kerak')
    .nullable()
    .optional(),
  enabled: z.boolean().optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Valyuta ISO kodi bo\'lsin (UZS, USD)')
    .optional(),
  phoneCountryCode: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, 'Mamlakat kodi 1–4 raqam (masalan 998)')
    .optional(),
  /**
   * Meta CAPI access token. Shifrlanib saqlanadi va qaytarilmaydi.
   * Bo'sh satr — tokenni O'CHIRISH (mijoz ulanishni uzmoqchi bo'lsa).
   */
  token: z.string().trim().max(1000).optional(),
  /** .env kaliti qo'shimchasi: META_CAPI_TOKEN__<SECRET_KEY> (zaxira yo'l) */
  secretKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,40}$/, 'Kalit faqat harf, raqam, _ va - dan iborat')
    .nullable()
    .optional(),
  /** Bosqichlar uchun Meta hodisa nomlari. */
  eventLead: eventNameSchema.optional(),
  eventQualified: eventNameSchema.optional(),
  eventPurchase: eventNameSchema.optional(),
});

export async function save(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const d = parsed.data;

  try {
    const { rows } = await pool.query<{ secret_key: string | null; meta_capi_token: string | null }>(
      `UPDATE workspaces
          SET meta_dataset_id     = COALESCE($1, meta_dataset_id),
              meta_capi_enabled   = COALESCE($2, meta_capi_enabled),
              currency            = COALESCE($3, currency),
              phone_country_code  = COALESCE($4, phone_country_code),
              secret_key          = COALESCE($5, secret_key),
              capi_event_lead      = COALESCE($6, capi_event_lead),
              capi_event_qualified = COALESCE($7, capi_event_qualified),
              capi_event_purchase  = COALESCE($8, capi_event_purchase),
              -- $10: NULL — tegilmaydi; '' — o'chiriladi; aks holda yangi shifr.
              meta_capi_token     = CASE
                                      WHEN $10::text IS NULL THEN meta_capi_token
                                      WHEN $10::text = ''    THEN NULL
                                      ELSE $10::text
                                    END,
              updated_at          = now()
        WHERE id = $9
        RETURNING secret_key, meta_capi_token`,
      [
        d.datasetId ?? null,
        d.enabled ?? null,
        d.currency ?? null,
        d.phoneCountryCode ?? null,
        d.secretKey ?? null,
        d.eventLead ?? null,
        d.eventQualified ?? null,
        d.eventPurchase ?? null,
        req.user.workspaceId,
        d.token === undefined ? null : d.token === '' ? '' : encrypt(d.token),
      ]
    );

    if (!rows[0]) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    // Yoqishga urinilsa-yu token bo'lmasa — ochiq aytamiz, jim qolmaymiz.
    const warning =
      d.enabled && !tokenPresent(rows[0].secret_key, rows[0].meta_capi_token)
        ? 'CAPI yoqildi, lekin token kiritilmagan — hodisalar yuborilmaydi'
        : null;

    res.json({ success: true, warning });
  } catch (err) {
    console.error('meta capi save error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to save Meta CAPI settings' });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/workspace/meta-capi/test

   Sozlamani SAQLAMAYDI, hech narsani o'zgartirmaydi. Bitta sinov
   hodisasini Meta'ga yuboradi va javobni aynan qaytaradi.

   `test_event_code` MAJBURIY: usiz hodisa Events Manager'ning haqiqiy
   statistikasiga tushardi va keyin uni o'chirib bo'lmasdi.
   ═══════════════════════════════════════════════════════════════════════ */
const testSchema = z.object({
  /** Events Manager → Test Events tabidagi kod, masalan `TEST12345`. */
  testEventCode: z
    .string()
    .trim()
    .min(4, 'Test kodi juda qisqa')
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Test kodida faqat harf, raqam, _ va - bo\'ladi'),
  stage: z.enum(['lead', 'qualified', 'purchase']).optional(),
});

export async function test(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  try {
    const natija = await sendCapiTest(
      req.user.workspaceId,
      parsed.data.testEventCode,
      parsed.data.stage ?? 'lead'
    );
    res.json(natija);
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status === 400) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error('meta capi test error:', e.message);
    res.status(500).json({ error: 'Sinov hodisasini yuborib bo\'lmadi' });
  }
}
