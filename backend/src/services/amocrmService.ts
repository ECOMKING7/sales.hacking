import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { encrypt, decrypt } from '../utils/encryption';
import { normalizePhoneE164 } from '../utils/phone';

const AUTH_BASE = 'https://www.amocrm.ru/oauth';

function clientId(): string {
  const v = process.env.AMOCRM_CLIENT_ID;
  if (!v) throw new Error('AMOCRM_CLIENT_ID is not set');
  return v;
}
function clientSecret(): string {
  const v = process.env.AMOCRM_CLIENT_SECRET;
  if (!v) throw new Error('AMOCRM_CLIENT_SECRET is not set');
  return v;
}
function redirectUri(): string {
  const v = process.env.AMOCRM_REDIRECT_URI;
  if (!v) throw new Error('AMOCRM_REDIRECT_URI is not set');
  return v;
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

export function generateAuthURL(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
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
  const res = await axios.post<TokenResponse>(`https://${domain}/oauth2/access_token`, {
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
  });

  await pool.query(
    `UPDATE workspaces
       SET amocrm_domain = $1,
           amocrm_access_token = $2,
           amocrm_refresh_token = $3,
           updated_at = now()
     WHERE id = $4`,
    [domain, encrypt(res.data.access_token), encrypt(res.data.refresh_token), workspaceId]
  );
}

interface AmoWorkspaceRow {
  amocrm_domain: string | null;
  amocrm_access_token: string | null;
  amocrm_refresh_token: string | null;
  amocrm_pipeline_id: string | null;
  amocrm_won_stage_id: string | null;
}

async function loadAmoWorkspace(workspaceId: string): Promise<AmoWorkspaceRow> {
  const res = await pool.query<AmoWorkspaceRow>(
    `SELECT amocrm_domain, amocrm_access_token, amocrm_refresh_token,
            amocrm_pipeline_id, amocrm_won_stage_id
       FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  if (!res.rows[0]) throw new Error('Workspace not found');
  return res.rows[0];
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
  const res = await axios.post<TokenResponse>(
    `https://${ws.amocrm_domain}/oauth2/access_token`,
    {
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'refresh_token',
      refresh_token: decrypt(ws.amocrm_refresh_token),
      redirect_uri: redirectUri(),
    }
  );

  await pool.query(
    `UPDATE workspaces
       SET amocrm_access_token = $1, amocrm_refresh_token = $2, updated_at = now()
     WHERE id = $3`,
    [encrypt(res.data.access_token), encrypt(res.data.refresh_token), workspaceId]
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
  const url = `https://${ws.amocrm_domain}${path}`;
  let token = decrypt(ws.amocrm_access_token);

  try {
    const res = await axios.get<T>(url, { headers: { Authorization: `Bearer ${token}` } });
    return res.data;
  } catch (e) {
    const err = e as AxiosError;
    if (err.response?.status === 401) {
      token = await refreshAccessToken(workspaceId);
      const res = await axios.get<T>(url, { headers: { Authorization: `Bearer ${token}` } });
      return res.data;
    }
    throw err;
  }
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
  price?: number;
  status_id?: number;
  pipeline_id?: number;
  created_at?: number;
  /** UTM shu yerda keladi — atribusiya zanjirining kaliti (§5). */
  custom_fields_values?: AmoCustomFieldValue[] | null;
  _embedded?: { contacts?: Array<{ id: number }> };
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
