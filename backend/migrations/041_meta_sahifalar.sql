-- ═══════════════════════════════════════════════════════════════════════
-- META SAHIFALARI — Lead Ads'ni "bitta tugma" bilan ulash
--
-- ILGARI. Lead ID → reklama bog'lanishi uchun mijoz Business Manager'da
-- System User yaratib, tokenni qo'lda kiritardi (037). 6–8 qadam;
-- texnik bo'lmagan mijozning ko'pi shu yerda to'xtardi.
--
-- HOZIR. "Connect Facebook" ruxsat oynasida mijoz sahifalarini tanlaydi
-- (leads_retrieval + pages_*). Callback'da `/me/accounts` dan har sahifa
-- tokeni olinadi va shu jadvalga SHIFRLANGAN holda yoziladi. Uzoq
-- muddatli foydalanuvchi tokenidan olingan sahifa tokeni muddatsiz.
--
-- Token foydalanuvchiga bog'langan (users.fb_access_token kabi): bitta
-- odam bir nechta workspace'ga ega bo'lishi mumkin, sahifa esa bitta.
--
-- `leadgen_obuna` — sahifa bizning ilovaga `leadgen` webhook'i bilan
-- obuna qilinganmi (POST /{page}/subscribed_apps). Obuna bo'lmasa lid
-- faqat CRM'dagi Lead ID orqali yechiladi — webhook kelmaydi.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fb_pages (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id        TEXT NOT NULL,
  nom            TEXT,
  page_token     TEXT NOT NULL,           -- AES shifrlangan (utils/encryption)
  leadgen_obuna  BOOLEAN NOT NULL DEFAULT false,
  obuna_xato     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_id)
);

CREATE INDEX IF NOT EXISTS fb_pages_page ON fb_pages (page_id);

COMMENT ON COLUMN fb_pages.page_token IS
  'Sahifa tokeni (AES shifrlangan). leads_retrieval bilan lidni o''qish va leadgen obunasi uchun.';

-- Webhook orqali kelgan lid: telefon/email HASH'i (xom PII saqlanmaydi).
-- CRM integratsiyasi Lead ID'ni yozmasa ham lidni reklamaga bog'lash
-- uchun — attributionEngine telefon hash'i bo'yicha qidiradi.
ALTER TABLE fb_lead_ads
  ADD COLUMN IF NOT EXISTS fb_page_id      TEXT,
  ADD COLUMN IF NOT EXISTS phone_hash      TEXT,
  ADD COLUMN IF NOT EXISTS email_hash      TEXT,
  ADD COLUMN IF NOT EXISTS lid_vaqti       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manba           TEXT;   -- 'webhook' | 'sorov'

CREATE INDEX IF NOT EXISTS fb_lead_ads_phone
  ON fb_lead_ads (workspace_id, phone_hash) WHERE phone_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS fb_lead_ads_email
  ON fb_lead_ads (workspace_id, email_hash) WHERE email_hash IS NOT NULL;
