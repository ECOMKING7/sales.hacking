/**
 * Meta Conversions API sozlamalari.
 *
 * ⚠ §4.1: TOKEN bu yerdan O'TMAYDI. Foydalanuvchi faqat Dataset ID ni
 * kiritadi (u ochiq ma'lumot). Token .env / Vercel secret da yashaydi:
 *   META_CAPI_TOKEN__<SECRET_KEY>  yoki  META_CAPI_TOKEN
 * Server tokenni faqat o'qiydi, hech qachon qaytarmaydi.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';

interface CapiStatusRow {
  meta_dataset_id: string | null;
  meta_capi_enabled: boolean;
  secret_key: string | null;
  currency: string;
  phone_country_code: string;
  capi_event_lead: string;
  capi_event_qualified: string;
  capi_event_purchase: string;
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

function tokenPresent(secretKey: string | null): boolean {
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
              COALESCE(capi_event_purchase, 'Purchase')  AS capi_event_purchase
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
      tokenConfigured: tokenPresent(ws?.secret_key ?? null),
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
  /** .env kaliti qo'shimchasi: META_CAPI_TOKEN__<SECRET_KEY> */
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
    const { rows } = await pool.query<{ secret_key: string | null }>(
      `UPDATE workspaces
          SET meta_dataset_id     = COALESCE($1, meta_dataset_id),
              meta_capi_enabled   = COALESCE($2, meta_capi_enabled),
              currency            = COALESCE($3, currency),
              phone_country_code  = COALESCE($4, phone_country_code),
              secret_key          = COALESCE($5, secret_key),
              capi_event_lead      = COALESCE($6, capi_event_lead),
              capi_event_qualified = COALESCE($7, capi_event_qualified),
              capi_event_purchase  = COALESCE($8, capi_event_purchase),
              updated_at          = now()
        WHERE id = $9
        RETURNING secret_key`,
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
      ]
    );

    if (!rows[0]) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    // Yoqishga urinilsa-yu token bo'lmasa — ochiq aytamiz, jim qolmaymiz.
    const warning =
      d.enabled && !tokenPresent(rows[0].secret_key)
        ? 'CAPI yoqildi, lekin .env da token topilmadi — hodisalar yuborilmaydi'
        : null;

    res.json({ success: true, warning });
  } catch (err) {
    console.error('meta capi save error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to save Meta CAPI settings' });
  }
}
