-- ═══════════════════════════════════════════════════════════════════════
-- LEAD ADS TOKENI — "bu lid qaysi reklamadan?" savolini so'rash uchun
--
-- MUAMMO. Instant Form orqali kelgan lidda UTM ham, fbclid ham, piksel
-- ham yo'q — odam saytga umuman o'tmaydi. Qoladigan yagona iz: Meta
-- Lead ID (bizda 98% to'lgan, amoCRM lid nomidan o'qiladi).
--
-- Lead ID reklamani AYTMAYDI. Uni Meta'dan so'rash kerak:
--   GET /{leadgen_id}?fields=ad_id,form_id
--
-- Bu chaqiruv `ads_management` + sahifa huquqlarini talab qiladi.
-- OAuth orqali olinadigan tokenimizda esa faqat `ads_read` bor
-- (App Review hali topshirilmagan).
--
-- YECHIM. Mijoz o'z Business Manager'ida System User tokeni yaratadi
-- va shu yerga kiritadi. O'z aktiviga murojaat qilgani uchun App
-- Review kerak emas.
--
-- Bu OAuth tokeni O'RNINI BOSMAYDI — yonida turadi:
--   fb_access_token (users)  → reklama statistikasi, `ads_read`
--   fb_lead_token   (bu yer) → lid → reklama bog'lanishi
-- Bo'sh bo'lsa OAuth tokeni bilan urinib ko'riladi va xato bo'lsa
-- LOG'ga yoziladi, jim o'tmaydi.
--
-- ⚠ Token SHIFRLANGAN holda saqlanadi (utils/encryption), xuddi
-- boshqa tokenlar kabi. Kodda hech qachon ochiq turmaydi (§4.1).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS fb_lead_token TEXT;

COMMENT ON COLUMN workspaces.fb_lead_token IS
  'Lead Ads uchun System User tokeni (AES shifrlangan). ads_management + sahifa huquqlari. Bo''sh bo''lsa OAuth tokeni ishlatiladi.';

-- Lead ID -> reklama xaritasi. Meta'dan bir marta so'raladi va saqlanadi:
-- bir xil lid uchun qayta so'rov yubormaslik uchun (rate limit) va
-- Meta 90 kundan keyin lidni o'chirsa ham bog'lanish qolishi uchun.
CREATE TABLE IF NOT EXISTS fb_lead_ads (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fb_lead_id    TEXT NOT NULL,
  fb_ad_id      TEXT,
  fb_form_id    TEXT,
  -- 'ok' | 'error'. Xato ham saqlanadi: aks holda har sync'da
  -- o'sha ishlamaydigan lid qayta-qayta so'raladi.
  holat         TEXT NOT NULL DEFAULT 'ok',
  xato          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, fb_lead_id)
);

CREATE INDEX IF NOT EXISTS fb_lead_ads_ad
  ON fb_lead_ads (workspace_id, fb_ad_id);
