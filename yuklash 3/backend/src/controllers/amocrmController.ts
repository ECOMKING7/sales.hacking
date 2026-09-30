import { Request, Response } from 'express';
import { frontendUrl } from '../utils/frontendUrl';
import { z } from 'zod';
import { pool } from '../db/pool';
import {
  signOAuthState,
  verifyOAuthState,
  signAmoClaim,
  verifyAmoClaim,
} from '../utils/jwt';
import { encrypt, decrypt } from '../utils/encryption';
import {
  generateAuthURL,
  exchangeCodeForTokens,
  resolveConnectCredentials,
  credentialsForKind,
  requestTokens,
  saveTokens,
  getPipelines,
  saveCredentials,
  amoGetPath,
} from '../services/amocrmService';
import { discoverLeadFields, type MaydonTahlili } from '../services/amocrmFields';
import { bizniki, hostAjrat } from '../services/webhookIdentity';
import { webhookniTaminla } from '../services/webhookTaminla';
import { demoOchir } from '../services/demoWorkspace';
import {
  ensureAmoPublicSchema,
  publicCreds,
  validAmoDomain,
} from '../services/amocrmPublic';


// ---- GET /api/auth/amocrm/connect (protected) ----

/** Haqiqiy CRM ulandi — demo lidlar real lidlar bilan aralashmasin. Fail-soft. */
async function demoniTozala(workspaceId: string): Promise<void> {
  try {
    await demoOchir(workspaceId);
  } catch (err) {
    console.error('demo tozalanmadi:', (err as Error).message);
  }
}

export async function connect(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(400).json({ error: 'No workspace associated with this account' });
    return;
  }
  try {
    const creds = await resolveConnectCredentials(req.user.workspaceId);
    const state = signOAuthState({
      userId: req.user.userId,
      workspaceId: req.user.workspaceId,
      amo: creds.kind,
    });
    res.json({ url: await generateAuthURL(creds.clientId, state) });
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
  const domain = validAmoDomain(referer);
  if (!code || !domain) {
    redirectTo('error');
    return;
  }

  // state yo'q — o'rnatish amoMarket'dan boshlangan (bizning tugmadan emas).
  if (!state) {
    await marketplaceInstall(req, res, code, domain);
    return;
  }

  let workspaceId: string | null;
  let amoKind: OAuthKind | undefined;
  try {
    ({ workspaceId, amo: amoKind } = verifyOAuthState(state));
  } catch {
    redirectTo('error');
    return;
  }
  if (!workspaceId) {
    redirectTo('error');
    return;
  }

  try {
    // Ulanish qaysi kalit bilan boshlangan bo'lsa — o'sha bilan almashtiramiz.
    const creds = await credentialsForKind(workspaceId, amoKind);

    // Ommaviy integratsiyada bitta amoCRM boshqa workspace'da band bo'lmasin (§3.7).
    if (creds.kind === 'public') {
      const taken = await pool.query<{ id: string }>(
        `SELECT id FROM workspaces
          WHERE amocrm_domain = $1 AND amocrm_access_token IS NOT NULL AND id <> $2
          LIMIT 1`,
        [domain, workspaceId]
      );
      if (taken.rows[0]) {
        redirectTo('taken');
        return;
      }
    }

    await exchangeCodeForTokens(code, domain, workspaceId, creds);

    // Webhook siri bo'lmasa yasaymiz — keyingi qadam unga tayanadi.
    await pool.query(
      `UPDATE workspaces
          SET amocrm_webhook_secret = replace(gen_random_uuid()::text, '-', '')
        WHERE id = $1 AND amocrm_webhook_secret IS NULL`,
      [workspaceId]
    );

    /* Webhook — ulanishning bir qismi, alohida qadam emas.
       Sababi manualConnect dagi izohda. */
    try {
      const n = await webhookniTaminla(workspaceId, apiBaseUrl(req));
      if (n.holat === 'xato') console.warn(`amocrm callback: ${n.xabar}`);
    } catch (err) {
      console.error('webhook taminlash xatosi:', (err as Error).message);
    }

    await demoniTozala(workspaceId);
    redirectTo('connected');
  } catch (err) {
    // axios xatosi config.data ichida client_secret va code'ni olib yuradi —
    // butun obyektni log'ga yozmaymiz, faqat holat va sabab.
    const amo = (err as { response?: { status?: number; data?: { hint?: string } } }).response;
    console.error('amocrm callback error:', {
      status: amo?.status ?? null,
      hint: amo?.data?.hint ?? (err as Error).message,
    });
    redirectTo('error');
  }
}

type OAuthKind = 'public' | 'private' | 'legacy';

/** O'rnatish natijasi sahifasi (loginsiz ochiladi). */
function installPage(res: Response, query: Record<string, string>): void {
  res.redirect(`${frontendUrl()}/amocrm/install?${new URLSearchParams(query).toString()}`);
}

/**
 * amoMarket'dan o'rnatish. Bu yerda bizda foydalanuvchi YO'Q —
 * shuning uchun tokenlar vaqtincha `amocrm_pending_installs` ga yoziladi
 * (shifrlangan) va brauzer imzolangan da'vo kaliti bilan saytga
 * yuboriladi. Foydalanuvchi kirgach /claim orqali biriktiradi.
 *
 * Kod 20 daqiqa yashaydi — shuning uchun uni shu zahoti almashtiramiz,
 * foydalanuvchi ro'yxatdan o'tguncha kutib turmaymiz.
 */
async function marketplaceInstall(
  _req: Request,
  res: Response,
  code: string,
  domain: string
): Promise<void> {
  const pub = publicCreds();
  if (!pub) {
    console.error('amocrm install: AMOCRM_PUBLIC_CLIENT_ID/SECRET sozlanmagan');
    installPage(res, { error: 'not_configured' });
    return;
  }

  try {
    await ensureAmoPublicSchema();
    const t = await requestTokens(code, domain, pub);

    // Bir domen — bitta kutilayotgan o'rnatma. Qayta o'rnatilsa yangilanadi.
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO amocrm_pending_installs (domain, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4::int))
       ON CONFLICT (domain) DO UPDATE
         SET id            = gen_random_uuid(),  -- eski da'vo kaliti yangi tokenga ishlamasin
             access_token  = EXCLUDED.access_token,
             refresh_token = EXCLUDED.refresh_token,
             expires_at    = EXCLUDED.expires_at,
             created_at    = now()
       RETURNING id`,
      [domain, encrypt(t.access_token), encrypt(t.refresh_token), t.expires_in]
    );

    // Da'vo kaliti 15 daqiqa yashaydi — undan keyin yozuvdan foyda yo'q,
    // shifrlangan token ham bazada ortiqcha turmasin. Zaxira bilan 2 soat.
    // (amoCRM kodni serverdan-serverga yuborsa, foydalanuvchi baribir
    // saytdagi "Ulash" tugmasi orqali ulaydi — bu yozuv kerak bo'lmaydi.)
    await pool.query(
      `DELETE FROM amocrm_pending_installs WHERE created_at < now() - interval '2 hours'`
    );

    installPage(res, { claim: signAmoClaim(rows[0].id), domain });
  } catch (err) {
    const amo = (err as { response?: { status?: number; data?: { hint?: string } } }).response;
    // Kod/token hech qachon log'ga tushmaydi.
    console.error('amocrm marketplace install failed:', {
      domain,
      status: amo?.status ?? null,
      hint: amo?.data?.hint ?? (err as Error).message,
    });
    installPage(res, { error: 'exchange_failed' });
  }
}

// ---- POST /api/auth/amocrm/claim (protected) ----
const claimSchema = z.object({ claim: z.string().min(20).max(2000) });

export async function claimInstall(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    // 401 emas: frontend 401 ni "sessiya tugadi" deb logout qiladi.
    res.status(400).json({ error: 'Create a workspace first, then open the link again.' });
    return;
  }

  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'claim is required' });
    return;
  }

  let pid: string;
  try {
    ({ pid } = verifyAmoClaim(parsed.data.claim));
  } catch {
    res.status(400).json({
      error: 'Link expired. Open the integration in amoCRM and install it again.',
    });
    return;
  }

  // Sxema tranzaksiyadan OLDIN — ichkarida pool'ga murojaat bo'lmasin.
  try {
    await ensureAmoPublicSchema();
  } catch (err) {
    console.error('amocrm claim schema:', (err as Error).message);
    res.status(500).json({ error: 'Could not connect amoCRM. Try again.' });
    return;
  }

  const client = await pool.connect();
  let domain: string;
  try {
    await client.query('BEGIN');

    // DELETE ... RETURNING birinchi: ikki parallel so'rovdan faqat BITTASI
    // yozuvni oladi. Aks holda bitta refresh token ikki workspace'ga
    // tushadi, birinchi yangilash uni aylantiradi va ikkinchisi jim o'ladi.
    const { rows } = await client.query<{
      domain: string;
      access_token: string;
      refresh_token: string;
      expires_at: Date;
    }>(
      `DELETE FROM amocrm_pending_installs WHERE id = $1
       RETURNING domain, access_token, refresh_token, expires_at`,
      [pid]
    );
    const p = rows[0];
    if (!p) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Installation not found or already connected.' });
      return;
    }
    domain = p.domain;

    // §3.7 izolyatsiya: bitta amoCRM — bitta workspace. Webhook domen
    // bo'yicha yo'naltiriladi; ikki workspace bir domenda bo'lsa lidlar
    // aralashib ketadi.
    const taken = await client.query<{ id: string }>(
      `SELECT id FROM workspaces
        WHERE amocrm_domain = $1 AND amocrm_access_token IS NOT NULL AND id <> $2
        LIMIT 1`,
      [p.domain, workspaceId]
    );
    if (taken.rows[0]) {
      await client.query('ROLLBACK');
      res.status(409).json({
        error: `${p.domain} is already connected to another workspace.`,
      });
      return;
    }

    // Workspace boshqa amoCRM'ga ulangan bo'lsa — jimgina almashtirmaymiz.
    const cur = await client.query<{
      amocrm_domain: string | null;
      amocrm_access_token: string | null;
    }>(
      `SELECT amocrm_domain, amocrm_access_token FROM workspaces WHERE id = $1 FOR UPDATE`,
      [workspaceId]
    );
    const w = cur.rows[0];
    if (w?.amocrm_access_token && w.amocrm_domain && w.amocrm_domain !== p.domain) {
      await client.query('ROLLBACK');
      res.status(409).json({
        error: `This workspace is already connected to ${w.amocrm_domain}. Create a new workspace for ${p.domain}.`,
      });
      return;
    }

    const expiresInSec = Math.max(
      0,
      Math.floor((new Date(p.expires_at).getTime() - Date.now()) / 1000)
    );
    await saveTokens(
      workspaceId,
      p.domain,
      { access: decrypt(p.access_token), refresh: decrypt(p.refresh_token), expiresInSec },
      'public',
      client
    );
    await client.query(
      `UPDATE workspaces
          SET amocrm_webhook_secret = replace(gen_random_uuid()::text, '-', '')
        WHERE id = $1 AND amocrm_webhook_secret IS NULL`,
      [workspaceId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('amocrm claim failed:', (err as Error).message);
    res.status(500).json({ error: 'Could not connect amoCRM. Try again.' });
    return;
  } finally {
    client.release();
  }

  // Webhook tranzaksiyadan TASHQARIDA: tarmoq so'rovi, yiqilsa ulanish qoladi.
  let webhook: Awaited<ReturnType<typeof webhookniTaminla>> | null = null;
  try {
    webhook = await webhookniTaminla(workspaceId, apiBaseUrl(req));
  } catch (err) {
    console.error('webhook taminlash xatosi:', (err as Error).message);
  }

  await demoniTozala(workspaceId);
  res.json({ success: true, domain, webhook });
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

    /* Webhook'ni DARHOL ro'yxatdan o'tkazamiz.
       Ilgari bu qadam yo'q edi va natija: integratsiya "ulangan"
       ko'rinardi, import ishlardi, lekin yangi lid haqida bizga
       hech narsa kelmasdi. 3 oy shunday turdi va hech kim sezmadi.
       Yiqilsa ulanishni BUZMAYDI — holat javobda qaytadi. */
    let webhook: Awaited<ReturnType<typeof webhookniTaminla>> | null = null;
    try {
      webhook = await webhookniTaminla(req.user.workspaceId, apiBaseUrl(req));
    } catch (err) {
      console.error('webhook taminlash xatosi:', (err as Error).message);
    }

    await demoniTozala(req.user.workspaceId);
    res.json({ success: true, domain, webhook });
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
      /**
       * Ommaviy integratsiya (McQueen AI) serverda sozlanganmi. Rost bo'lsa
       * UI bitta "Ulash" tugmasini beradi — mijoz o'z integratsiyasini
       * yaratmaydi va kalit ko'chirmaydi. Kalitning o'zi qaytarilmaydi.
       */
      publicAvailable: Boolean(publicCreds()),
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
  /**
   * Takroriy maydonni ATAYLAB tanlash uchun. Bu bayroqsiz server
   * takroriy maydonni qabul qilmaydi (409 qaytaradi).
   */
  takroriyniTasdiqlayman: z.boolean().optional(),
});

/* ═══════════════════════════════════════════════════════════════════════
   SAQLASH PAYTIDAGI HIMOYA

   Tahlil sahifasi nomzodlarni to'g'ri ajratadi, lekin u FAQAT KO'RSATADI.
   Bu endpointga esa istalgan `fieldId` yuborilishi mumkin — eski
   ekrandan, boshqa havoladan, yoki shunchaki API orqali.

   Bir marta noto'g'ri saqlansa oqibat jim bo'ladi: `leads.fb_lead_id`
   ga forma ID yoziladi, import "muvaffaqiyatli" tugaydi, CAPI esa
   hech narsani moslamaydi. Xato chiqmaydi — shuning uchun to'siq
   aynan SAQLASHDA turishi kerak, ko'rsatishda emas.

   Tekshiruv arzon: tahlil allaqachon hisoblangan bo'ladi va bu yerda
   faqat tanlangan maydon qaraladi.
   ═══════════════════════════════════════════════════════════════════════ */

/** Tanlov takroriy manbani ko'rsatyaptimi — sabab matni yoki null. */
function takroriyTanlov(
  tahlil: MaydonTahlili,
  manba: 'field' | 'name' | 'tag' | null,
  fieldId: string | null
): string | null {
  if (manba === 'name') {
    return tahlil.nomTakroriy
      ? `Lid NOMIDAGI sonlar takrorlanadi: ${tahlil.nomdaTopildi} ta lidda atigi ${tahlil.nomNoyob} xil qiymat. Bu har lidga tegishli Lead ID emas — ehtimol forma yoki reklama ID si.`
      : null;
  }
  if (manba === 'tag') {
    return tahlil.tegTakroriy
      ? `TEGLARDAGI sonlar takrorlanadi: ${tahlil.tegdaTopildi} ta lidda atigi ${tahlil.tegNoyob} xil qiymat. Bu Lead ID emas — ehtimol forma ID si.`
      : null;
  }
  if (!fieldId) return null;
  const m = tahlil.takroriyNomzodlar.find((x) => x.field_id === fieldId);
  if (!m) return null;
  return `"${m.field_name}" maydonidagi qiymatlar takrorlanadi: ${m.toldirilgan} ta lidda atigi ${m.noyob} xil qiymat (noyoblik ${m.noyoblik}%). Lead ID har lidda boshqa bo'lishi kerak.`;
}

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
    /* Takroriylik to'sig'i. Faqat Lead ID tanlanayotganda ishlaydi —
       liniya maydoni yoki reklama liniyalari yangilanayotgan bo'lsa
       (fieldId va source tegilmagan) bekorga API so'rov qilinmaydi. */
    const leadIdTegildi =
      parsed.data.fieldId !== null || parsed.data.source !== undefined;

    if (leadIdTegildi && !parsed.data.takroriyniTasdiqlayman) {
      let sabab: string | null = null;
      try {
        const tahlil = await discoverLeadFields(req.user.workspaceId);
        sabab = takroriyTanlov(
          tahlil,
          parsed.data.source ?? null,
          parsed.data.fieldId
        );
      } catch {
        // Tahlil qilib bo'lmasa saqlashni BLOKLAMAYMIZ: amoCRM vaqtincha
        // javob bermasligi sozlamani o'zgartirishga to'siq bo'lmasligi
        // kerak. To'siq — noto'g'ri tanlovga qarshi, uzilishga qarshi emas.
      }
      if (sabab) {
        res.status(409).json({
          error: 'takroriy_maydon',
          xabar: sabab,
          maslahat:
            "Meta Lead ID har lidda YAGONA bo'ladi. Takrorlanadigan qiymat — odatda forma yoki reklama ID si; u CAPI'da hech narsani moslamaydi va xato ham bermaydi. Boshqa maydon tanlang yoki ataylab davom etmoqchi bo'lsangiz `takroriyniTasdiqlayman: true` yuboring.",
        });
        return;
      }
    }

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

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/workspace/amocrm-webhooks

   "Webhook ishlayaptimi?" degan savolga SOXTA LID YARATMASDAN javob.

   Ilgari buni tekshirishning yagona yo'li test lid yaratish edi. Lekin
   u uch narsani ifloslantiradi: mijozning haqiqiy statistikasi, Meta'ga
   ketadigan hodisalar oqimi, va keyin tozalash ishi. Bularning hammasi
   bitta GET so'rov bilan hal bo'ladi.

   amoCRM `/api/v4/webhooks` obunalar ro'yxatini qaytaradi. Uchta narsa
   ko'rinadi:
     1. Webhook UMUMAN bormi
     2. Manzili BIZNING serverga ishora qilyaptimi (boshqa integratsiya
        webhook'i ham shu ro'yxatda bo'lishi mumkin)
     3. Kerakli hodisalarga obuna bo'lganmi (`add_lead`, `status_lead`)

   FAQAT O'QIYDI (§4.3). Hech narsa yozmaydi, o'chirmaydi, ulamaydi.
   ═══════════════════════════════════════════════════════════════════════ */

/** ISO vaqtdan hozirgacha necha to'liq kun. Noto'g'ri sana → 0. */
function kunFarqi(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/** "12 daqiqa oldin" / "3 soat oldin" / "6 kun oldin". */
function vaqtMatni(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const daq = Math.floor(ms / 60_000);
  if (daq < 1) return 'hozirgina';
  if (daq < 60) return `${daq} daqiqa oldin`;
  const soat = Math.floor(daq / 60);
  if (soat < 24) return `${soat} soat oldin`;
  return `${Math.floor(soat / 24)} kun oldin`;
}

interface AmoWebhook {
  id?: number;
  destination?: string;
  settings?: string[];
  disabled?: boolean;
  created_at?: number;
  updated_at?: number;
}

export async function listWebhooks(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const javob = await amoGetPath<{ _embedded?: { webhooks?: AmoWebhook[] } }>(
      req.user.workspaceId,
      '/api/v4/webhooks'
    );
    const xom = javob._embedded?.webhooks ?? [];
    const bizningHost = hostAjrat(apiBaseUrl(req));

    const royxat = xom.map((w) => {
      const dest = w.destination ?? '';
      return {
        id: w.id ?? null,
        // Manzil to'liq ko'rsatiladi: ichida maxfiy narsa yo'q, lekin
        // `?secret=` bo'lsa maskalanadi (§4.2).
        manzil: dest.replace(/([?&](secret|token)=)[^&]+/gi, '$1***'),
        bizniki: bizniki(dest, bizningHost),
        hodisalar: w.settings ?? [],
        ochirilgan: Boolean(w.disabled),
      };
    });

    const bizniki_lar = royxat.filter((w) => w.bizniki && !w.ochirilgan);
    const kerakli = ['add_lead', 'status_lead'];
    const yetishmayotgan = kerakli.filter(
      (h) => !bizniki_lar.some((w) => w.hodisalar.includes(h))
    );

    /**
     * ⚠ RO'YXAT ≠ ISHLAYAPTI.
     *
     * Yuqoridagi tekshiruv amoCRM "obuna bor" deganini aytadi, xolos.
     * Haqiqatan signal kelayotganini faqat BIZNING baza biladi —
     * `oxirgi_webhook` (migratsiya 040). Ikkalasi birga ko'rsatiladi:
     * "obuna bor, lekin 6 kundan beri jim" — bu eng xavfli holat va
     * faqat shu ikki manbani solishtirganda ko'rinadi.
     */
    const { rows: sig } = await pool.query<{
      oxirgi: string | null;
      turi: string | null;
      soni: string;
    }>(
      `SELECT oxirgi_webhook::text AS oxirgi,
              oxirgi_webhook_turi  AS turi,
              webhook_soni::text   AS soni
         FROM workspaces WHERE id = $1`,
      [req.user.workspaceId]
    );
    const signal = {
      oxirgi: sig[0]?.oxirgi ?? null,
      turi: sig[0]?.turi ?? null,
      soni: Number(sig[0]?.soni ?? 0),
    };

    let xulosa: string;
    if (royxat.length === 0) {
      xulosa =
        "amoCRM'da BIRORTA webhook yo'q. Ya'ni lid tushganda ham, etap o'zgarganda ham bizga hech narsa kelmaydi — CAPI ishlamaydi.";
    } else if (bizniki_lar.length === 0) {
      xulosa = `${royxat.length} ta webhook bor, lekin BIZNIKI YO'Q (yoki o'chirilgan). Mavjudlari boshqa integratsiyalarniki.`;
    } else if (yetishmayotgan.length > 0) {
      xulosa = `Bizning webhook bor, lekin shu hodisalarga obuna emas: ${yetishmayotgan.join(', ')}. Obuna bo'lmagan hodisa umuman kelmaydi.`;
    } else if (signal.oxirgi === null) {
      // Obuna bor, lekin bizga hali BIROR MARTA ham signal kelmagan.
      // Aynan shu holat 2026-09-19 da oylab sezilmasdan turgan edi.
      xulosa =
        "Obuna bor, lekin bizga HALI BIROR MARTA signal kelmagan. Obuna yangi bo'lsa — birinchi lid yoki etap o'zgarishini kuting. Aks holda amoCRM bizga yetkazmayapti.";
    } else if (kunFarqi(signal.oxirgi) >= 7) {
      xulosa = `Obuna bor, lekin oxirgi signal ${kunFarqi(signal.oxirgi)} kun oldin kelgan. CRM'da shu davrda harakat bo'lgan bo'lsa — yetkazish buzilgan.`;
    } else {
      xulosa = `Ishlayapti: oxirgi signal ${vaqtMatni(signal.oxirgi)}, jami ${signal.soni} ta qabul qilingan.`;
    }

    res.json({
      jami: royxat.length,
      bizniki: bizniki_lar.length,
      yetishmayotgan,
      xulosa,
      webhooklar: royxat,
      signal,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status === 400 || e.status === 403) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error('amocrm webhooks error:', e.message);
    res.status(500).json({ error: "Webhook ro'yxatini o'qib bo'lmadi" });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   ---- POST /api/workspace/amocrm-webhook ----

   Webhook'ni qo'lda tiklash.

   NEGA KERAK: webhook ulanish paytida avtomatik qo'shiladi, lekin
   mijoz uni amoCRM'dan o'chirib yuborishi mumkin (ular ro'yxatda
   ko'rinadi va "keraksiz" deb tuyulishi mumkin). O'chirilsa atribusiya
   jimgina to'xtaydi — hech qayerda xato chiqmaydi.

   ⚠ CRM GA YOZADI (§4.3), lekin faqat foydalanuvchi tugmani bosganda.
   Yozadigan narsa: bitta webhook qatori, o'z manzilimiz bilan.
   Mavjud bo'lsa — hech narsa yozilmaydi. Hech narsa o'chirilmaydi.
   ═══════════════════════════════════════════════════════════════════════ */
export async function ensureWebhook(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const natija = await webhookniTaminla(req.user.workspaceId, apiBaseUrl(req));
    res.status(natija.holat === 'xato' ? 400 : 200).json(natija);
  } catch (err) {
    console.error('ensureWebhook:', (err as Error).message);
    res.status(500).json({ error: "Webhook ta'minlanmadi" });
  }
}
