-- 015_add_utm_attribution.sql
--
-- ZANJIRNI YOPISH.
--
-- Muammo: reklama va lid o'rtasidagi bog'lanish hech qachon tuzilmasdi.
--   • Sayt pikseli touchpoint yozadi, lekin lid hali CRM'da yo'q → lead_id NULL
--   • recordTouchpoint fbclid bo'yicha qidiradi, lekin sharti
--     `AND lead_id IS NOT NULL` — ya'ni ALLAQACHON bog'langanini qidiradi.
--     Birinchisi hech qachon bog'lanmaydi. Aylanma.
--   • Yetim touchpoint'ni keyin bog'laydigan kod umuman yo'q edi
--   • processLeadAttribution 0 ta touchpoint topadi → reklamaga daromad yozilmaydi
--
-- Yo'riqnoma §5 bog'lanish kalitini UTM deb belgilagan, lekin backendda
-- `utm` so'zi bitta joyda ham yo'q edi. Bu migratsiya shuni to'g'irlaydi.
--
-- Ikkita mustaqil yo'l bo'ladi (biri ishlamasa ikkinchisi qoladi):
--   1) UTM: leads.utm_term  ↔  ads.name       — asosiy (§5)
--   2) fbclid: leads.fbclid ↔  touchpoints    — zaxira, piksel ishlagan holatda

-- ---------- UTM leads jadvalida ----------
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source   TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium   TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term     TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fbclid       TEXT;

-- Lid qaysi yo'l bilan reklamaga bog'langani. Diagnostika uchun:
-- tafovut chiqqanda "qaysi usul ishlamayapti" degan savolga javob beradi.
--   'utm'      — utm_term ad nomiga mos keldi
--   'fbclid'   — touchpoint zanjiri orqali
--   'contact'  — telefon/email hash orqali
--   NULL       — bog'lanmadi (atribusiyasiz lid)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS match_method TEXT;

-- ---------- bog'lanish kaliti konfiguratsiyada ----------
-- Yo'riqnoma §3.1: kodda qotirilmaydi. Standart — utm_term (= ad nomi),
-- lekin mijoz UTM'ni boshqacha joylashtirsa o'zgartiriladi.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS attribution_key TEXT NOT NULL DEFAULT 'utm_term';

-- ---------- indekslar ----------
-- fbclid bo'yicha touchpoint qidirish — recordTouchpoint va yetimlarni
-- bog'lash shu indeksga tayanadi. Ilgari yo'q edi: har chaqiruv seq scan.
CREATE INDEX IF NOT EXISTS idx_touchpoints_fbclid
  ON touchpoints (workspace_id, fbclid) WHERE fbclid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_fbclid
  ON leads (workspace_id, fbclid) WHERE fbclid IS NOT NULL;

-- Nomni solishtirishdan oldin normalizatsiya qilinadi (§5: trim + lowercase).
-- Ifoda indeksi bo'lmasa har lid uchun butun ads jadvali skanerlanadi.
CREATE INDEX IF NOT EXISTS idx_ads_name_normalized
  ON ads (workspace_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_adsets_name_normalized
  ON adsets (workspace_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_campaigns_name_normalized
  ON campaigns (workspace_id, lower(btrim(name)));
