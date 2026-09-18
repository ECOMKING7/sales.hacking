import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { signOAuthState, verifyOAuthState } from '../utils/jwt';
import {
  generateAuthURL,
  exchangeCodeForTokens,
  getPipelines,
  saveCredentials,
} from '../services/amocrmService';
import { discoverLeadFields } from '../services/amocrmFields';

function frontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// ---- GET /api/auth/amocrm/connect (protected) ----
export async function connect(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(400).json({ error: 'No workspace associated with this account' });
    return;
  }
  const state = signOAuthState({
    userId: req.user.userId,
    workspaceId: req.user.workspaceId,
  });
  try {
    res.json({ url: await generateAuthURL(req.user.workspaceId, state) });
  } catch (err) {
    // Kalitlar yo'q — foydalanuvchiga nima qilishni aytamiz.
    res.status(400).json({
      error:
        'amoCRM kalitlari sozlanmagan. Avval Client ID va Секретный ключ ni kiriting.',
    });
    console.error('amocrm connect:', (err as Error).message);
  }
}

// ---- GET /api/auth/amocrm/callback (public; called by AmoCRM redirect) ----
export async function callback(req: Request, res: Response): Promise<void> {
  const redirectTo = (status: string) =>
    res.redirect(`${frontendUrl()}/settings?amocrm=${status}`);

  const { code, state, referer, error } = req.query as Record<string, string | undefined>;

  if (error) {
    redirectTo('denied');
    return;
  }
  if (!code || !state || !referer) {
    redirectTo('error');
    return;
  }

  let workspaceId: string | null;
  try {
    ({ workspaceId } = verifyOAuthState(state));
  } catch {
    redirectTo('error');
    return;
  }
  if (!workspaceId) {
    redirectTo('error');
    return;
  }

  try {
    // `referer` is the account domain, e.g. "example.amocrm.ru".
    await exchangeCodeForTokens(code, referer, workspaceId);
    redirectTo('connected');
  } catch (err) {
    console.error('amocrm callback error:', err);
    redirectTo('error');
  }
}

// ---- POST /api/auth/amocrm/manual (protected) ----
//
// Xususiy (Личная) integratsiya uchun. amoCRM bunday integratsiyani
// amoMarket'ning "install" oqimi orqali ulashga ruxsat bermaydi — o'rniga
// integratsiya sozlamalaridagi "Код авторизации" (20 daqiqa amal qiladi)
// beriladi. Bu endpoint shu kodni tokenga almashtiradi.
//
// Kod bir martalik: muvaffaqiyatsiz urinishdan keyin amoCRM'dan yangisini
// olish kerak.
const manualSchema = z.object({
  code: z.string().min(20, 'Avtorizatsiya kodi juda qisqa'),
  domain: z.string().min(4, 'Domen kerak'),
  /**
   * Xususiy integratsiya har mijozning o'z CRM'ida yaratilgani uchun
   * kalitlar ham har mijozda boshqa. Yuborilmasa — .env dagi umumiy
   * kalitlar ishlatiladi (ommaviy integratsiya holati).
   */
  clientId: z
    .string()
    .trim()
    .uuid('Client ID (ID интеграции) UUID ko\'rinishida bo\'lishi kerak')
    .optional(),
  clientSecret: z.string().trim().min(20, 'Секретный ключ juda qisqa').optional(),
});

/**
 * API'ning tashqi manzili — webhook URL'ini yasash uchun.
 * Proksi ortida `x-forwarded-proto`/`host` ishlatiladi; `PUBLIC_API_URL`
 * bo'lsa u ustun turadi (masalan o'z domen ulanganda).
 */
function apiBaseUrl(req: Request): string {
  const override = process.env.PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, '');
  const proto = (req.header('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0];
  const host = req.header('x-forwarded-host') ?? req.header('host') ?? '';
  return `${proto}://${host}`;
}

/** "https://xxx.amocrm.ru/" -> "xxx.amocrm.ru" */
function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

export async function manualConnect(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const domain = normalizeDomain(parsed.data.domain);
  if (!/^[a-z0-9-]+\.amocrm\.(ru|com)$/.test(domain)) {
    res.status(400).json({
      error: 'Domen "xxx.amocrm.ru" ko\'rinishida bo\'lishi kerak',
    });
    return;
  }

  try {
    // Kalitlar yuborilsa — almashtirishdan OLDIN saqlaymiz, chunki
    // exchangeCodeForTokens ularni bazadan o'qiydi.
    if (parsed.data.clientId && parsed.data.clientSecret) {
      await saveCredentials(req.user.workspaceId, {
        clientId: parsed.data.clientId,
        clientSecret: parsed.data.clientSecret,
      });
    }

    await exchangeCodeForTokens(parsed.data.code.trim(), domain, req.user.workspaceId);

    // Webhook siri hali bo'lmasa — yasab beramiz (yangi workspace).
    // Migratsiya faqat allaqachon ulangan akkauntlarga yozgan edi.
    await pool.query(
      `UPDATE workspaces
          SET amocrm_webhook_secret = replace(gen_random_uuid()::text, '-', '')
        WHERE id = $1 AND amocrm_webhook_secret IS NULL`,
      [req.user.workspaceId]
    );

    res.json({ success: true, domain });
  } catch (err) {
    // amoCRM javobidan sababni olamiz; kod/token hech qachon log'ga tushmaydi.
    const amo = (err as {
      response?: { status?: number; data?: { hint?: string; detail?: string; title?: string } };
    }).response;

    const hint = amo?.data?.hint ?? amo?.data?.detail ?? amo?.data?.title;
    console.error('amocrm manualConnect failed:', {
      domain,
      status: amo?.status ?? null,
      hint: hint ?? null,
    });

    res.status(400).json({
      error:
        hint === 'Invalid auth code'
          ? 'Kod eskirgan yoki allaqachon ishlatilgan — amoCRM\'dan yangisini oling'
          : hint
            ? `amoCRM rad etdi: ${hint}`
            : 'Ulanmadi — kod yoki domen noto\'g\'ri bo\'lishi mumkin',
    });
  }
}

// ---- GET /api/workspace/amocrm-status (protected) ----
export async function status(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const { rows } = await pool.query<{
      amocrm_domain: string | null;
      amocrm_access_token: string | null;
      amocrm_pipeline_id: string | null;
      amocrm_won_stage_id: string | null;
      amocrm_qualified_stage_ids: string[] | null;
      amocrm_won_pairs: string[] | null;
      amocrm_qualified_pairs: string[] | null;
      amocrm_lead_pairs: string[] | null;
      amocrm_client_id: string | null;
      amocrm_client_secret: string | null;
      amocrm_webhook_secret: string | null;
      amocrm_token_expires_at: Date | null;
    }>(
      `SELECT amocrm_domain, amocrm_access_token, amocrm_pipeline_id,
              amocrm_won_stage_id, amocrm_qualified_stage_ids,
              amocrm_won_pairs, amocrm_qualified_pairs, amocrm_lead_pairs,
              amocrm_client_id, amocrm_client_secret,
              amocrm_webhook_secret, amocrm_token_expires_at
         FROM workspaces WHERE id = $1`,
      [req.user.workspaceId]
    );
    const ws = rows[0];

    // Webhook URL'ni to'liq ko'rinishda beramiz — mijoz uni amoCRM'ga
    // nusxalaydi. Sir bu yerda ochiq: u faqat KIRUVCHI webhook'ni
    // tasdiqlaydi, CRM'ga kirish huquqi bermaydi. Va bu so'rov
    // workspace egasining o'ziga, JWT ostida javob qaytaradi.
    const base = apiBaseUrl(req);
    const webhookUrl = ws?.amocrm_webhook_secret
      ? `${base}/api/webhooks/amocrm?secret=${ws.amocrm_webhook_secret}`
      : null;

    res.json({
      connected: Boolean(ws?.amocrm_access_token),
      domain: ws?.amocrm_domain ?? null,
      pipelineId: ws?.amocrm_pipeline_id ?? null,
      wonStageId: ws?.amocrm_won_stage_id ?? null,
      qualifiedStageIds: ws?.amocrm_qualified_stage_ids ?? [],
      /** '<voronka>:<etap>' juftliklari — sotuv va sifatli lid ta'rifi. */
      wonPairs: ws?.amocrm_won_pairs ?? [],
      qualifiedPairs: ws?.amocrm_qualified_pairs ?? [],
      leadPairs: ws?.amocrm_lead_pairs ?? [],
      /** Client ID maxfiy emas — OAuth'da ochiq yuboriladi. */
      clientId: ws?.amocrm_client_id ?? null,
      /** Secret hech qachon qaytarilmaydi — faqat bor/yo'q (§4.1). */
      clientSecretConfigured: Boolean(ws?.amocrm_client_secret),
      webhookUrl,
      tokenExpiresAt: ws?.amocrm_token_expires_at ?? null,
    });
  } catch (err) {
    console.error('amocrm status error:', err);
    res.status(500).json({ error: 'Failed to load status' });
  }
}

// ---- GET /api/workspace/amocrm-pipelines (protected) ----
export async function listPipelines(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const pipelines = await getPipelines(req.user.workspaceId);
    res.json({
      pipelines: pipelines.map((p) => ({
        id: p.id,
        name: p.name,
        statuses: (p._embedded?.statuses ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load pipelines';
    const code = message.includes('not connected') ? 400 : 500;
    res.status(code).json({ error: message });
  }
}

// ---- POST /api/workspace/amocrm-pipeline (protected) ----
/** '10742882:142' — voronka:etap. Boshqa shakl qabul qilinmaydi. */
const pairList = z
  .array(z.string().regex(/^\d+:\d+$/, 'Juftlik "voronka:etap" ko\'rinishida bo\'lsin'))
  .max(50, 'Juftliklar soni 50 dan oshmasin')
  .optional();

/**
 * amoCRM ID si — faqat raqam va aqlli uzunlikda.
 *
 * Ilgari bu `z.string()` edi va istalgan matnni qabul qilardi: test
 * paytida 40 xonali axlat qiymat jimgina saqlanib ketdi. Bunday xato
 * hech qanday belgi bermaydi — hisobot shunchaki bo'sh chiqadi va
 * sababini topish uchun bazani ochish kerak bo'ladi.
 */
const amoId = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,18}$/.test(v), 'ID faqat raqamdan iborat bo\'lishi kerak');

const pipelineSchema = z.object({
  /** Hisobotdagi standart voronka. Juftliklar bundan mustaqil ishlaydi. */
  pipelineId: amoId,
  wonStageId: amoId,
  /**
   * §3.3 etaplar.sifatli — eski, bitta voronkali shakl. Orqaga moslik uchun.
   */
  qualifiedStageIds: z
    .array(z.union([z.string(), z.number()]))
    .optional()
    .transform((v) => (v ? v.map((x) => String(x)) : undefined)),
  /**
   * Yangi shakl: sotuv va sifatli lid (voronka:etap) juftliklari ro'yxati.
   *
   * Bitta voronka yetarli emas — mijozda voronka ikki bosqichli bo'lishi
   * mumkin va pul ikkinchisida yopiladi. Voronkasiz etap ID si ham
   * yetarli emas: amoCRM'da 142/143 har voronkada takrorlanadi.
   */
  wonPairs: pairList,
  qualifiedPairs: pairList,
  /** §3.3 etaplar.yangi — voronkaning birinchi (lid) bosqichi. */
  leadPairs: pairList,
});

export async function savePipeline(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const parsed = pipelineSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  try {
    // Sotuv juftligi bo'sh qolmasin: bo'sh ro'yxat "hech bir sotuv
    // hisoblanmaydi" degani va u jimgina daromadni nolga tushiradi.
    // Yuborilmagan bo'lsa — tanlangan voronka+etapdan yasaymiz.
    const wonPairs =
      parsed.data.wonPairs && parsed.data.wonPairs.length > 0
        ? parsed.data.wonPairs
        : parsed.data.wonPairs // bo'sh massiv ataylab yuborilgan
          ? [`${parsed.data.pipelineId}:${parsed.data.wonStageId}`]
          : null; // umuman yuborilmagan — mavjud qiymat saqlanadi

    const qualifiedPairs = parsed.data.qualifiedPairs ?? null;
    const leadPairs = parsed.data.leadPairs ?? null;

    const result = await pool.query(
      `UPDATE workspaces
         SET amocrm_pipeline_id = $1,
             amocrm_won_stage_id = $2,
             amocrm_qualified_stage_ids =
               COALESCE($3::text[], amocrm_qualified_stage_ids),
             amocrm_won_pairs =
               COALESCE($4::text[], amocrm_won_pairs),
             amocrm_qualified_pairs =
               COALESCE($5::text[], amocrm_qualified_pairs),
             amocrm_lead_pairs =
               COALESCE($7::text[], amocrm_lead_pairs),
             updated_at = now()
       WHERE id = $6`,
      [
        parsed.data.pipelineId,
        parsed.data.wonStageId,
        parsed.data.qualifiedStageIds ?? null,
        wonPairs,
        qualifiedPairs,
        req.user.workspaceId,
        leadPairs,
      ]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({
      success: true,
      pipelineId: parsed.data.pipelineId,
      wonStageId: parsed.data.wonStageId,
      wonPairs: wonPairs,
      qualifiedPairs: qualifiedPairs,
      leadPairs,
    });
  } catch (err) {
    console.error('amocrm savePipeline error:', err);
    res.status(500).json({ error: 'Failed to save pipeline' });
  }
}

// ---- GET /api/workspace/amocrm-fields (protected) ----
/**
 * amoCRM maydonlarini tahlil qiladi: qaysi biri Meta Lead ID ni
 * saqlayotgan bo'lishi mumkin va atribusiya kalitlari (UTM, fbclid)
 * nechta lidda to'ldirilgan.
 *
 * FAQAT O'QISH. Hech narsa tanlamaydi va saqlamaydi (§3.5) —
 * nomzodlarni ko'rsatadi, qarorni odam qabul qiladi.
 */
export async function listFields(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const tahlil = await discoverLeadFields(req.user.workspaceId);
    const { rows } = await pool.query<{
      amocrm_lead_id_field: string | null;
      amocrm_lead_id_source: string | null;
      amocrm_line_field: string | null;
      amocrm_ad_lines: string[] | null;
    }>(
      `SELECT amocrm_lead_id_field, amocrm_lead_id_source,
              amocrm_line_field, amocrm_ad_lines
         FROM workspaces WHERE id = $1`,
      [req.user.workspaceId]
    );
    res.json({
      ...tahlil,
      tanlangan: rows[0]?.amocrm_lead_id_field ?? null,
      manba: rows[0]?.amocrm_lead_id_source ?? 'field',
      liniyaMaydoni: rows[0]?.amocrm_line_field ?? null,
      reklamaLiniyalari: rows[0]?.amocrm_ad_lines ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Maydonlarni o\'qib bo\'lmadi';
    const code = message.includes('not connected') ? 400 : 500;
    res.status(code).json({ error: message });
  }
}

// ---- POST /api/workspace/amocrm-lead-id-field (protected) ----
const leadIdFieldSchema = z.object({
  /** amoCRM field_id. null — sozlamani bekor qilish. */
  fieldId: z.union([amoId, z.null()]),
  /** Lead ID qayerdan o'qiladi. Yuborilmasa mavjud qiymat saqlanadi. */
  source: z.enum(['field', 'name', 'tag']).optional(),
  /** Qo'ng'iroq liniyasi maydoni. Yuborilmasa mavjud qiymat saqlanadi. */
  lineField: z.union([amoId, z.null()]).optional(),
  /**
   * Reklama liniyalari. Faqat raqam qoldiriladi — CRM'da ular
   * "+998 78 123-45-67" ko'rinishida bo'lishi mumkin, taqqoslash esa
   * ikkala tomonda bir xil normalizatsiyadan o'tishi shart.
   */
  adLines: z
    .array(z.string())
    .max(50)
    .optional()
    .transform((v) => (v ? v.map((x) => x.replace(/\D/g, '')).filter(Boolean) : undefined)),
});

export async function saveLeadIdField(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const parsed = leadIdFieldSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  try {
    const result = await pool.query(
      `UPDATE workspaces
          SET amocrm_lead_id_field = $1,
              amocrm_lead_id_source = COALESCE($5, amocrm_lead_id_source),
              amocrm_line_field = COALESCE($3, amocrm_line_field),
              amocrm_ad_lines = COALESCE($4::text[], amocrm_ad_lines),
              updated_at = now()
        WHERE id = $2`,
      [
        parsed.data.fieldId,
        req.user.workspaceId,
        parsed.data.lineField ?? null,
        parsed.data.adLines ?? null,
        parsed.data.source ?? null,
      ]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({
      success: true,
      fieldId: parsed.data.fieldId,
      source: parsed.data.source ?? null,
      lineField: parsed.data.lineField ?? null,
      adLines: parsed.data.adLines ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Saqlanmadi' });
  }
}
