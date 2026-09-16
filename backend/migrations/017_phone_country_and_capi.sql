-- 017: telefon mamlakat kodi + Meta Conversions API sozlamalari
--
-- §3.1: kodda BIRORTA domen, ID yoki mamlakat kodi qotirilmaydi.
-- Har workspace o'z qiymatini oladi; standart '998' (O'zbekiston).
--
-- Meta CAPI: dataset (piksel) ID ochiq ma'lumot, shuning uchun oddiy
-- ustunda. TOKEN bu yerda SAQLANMAYDI — u .env / Vercel secret da
-- (META_CAPI_TOKEN__<KEY>), §4.1.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS phone_country_code TEXT NOT NULL DEFAULT '998';

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS meta_dataset_id TEXT;

-- Purchase hodisasining valyutasi. §3.3 config'dagi "valyuta" ga mos.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'UZS';

-- §3.3 "etaplar.sifatli": qaysi etapga yetgan lid SIFATLI hisoblanadi.
--
-- Bu ustun bo'lmagani uchun leads.qualified_at faqat demo skriptda to'lardi —
-- real lidda hech qachon. Ya'ni CQL, qualRate va closeRate real ma'lumotda
-- doim 0 chiqardi. Endi webhook shu ro'yxatga qarab qualified_at ni yozadi.
--
-- ID lar TAXMIN QILINMAYDI (§3.5) — foydalanuvchi ro'yxatdan tanlaydi.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_qualified_stage_ids TEXT[] NOT NULL DEFAULT '{}';

-- CAPI hodisalari yuborilsinmi. Standart: yo'q — mijoz o'zi yoqadi.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS meta_capi_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Secret kaliti: .env dagi qo'shimchani topish uchun (masalan 'FURNINGLASS'
-- bo'lsa, META_CAPI_TOKEN__FURNINGLASS o'qiladi). Bo'sh bo'lsa umumiy
-- META_CAPI_TOKEN ishlatiladi.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS secret_key TEXT;

-- Yuborilgan CAPI hodisalari — dedup va diagnostika uchun.
-- Meta 48 soat ichida bir xil (event_id, event_name) ni bitta deb hisoblaydi;
-- biz o'zimiz ham takror yubormaslik uchun shu jadvalni tekshiramiz.
CREATE TABLE IF NOT EXISTS capi_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE,
  event_name    TEXT NOT NULL,
  event_id      TEXT NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL,            -- 'pending' | 'ok' | 'error'
  match_keys    TEXT,                     -- qaysi kalitlar bor edi: 'fbc,ph'
  error         TEXT
);

-- Bitta hodisa bir marta yuboriladi.
CREATE UNIQUE INDEX IF NOT EXISTS capi_events_unique
  ON capi_events (workspace_id, event_id, event_name);

CREATE INDEX IF NOT EXISTS capi_events_lead
  ON capi_events (workspace_id, lead_id);
