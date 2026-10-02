import crypto from 'crypto';
import { pool } from '../db/pool';
import { amoGetPath } from './amocrmService';
import { decrypt } from '../utils/encryption';
import { publicCreds, amoPublicSchemaState } from './amocrmPublic';

/* ─────────────────────────────────────────────────────────────
   amoCRM "хук об отключении".

   Mijoz amoMarket'dagi McQueen AI integratsiyasini o'chirganda amoCRM
   kartadagi manzilga GET yuboradi: account_id, client_uuid (eski
   hujjatda client_id) va signature.

   Imzo (amoCRM hujjati, oauth/step-by-step):
     HMAC-SHA256( "<client_id>|<account_id>", client_secret )

   NEGA KERAK: amoCRM tokenni bekor qiladi, lekin bizga aytmaydi. Usiz
   workspace "ulangan" ko'rinib qolardi, sinxronizatsiya har 15 daqiqada
   o'lik token bilan xato berardi, shifrlangan token esa bazada keraksiz
   yotardi.

   NIMA QILADI: shu amoCRM akkauntiga tegishli TOKENLARNI o'chiradi.
   Sozlamalar (voronka, etaplar, maydonlar) va lidlar QOLADI — mijoz
   qayta ulasa hammasi joyida bo'ladi; ma'lumotni to'liq o'chirish
   alohida so'rov bilan (data-deletion) amalga oshiriladi.

   Hook faqat account_id yuboradi (domen yo'q). Akkaunt ikki yo'l bilan
   topiladi:
     1) `workspaces.amocrm_account_id` — ulanish paytida saqlanadi
        (tokendan yoki GET /api/v4/account dan);
     2) zaxira: access token JWT payload'idagi `account_id` (amoCRM
        hujjatida rasman kafolatlanmagan — shuning uchun faqat zaxira).
   ───────────────────────────────────────────────────────────── */

/** Toza funksiya — testlanadi. */
export function imzoTogrimi(
  clientId: string | undefined,
  accountId: string | undefined,
  signature: string | undefined,
  secret: string | undefined
): boolean {
  if (!clientId || !accountId || !signature || !secret) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const kutilgan = crypto
    .createHmac('sha256', secret)
    .update(`${clientId}|${accountId}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(kutilgan, 'hex'), Buffer.from(signature.toLowerCase(), 'hex'));
}

/** JWT payload'idan account_id. Imzo tekshirilmaydi — faqat moslash uchun. */
export function tokenAkkaunti(jwt: string | null | undefined): string | null {
  if (!jwt) return null;
  const qism = jwt.split('.')[1];
  if (!qism) return null;
  try {
    const p = JSON.parse(Buffer.from(qism.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const id = p?.account_id ?? p?.accountId;
    return id === undefined || id === null ? null : String(id);
  } catch {
    return null;
  }
}

let ustunTayyor: Promise<boolean> | null = null;

/** `amocrm_account_id` ustuni (043). Katalog avval tekshiriladi, DDL qisqa qulf bilan. */
export function ensureAmoAccountIdColumn(): Promise<boolean> {
  if (!ustunTayyor) {
    ustunTayyor = (async () => {
      const bor = async (db: { query: typeof pool.query }) =>
        (
          await db.query<{ bor: boolean }>(
            `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'workspaces'
                  AND column_name = 'amocrm_account_id') AS bor`
          )
        ).rows[0]?.bor === true;
      if (await bor(pool)) return true;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS amocrm_account_id TEXT`);
        await client.query('COMMIT');
        return true;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (await bor(client as unknown as { query: typeof pool.query })) return true;
        throw err;
      } finally {
        client.release();
      }
    })().catch((err) => {
      ustunTayyor = null;
      throw err;
    });
  }
  return ustunTayyor;
}

/**
 * Ulanishdan keyin chaqiriladi (FAIL-SOFT). Avval tokendan, bo'lmasa
 * amoCRM API'dan (GET /api/v4/account → id) akkaunt ID'sini saqlaydi.
 */
export async function akkauntIdniSaqla(workspaceId: string): Promise<string | null> {
  try {
    await ensureAmoAccountIdColumn();
    const { rows } = await pool.query<{ amocrm_access_token: string | null }>(
      `SELECT amocrm_access_token FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    let id = tokenAkkaunti(ochiq(rows[0]?.amocrm_access_token ?? null));
    if (!id) {
      const acc = await amoGetPath<{ id?: number | string }>(workspaceId, '/api/v4/account');
      id = acc?.id !== undefined && acc?.id !== null ? String(acc.id) : null;
    }
    if (id) {
      await pool.query(`UPDATE workspaces SET amocrm_account_id = $1 WHERE id = $2`, [id, workspaceId]);
    }
    return id;
  } catch (err) {
    console.warn('amocrm account_id saqlanmadi:', (err as Error).message);
    return null;
  }
}

function ochiq(shifr: string | null): string | null {
  if (!shifr) return null;
  try {
    return decrypt(shifr);
  } catch {
    return null;
  }
}

export interface UzishNatija {
  imzo: boolean;
  workspacelar: number;
  kutayotgan: number;
}

/**
 * Hook'ni qayta ishlaydi. Faqat OMMAVIY integratsiya (amoMarket) bilan
 * ulangan workspace'larga tegadi — legacy/xususiy ulanishlar bu hook'ni
 * olmaydi va ularga tegilmasligi kerak.
 */
export async function amoUzishniQaytaIshla(q: {
  account_id?: string;
  client_uuid?: string;
  client_id?: string;
  signature?: string;
}): Promise<UzishNatija> {
  const pub = publicCreds();
  const clientId = q.client_uuid || q.client_id;
  const accountId = q.account_id ? String(q.account_id) : undefined;

  const imzo =
    Boolean(pub) &&
    clientId === pub!.clientId &&
    imzoTogrimi(clientId, accountId, q.signature, pub!.clientSecret);
  if (!imzo || !accountId) return { imzo: false, workspacelar: 0, kutayotgan: 0 };

  const sxema = await amoPublicSchemaState();
  let workspacelar = 0;
  let kutayotgan = 0;

  if (sxema.col) {
    const ustun = await ensureAmoAccountIdColumn().catch(() => false);
    const { rows } = await pool.query<{
      id: string;
      amocrm_access_token: string | null;
      amocrm_account_id?: string | null;
    }>(
      `SELECT id, amocrm_access_token${ustun ? ', amocrm_account_id' : ''} FROM workspaces
        WHERE amocrm_oauth_client = 'public' AND amocrm_access_token IS NOT NULL`
    );
    // 1) saqlangan ustun; 2) zaxira — token ichidagi account_id.
    const mos = rows
      .filter((r) =>
        r.amocrm_account_id
          ? r.amocrm_account_id === accountId
          : tokenAkkaunti(ochiq(r.amocrm_access_token)) === accountId
      )
      .map((r) => r.id);
    if (mos.length) {
      const r = await pool.query(
        `UPDATE workspaces
            SET amocrm_access_token = NULL,
                amocrm_refresh_token = NULL,
                amocrm_token_expires_at = NULL,
                updated_at = now()
          WHERE id = ANY($1::uuid[])`,
        [mos]
      );
      workspacelar = r.rowCount ?? 0;
    }
  }

  if (sxema.tbl) {
    const { rows } = await pool.query<{ id: string; access_token: string }>(
      `SELECT id, access_token FROM amocrm_pending_installs`
    );
    const mos = rows
      .filter((r) => tokenAkkaunti(ochiq(r.access_token) ?? r.access_token) === accountId)
      .map((r) => r.id);
    if (mos.length) {
      const r = await pool.query(`DELETE FROM amocrm_pending_installs WHERE id = ANY($1::uuid[])`, [mos]);
      kutayotgan = r.rowCount ?? 0;
    }
  }

  return { imzo: true, workspacelar, kutayotgan };
}
