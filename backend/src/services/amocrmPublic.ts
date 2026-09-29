import { pool } from '../db/pool';

/* ─────────────────────────────────────────────────────────────
   amoMarket'dagi OMMAVIY integratsiya (McQueen AI).

   Uch xil kalit manbasi bor va ular aralashmasligi kerak:

   1) "private" — mijoz o'z CRM'ida yaratgan xususiy integratsiya.
      Kalitlar workspace'da (019-migratsiya). Redirect: AMOCRM_REDIRECT_URI.
   2) "legacy"  — .env dagi AMOCRM_CLIENT_ID/SECRET. Hozir furninglass
      shu bilan ulangan. Redirect: AMOCRM_REDIRECT_URI. TEGILMAYDI.
   3) "public"  — amoMarket integratsiyasi, AMOCRM_PUBLIC_* kalitlari.
      Redirect: AMOCRM_PUBLIC_REDIRECT_URI (api.mcqueen.uz).

   Qaysi kalit bilan token olingan bo'lsa, yangilash ham AYNAN o'sha
   kalit va o'sha redirect bilan bo'lishi shart — aks holda amoCRM
   refresh'ni rad etadi va ulanish jimgina uziladi. Shuning uchun
   workspace'da `amocrm_oauth_client` ustuni saqlanadi:
     'public' → 3-manba;  NULL → eski xatti-harakat (1 yoki 2).
   ───────────────────────────────────────────────────────────── */

export type AmoClientKind = 'public' | 'private' | 'legacy';

export interface ResolvedAmoCreds {
  kind: AmoClientKind;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const DEFAULT_PUBLIC_REDIRECT = 'https://api.mcqueen.uz/api/auth/amocrm/callback';

/** Ommaviy integratsiya kalitlari. Sozlanmagan bo'lsa — null. */
export function publicCreds(): ResolvedAmoCreds | null {
  const clientId = process.env.AMOCRM_PUBLIC_CLIENT_ID?.trim();
  const clientSecret = process.env.AMOCRM_PUBLIC_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    kind: 'public',
    clientId,
    clientSecret,
    redirectUri: process.env.AMOCRM_PUBLIC_REDIRECT_URI?.trim() || DEFAULT_PUBLIC_REDIRECT,
  };
}

export function legacyRedirectUri(): string {
  const v = process.env.AMOCRM_REDIRECT_URI;
  if (!v) throw new Error('AMOCRM_REDIRECT_URI is not set');
  return v;
}

/* ─────────────────────────────────────────────────────────────
   Sxema — "dangasa" yaratiladi.

   Vercel deploy migratsiyani ishga tushirmaydi (DEPLOY-VERCEL.md),
   lokal terminaldan qo'lda yurgizish esa unutilishi oson. Ikkala
   buyruq ham idempotent (IF NOT EXISTS), shuning uchun har sovuq
   startda bir marta bajarish xavfsiz. Xuddi shu SQL
   migrations/040_amocrm_public_integration.sql da ham bor.
   ───────────────────────────────────────────────────────────── */

let schemaReady: Promise<void> | null = null;

/** Katalogdan o'qiydi (qulfsiz): ustun va jadval bormi. */
type Queryable = { query: typeof pool.query };

export async function amoPublicSchemaState(
  db: Queryable = pool
): Promise<{ col: boolean; tbl: boolean }> {
  const { rows } = await db.query<{ col: boolean; tbl: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'workspaces'
            AND column_name = 'amocrm_oauth_client'
       ) AS col,
       to_regclass('amocrm_pending_installs') IS NOT NULL AS tbl`
  );
  return { col: Boolean(rows[0]?.col), tbl: Boolean(rows[0]?.tbl) };
}

/**
 * Sxemani faqat YETISHMASA yaratadi. Faqat ommaviy integratsiya
 * yo'lida chaqiriladi — furninglass'ning eski yo'li bunga bog'liq emas.
 *
 *  • Avval katalogdan tekshiriladi: `ALTER TABLE ... IF NOT EXISTS` ham
 *    ustun bor bo'lsa-da jadvalga eksklyuziv qulf so'raydi.
 *  • `lock_timeout = 3s`: uzun tranzaksiya ortida navbatda turib,
 *    `workspaces` ga keladigan BARCHA so'rovlarni to'xtatib qo'ymasin.
 *  • Ikki server nusxasi bir vaqtda yaratsa, biri xato olishi mumkin —
 *    shunda qayta tekshiramiz: boshqasi yaratib bo'lgan bo'lsa, hammasi joyida.
 */
export function ensureAmoPublicSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const before = await amoPublicSchemaState();
      if (before.col && before.tbl) return;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query(
          `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS amocrm_oauth_client TEXT`
        );
        await client.query(
          `CREATE TABLE IF NOT EXISTS amocrm_pending_installs (
             id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
             domain         TEXT NOT NULL UNIQUE,
             access_token   TEXT NOT NULL,
             refresh_token  TEXT NOT NULL,
             expires_at     TIMESTAMPTZ NOT NULL,
             created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
           )`
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        // Shu ulanish orqali: serverless'da pool max=1, pool.query bu yerda
        // bo'sh ulanishni abadiy kutib qolardi.
        const after = await amoPublicSchemaState(client as unknown as Queryable);
        if (!(after.col && after.tbl)) throw err;
      } finally {
        client.release();
      }
    })().catch((err) => {
      // Keyingi chaqiruv qayta urinsin — xatoni keshlab qo'ymaymiz.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/** Postgres "ustun yo'q" xatosi — sxema hali yaratilmagan. */
export function isUndefinedColumn(err: unknown): boolean {
  return (err as { code?: string })?.code === '42703';
}

/** amoCRM `referer` qiymatini tekshiradi: faqat xxx.amocrm.ru / .com / kommo.com. */
export function validAmoDomain(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  return /^[a-z0-9-]+\.(amocrm\.(ru|com)|kommo\.com)$/.test(d) ? d : null;
}
