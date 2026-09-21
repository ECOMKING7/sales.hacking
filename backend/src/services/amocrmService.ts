import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { encrypt, decrypt } from '../utils/encryption';
import { normalizePhoneE164 } from '../utils/phone';
import {
  oraliqniKut,
  sovishHolati,
  sovishniBelgila,
  sovishniTozala,
  kutishVaqti,
} from './amoRateLimit';

const AUTH_BASE = 'https://www.amocrm.ru/oauth';

function redirectUri(): string {
  const v = process.env.AMOCRM_REDIRECT_URI;
  if (!v) throw new Error('AMOCRM_REDIRECT_URI is not set');
  return v;
}

/* ─────────────────────────────────────────────────────────────
   OAuth kalitlari: workspace'dan, .env fallback bilan.

   amoCRM xususiy integratsiyani faqat yaratilgan akkauntda
   ishlatishga ruxsat beradi. Ya'ni har mijoz o'z CRM'ida o'z
   integratsiyasini yaratadi va uning client_id/secret'i boshqa
   bo'ladi — umumiy env bilan ikkinchi mijozni ulash imkonsiz.

   amoMarket'dagi ommaviy integratsiyada esa bitta client_id
   hamma mijoz uchun ishlaydi. Shuning uchun ikki manba ham
   qoladi: workspace'da bo'lsa — o'shani, bo'lmasa — env.
   ───────────────────────────────────────────────────────────── */

export interface AmoCredentials {
  clientId: string;
  clientSecret: string;
}

function envCredentials(): AmoCredentials | null {
  const id = process.env.AMOCRM_CLIENT_ID;
  const secret = process.env.AMOCRM_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { clientId: id, clientSecret: secret };
}

/**
 * Workspace uchun OAuth kalitlari. Ikkisi ham topilmasa otadi —
 * chunki kalitsiz hech qanday so'rov ishlamaydi va buni jim
 * o'tkazib yuborish keyinroq tushunarsiz 401 ga olib keladi.
 */
export async function loadCredentials(workspaceId: string): Promise<AmoCredentials> {
  const { rows } = await pool.query<{
    amocrm_client_id: string | null;
    amocrm_client_secret: string | null;
  }>(
    `SELECT amocrm_client_id, amocrm_client_secret FROM workspaces WHERE id = $1`,
    [workspaceId]
  );

  const ws = rows[0];
  if (ws?.amocrm_client_id && ws.amocrm_client_secret) {
    return {
      clientId: ws.amocrm_client_id,
      clientSecret: decrypt(ws.amocrm_client_secret),
    };
  }

  const fromEnv = envCredentials();
  if (fromEnv) return fromEnv;

  throw new Error(
    'amoCRM kalitlari topilmadi: workspace\'da ham, .env da ham yo\'q'
  );
}

/** Workspace uchun kalitlarni saqlash. Secret shifrlanadi (§4.1). */
export async function saveCredentials(
  workspaceId: string,
  creds: AmoCredentials
): Promise<void> {
  await pool.query(
    `UPDATE workspaces
        SET amocrm_client_id = $1,
            amocrm_client_secret = $2,
            updated_at = now()
      WHERE id = $3`,
    [creds.clientId, encrypt(creds.clientSecret), workspaceId]
  );
}

// ---------- hashing ----------

/**
 * Telefonni E.164 ga keltirib SHA-256 hash qiladi.
 *
 * Keltirib bo'lmasa `null` qaytaradi — buzuq raqamni hash qilishdan ko'ra
 * hash qilmagan ma'qul: birinchisi jim ravishda hech kimga mos kelmaydi
 * va buni keyin aniqlash imkonsiz bo'ladi.
 *
 * `countryCode` konfiguratsiyadan keladi (§3.1).
 */
export function hashPhone(phone: string, countryCode?: string): string | null {
  const e164 = normalizePhoneE164(phone, countryCode);
  if (!e164) return null;
  return crypto.createHash('sha256').update(e164).digest('hex');
}

/** Lowercase/trim an email and SHA-256 hash it. */
export function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// ---------- OAuth ----------

export async function generateAuthURL(
  workspaceId: string,
  state: string
): Promise<string> {
  const { clientId } = await loadCredentials(workspaceId);
  const params = new URLSearchParams({
    client_id: clientId,
    state,
    mode: 'post_message',
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Exchange an authorization code for tokens and persist them (encrypted) to the
 * workspace. `domain` is the account domain from the callback `referer` param.
 */
export async function exchangeCodeForTokens(
  code: string,
  domain: string,
  workspaceId: string
): Promise<void> {
  const creds = await loadCredentials(workspaceId);

  const res = await axios.post<TokenResponse>(`https://${domain}/oauth2/access_token`, {
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
  });

  await pool.query(
    `UPDATE workspaces
       SET amocrm_domain = $1,
           amocrm_access_token = $2,
           amocrm_refresh_token = $3,
           amocrm_token_expires_at = now() + make_interval(secs => $4::int),
           updated_at = now()
     WHERE id = $5`,
    [
      domain,
      encrypt(res.data.access_token),
      encrypt(res.data.refresh_token),
      res.data.expires_in,
      workspaceId,
    ]
  );
}

interface AmoWorkspaceRow {
  amocrm_domain: string | null;
  amocrm_access_token: string | null;
  amocrm_refresh_token: string | null;
  amocrm_pipeline_id: string | null;
  amocrm_won_stage_id: string | null;
  amocrm_token_expires_at: Date | null;
}

async function loadAmoWorkspace(workspaceId: string): Promise<AmoWorkspaceRow> {
  const res = await pool.query<AmoWorkspaceRow>(
    `SELECT amocrm_domain, amocrm_access_token, amocrm_refresh_token,
            amocrm_pipeline_id, amocrm_won_stage_id, amocrm_token_expires_at
       FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  if (!res.rows[0]) throw new Error('Workspace not found');
  return res.rows[0];
}

/**
 * Token muddati shu oraliqdan kam qolsa — so'rovdan OLDIN yangilanadi.
 *
 * amoCRM tokeni 24 soat yashaydi. 401 ni kutib turish har mijozda
 * kuniga kamida bitta behuda so'rov va lidning kechikishini beradi;
 * webhook'da bu "lid keldi-yu atribusiya qilinmadi" ga aylanishi mumkin.
 */
const REFRESH_MARGIN_MS = 5 * 60_000;

function expiringSoon(expiresAt: Date | null): boolean {
  if (!expiresAt) return false; // muddat noma'lum — 401 bo'yicha ishlaymiz
  return new Date(expiresAt).getTime() - Date.now() < REFRESH_MARGIN_MS;
}

/**
 * Refresh the access token (AmoCRM tokens expire after 24h) and persist it.
 * Returns the new access token.
 */
export async function refreshAccessToken(workspaceId: string): Promise<string> {
  const ws = await loadAmoWorkspace(workspaceId);
  if (!ws.amocrm_domain || !ws.amocrm_refresh_token) {
    throw new Error('AmoCRM is not connected');
  }
  const creds = await loadCredentials(workspaceId);

  const res = await axios.post<TokenResponse>(
    `https://${ws.amocrm_domain}/oauth2/access_token`,
    {
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: decrypt(ws.amocrm_refresh_token),
      redirect_uri: redirectUri(),
    }
  );

  await pool.query(
    `UPDATE workspaces
       SET amocrm_access_token = $1,
           amocrm_refresh_token = $2,
           amocrm_token_expires_at = now() + make_interval(secs => $3::int),
           updated_at = now()
     WHERE id = $4`,
    [
      encrypt(res.data.access_token),
      encrypt(res.data.refresh_token),
      res.data.expires_in,
      workspaceId,
    ]
  );
  return res.data.access_token;
}

/**
 * GET an AmoCRM API path, transparently refreshing the token on a 401.
 */
async function amoGet<T = unknown>(workspaceId: string, path: string): Promise<T> {
  const ws = await loadAmoWorkspace(workspaceId);
  if (!ws.amocrm_domain || !ws.amocrm_access_token) {
    throw new Error('AmoCRM is not connected');
  }

  // 1) Akkaunt sovishdami. 429 dan keyin BAZAGA yoziladi, ya'ni
  //    boshqa funksiya nusxasi ham to'xtaydi.
  const qoldi = await sovishHolati(workspaceId);
  if (qoldi > 0) {
    throw Object.assign(
      new Error(
        `amoCRM so'rov limiti: ${Math.ceil(qoldi / 60)} daqiqadan keyin qayta urinib ko'ring`
      ),
      { status: 429 }
    );
  }

  // 2) Ketma-ket so'rovlar orasidagi oraliq.
  await oraliqniKut(ws.amocrm_domain);

  const url = `https://${ws.amocrm_domain}${path}`;
  let token = decrypt(ws.amocrm_access_token);

  // Muddati tugayotgan bo'lsa — so'rovni yuborishdan oldin yangilaymiz.
  if (expiringSoon(ws.amocrm_token_expires_at)) {
    try {
      token = await refreshAccessToken(workspaceId);
    } catch (err) {
      // Yangilash ishlamasa ham eski token bilan urinib ko'ramiz:
      // u hali tirik bo'lishi mumkin va 401 yo'li quyida bor.
      console.warn('amocrm proaktiv yangilash ishlamadi:', (err as Error).message);
    }
  }

  try {
    const res = await axios.get<T>(url, { headers: { Authorization: `Bearer ${token}` } });
    // Muvaffaqiyatli so'rov — eski sovish belgisi qolmasin.
    void sovishniTozala(workspaceId);
    return res.data;
  } catch (e) {
    const err = e as AxiosError;

    if (err.response?.status === 401) {
      token = await refreshAccessToken(workspaceId);
      const res = await axios.get<T>(url, { headers: { Authorization: `Bearer ${token}` } });
      return res.data;
    }

    /**
     * 429 — limit. Qayta urinish limitni UZAYTIRADI, shuning uchun
     * BIR MARTA kutamiz; ikkinchisida akkauntni sovishga qo'yamiz va
     * to'xtaymiz. 15.09 dagi blok aynan to'xtovsiz urinishdan kelib
     * chiqqan bo'lishi mumkin.
     */
    if (err.response?.status === 429) {
      const kutish = kutishVaqti(err.response.headers?.['retry-after']);
      console.warn(`amocrm 429: ${kutish}ms kutamiz (${path})`);
      await new Promise((r) => setTimeout(r, kutish));

      try {
        await oraliqniKut(ws.amocrm_domain as string);
        const res = await axios.get<T>(url, { headers: { Authorization: `Bearer ${token}` } });
        void sovishniTozala(workspaceId);
        return res.data;
      } catch (e2) {
        const err2 = e2 as AxiosError;
        if (err2.response?.status === 429) {
          await sovishniBelgila(workspaceId);
          throw Object.assign(
            new Error('amoCRM so\'rov limiti: akkaunt vaqtincha to\'xtatildi'),
            { status: 429 }
          );
        }
        throw err2;
      }
    }

    throw err;
  }
}

/**
 * amoCRM ga POST.
 *
 * ⚠ BU YOZADI (§4.3). Faqat ATAYLAB chaqiriladigan joylardan
 * ishlatiladi va har chaqiruv hujjatda sababi bilan yoziladi.
 * Hozircha yagona foydalanuvchisi — webhook ro'yxatdan o'tkazish.
 *
 * Nega alohida funksiya: token yangilash, 401 dan keyin qayta urinish
 * va so'rovlar orasidagi oraliq `amoGet` da allaqachon bor. Ularni
 * nusxalash ikki xil xulq demak — birinchisi tuzatilsa ikkinchisi
 * eskirib qoladi.
 *
 * 429 bu yerda QAYTA URINILMAYDI: yozuv so'rovini takrorlash ikki
 * marta yozib qo'yish xavfini tug'diradi. Xato yuqoriga chiqadi.
 */
export async function amoPost<T = unknown>(
  workspaceId: string,
  path: string,
  body: unknown
): Promise<T> {
  const ws = await loadAmoWorkspace(workspaceId);
  if (!ws.amocrm_domain || !ws.amocrm_access_token) {
    throw new Error('AmoCRM is not connected');
  }

  const qoldi = await sovishHolati(workspaceId);
  if (qoldi > 0) {
    throw Object.assign(
      new Error(
        `amoCRM so'rov limiti: ${Math.ceil(qoldi / 60)} daqiqadan keyin qayta urinib ko'ring`
      ),
      { status: 429 }
    );
  }
  await oraliqniKut(ws.amocrm_domain);

  const url = `https://${ws.amocrm_domain}${path}`;
  let token = decrypt(ws.amocrm_access_token);

  if (expiringSoon(ws.amocrm_token_expires_at)) {
    try {
      token = await refreshAccessToken(workspaceId);
    } catch (err) {
      console.warn('amocrm proaktiv yangilash ishlamadi:', (err as Error).message);
    }
  }

  try {
    const res = await axios.post<T>(url, body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    void sovishniTozala(workspaceId);
    return res.data;
  } catch (e) {
    const err = e as AxiosError;
    if (err.response?.status === 401) {
      token = await refreshAccessToken(workspaceId);
      const res = await axios.post<T>(url, body, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      return res.data;
    }
    throw err;
  }
}

/**
 * Ixtiyoriy amoCRM yo'liga GET. Token yangilash, 401 dan keyin qayta
 * urinish — hammasi amoGet ichida, ya'ni import ham xuddi shu yo'ldan
 * yuradi va ikkinchi nusxa mantiq paydo bo'lmaydi.
 */
export async function amoGetPath<T = unknown>(
  workspaceId: string,
  path: string
): Promise<T> {
  return amoGet<T>(workspaceId, path);
}

// ---------- data methods ----------

interface AmoCustomFieldValue {
  field_id?: number;
  field_name?: string;
  field_code?: string;
  field_type?: string;
  values?: Array<{ value?: string }>;
}
interface AmoContact {
  id: number;
  custom_fields_values?: AmoCustomFieldValue[] | null;
}

export interface ContactInfo {
  phone: string | null;
  email: string | null;
}

export async function getContact(
  workspaceId: string,
  contactId: number | string
): Promise<ContactInfo> {
  const data = await amoGet<AmoContact>(workspaceId, `/api/v4/contacts/${contactId}`);
  const fields = data.custom_fields_values ?? [];
  const find = (code: string) =>
    fields.find((f) => f.field_code === code)?.values?.[0]?.value ?? null;
  return { phone: find('PHONE'), email: find('EMAIL') };
}

interface AmoLead {
  id: number;
  /** Ba'zi integratsiyalar Meta Lead ID ni lid NOMIGA yozadi. */
  name?: string;
  price?: number;
  status_id?: number;
  pipeline_id?: number;
  created_at?: number;
  /** UTM shu yerda keladi — atribusiya zanjirining kaliti (§5). */
  custom_fields_values?: AmoCustomFieldValue[] | null;
  _embedded?: { contacts?: Array<{ id: number }>; tags?: Array<{ name?: string }> };
}

export async function getLead(workspaceId: string, leadId: number | string): Promise<AmoLead> {
  return amoGet<AmoLead>(workspaceId, `/api/v4/leads/${leadId}?with=contacts`);
}

interface AmoPipelineStatus {
  id: number;
  name: string;
  type: number;
}
interface AmoPipeline {
  id: number;
  name: string;
  _embedded?: { statuses?: AmoPipelineStatus[] };
}

export async function getPipelines(workspaceId: string): Promise<AmoPipeline[]> {
  const data = await amoGet<{ _embedded?: { pipelines?: AmoPipeline[] } }>(
    workspaceId,
    '/api/v4/leads/pipelines'
  );
  return data._embedded?.pipelines ?? [];
}
