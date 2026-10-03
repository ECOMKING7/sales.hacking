import { pool } from '../../db/pool';

/* Billing sxemasi — migrations/044_billing.sql bilan BIR XIL.
   Serverless'da migratsiya qo'lda ishlamasligi mumkin, shuning uchun
   birinchi billing chaqiruvida sxema shu yerdan yaratiladi:
   avval katalog tekshiriladi (bor bo'lsa — hech narsa qilinmaydi),
   yo'q bo'lsa — qisqa qulf bilan bitta tranzaksiyada yaratiladi. */
export const BILLING_SXEMA = `
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_plan TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_consent_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_fail_count INT NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_next_attempt_at TIMESTAMPTZ;
-- Mijoz rozilik bergan summa. Narx env'da o'zgarsa ham eski obunachilardan
-- shu summa yechiladi — rozilik berilmagan summani yechish mumkin emas.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_amount_uzs BIGINT;

CREATE TABLE IF NOT EXISTS billing_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('payme', 'click')),
  token_enc     TEXT NOT NULL,
  masked        TEXT,
  phone_masked  TEXT,
  verified      BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT true,
  verify_attempts INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_cards_bitta_faol
  ON billing_cards (workspace_id) WHERE active;

CREATE TABLE IF NOT EXISTS billing_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  card_id       UUID REFERENCES billing_cards(id) ON DELETE SET NULL,
  provider      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('initial', 'renewal')),
  plan          TEXT NOT NULL,
  amount_uzs    BIGINT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'unknown')),
  provider_ref  TEXT,
  error         TEXT,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ
);
-- Bir davr uchun ikki marta yechmaslik kafolati: muvaffaqiyatsiz urinishdan
-- tashqari har qanday yozuv shu davrni "band" qiladi.
CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_davr_bir_marta
  ON billing_payments (workspace_id, period_start) WHERE status <> 'failed';
-- Bir vaqtda faqat BITTA tugallanmagan to'lov: 202 dan keyin qayta bosish,
-- ikkinchi tab yoki cron + qo'lda to'lov ikki marta yecha olmasin.
CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_bitta_jarayon
  ON billing_payments (workspace_id) WHERE status IN ('pending', 'unknown');
CREATE INDEX IF NOT EXISTS billing_payments_ws ON billing_payments (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_notices (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, kind, period_end)
);
`;

const TEKSHIR = `SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'workspaces'
             AND column_name = 'billing_amount_uzs') AS col,
  to_regclass('billing_notices') IS NOT NULL AS tbl`;

type Q = { query: typeof pool.query };
async function tayyormi(db: Q): Promise<boolean> {
  const { rows } = await db.query<{ col: boolean; tbl: boolean }>(TEKSHIR);
  return Boolean(rows[0]?.col && rows[0]?.tbl);
}

let tayyor: Promise<void> | null = null;

export function billingSxemasiniTaminla(): Promise<void> {
  if (!tayyor) {
    tayyor = (async () => {
      if (await tayyormi(pool)) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query(BILLING_SXEMA);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (!(await tayyormi(client as unknown as Q))) throw err;
      } finally {
        client.release();
      }
    })().catch((err) => {
      tayyor = null;
      throw err;
    });
  }
  return tayyor;
}
