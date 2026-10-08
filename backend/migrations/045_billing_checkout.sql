-- 045_billing_checkout.sql
-- Bir martalik to'lov: Payme checkout (havola / QR) + Merchant API callback'lari.
--
-- ⚠ Bu SQL src/services/billing/sxema.ts dagi BILLING_CHECKOUT_SXEMA bilan
--   BIR XIL. Birini o'zgartirsangiz — ikkinchisini ham.
--
-- Avto-obunadan farqi: karta tokeni YO'Q. Mijoz Payme sahifasida/ilovasida
-- o'zi to'laydi, Payme bizning serverga JSON-RPC bilan xabar beradi
-- (CheckPerformTransaction → CreateTransaction → PerformTransaction).
-- Har oy qaytadan to'lanadi — muddat avtomatik uzaytirilmaydi.

-- billing_payments.kind ga 'onetime' qo'shiladi.
ALTER TABLE billing_payments DROP CONSTRAINT IF EXISTS billing_payments_kind_check;
ALTER TABLE billing_payments ADD CONSTRAINT billing_payments_kind_check
  CHECK (kind IN ('initial', 'renewal', 'onetime'));

-- Buyurtma: "Pro, 1 oy, 400 000 so'm" — mijoz checkout'ni ochganda yaratiladi.
-- Summa shu yerda QOTADI: Payme boshqa summa yuborsa — rad (-31001).
CREATE TABLE IF NOT EXISTS billing_checkout (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('payme', 'click')),
  plan          TEXT NOT NULL,
  amount_uzs    BIGINT NOT NULL CHECK (amount_uzs > 0),
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'paid', 'expired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS billing_checkout_ws ON billing_checkout (workspace_id, created_at DESC);

-- Payme Merchant API tranzaksiyalari. Vaqtlar Payme protokolidagidek —
-- millisekund (BIGINT), 0 = hali bo'lmagan.
-- state: 1 = yaratildi, 2 = to'landi, -1 = to'lovsiz bekor, -2 = to'lovdan keyin bekor.
CREATE TABLE IF NOT EXISTS payme_transactions (
  payme_id      TEXT PRIMARY KEY,
  checkout_id   UUID NOT NULL REFERENCES billing_checkout(id) ON DELETE CASCADE,
  amount_tiyin  BIGINT NOT NULL,
  payme_time    BIGINT NOT NULL,
  create_time   BIGINT NOT NULL,
  perform_time  BIGINT NOT NULL DEFAULT 0,
  cancel_time   BIGINT NOT NULL DEFAULT 0,
  state         SMALLINT NOT NULL CHECK (state IN (1, 2, -1, -2)),
  reason        SMALLINT,
  -- CreateTransaction'da shu workspace uchun 'pending' billing_payments yozuvi
  -- ochiladi. U billing_payments_bitta_jarayon indeksini band qiladi: karta
  -- yechimi (cron) va checkout bir vaqtda bitta davrni ikki marta to'latolmaydi.
  payment_id    UUID REFERENCES billing_payments(id) ON DELETE SET NULL,
  -- SetFiscalData: {"PERFORM": {...}, "CANCEL": {...}}
  fiscal        JSONB
);
-- Bitta buyurtmada bir vaqtda faqat BITTA tirik tranzaksiya (kutilayotgan
-- yoki to'langan). Ikkinchisi -31052 bilan rad etiladi; bu indeks — oxirgi to'siq.
CREATE UNIQUE INDEX IF NOT EXISTS payme_tx_buyurtmada_bitta
  ON payme_transactions (checkout_id) WHERE state IN (1, 2);
CREATE INDEX IF NOT EXISTS payme_tx_vaqt ON payme_transactions (payme_time);
