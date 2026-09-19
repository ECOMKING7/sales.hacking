-- 035: KUNLIK metrikalar — sana tanlagich nihoyat ishlashi uchun
--
-- MUAMMO: `ads.spend`, `ads.impressions`, `ads.leads_count` — bitta ustun,
-- vaqt bo'yicha BO'LINMAGAN. Ular oxirgi sinxron nima yozgan bo'lsa o'shani
-- saqlaydi (`date_preset=maximum`, ya'ni butun tarix).
--
-- Oqibati: dashboarddagi sana tanlagich hech narsani o'zgartira olmaydi.
-- O'zgarishga JOY yo'q — jadvalda kun tushunchasi umuman mavjud emas.
-- Foydalanuvchi "12–20 avgust" ni tanlaydi, ekranda esa 3 yillik raqam
-- turaveradi. Bu jim xato: hech qanday ogohlantirish chiqmaydi.
--
-- YECHIM: har reklama × har kun = bitta qator. Facebook buni
-- `time_increment=1` bilan o'zi shunday qaytaradi.
--
-- HAJM: 1 623 reklama × 90 kun ≈ 146 000 qator. Bu Postgres uchun kichik.
-- Tarix qancha chuqur saqlanishi — sozlama, kod emas.
--
-- NEGA FAQAT REKLAMA DARAJASI: ad set va kampaniya raqamlari shu
-- jadvaldan YIG'ILADI. Uchta darajani alohida saqlash bir xil raqamni
-- uch joyda saqlash demak — ular albatta bir-biridan uzilib qoladi.
-- Bitta manba, uchta ko'rinish.

CREATE TABLE IF NOT EXISTS ad_insights_daily (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_id         UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,

  -- Facebook'ning o'z sanasi (date_start). Reklama akkauntining vaqt
  -- zonasida — biz uni o'zgartirmaymiz, aks holda Ads Manager bilan
  -- solishtirganda raqamlar bir kunga siljib ketadi.
  kun           DATE NOT NULL,

  spend         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  impressions   BIGINT         NOT NULL DEFAULT 0,
  clicks        BIGINT         NOT NULL DEFAULT 0,
  leads_count   BIGINT         NOT NULL DEFAULT 0,

  -- FB'ning O'ZI aytgan sotuv va daromad (piksel/CAPI orqali).
  -- ⚠ Bu CRM daromadi EMAS. CRM tomoni `leads` jadvalidan, `won_at`
  -- bo'yicha o'qiladi — ikkalasini aralashtirish migratsiya 016 da
  -- tuzatilgan xatoning qaytishi bo'lardi.
  fb_purchases  BIGINT         NOT NULL DEFAULT 0,
  fb_revenue    NUMERIC(14, 2) NOT NULL DEFAULT 0,

  yangilandi    TIMESTAMPTZ    NOT NULL DEFAULT now(),

  PRIMARY KEY (workspace_id, ad_id, kun)
);

COMMENT ON TABLE ad_insights_daily IS
  'Reklama x kun kesimidagi FB metrikalari. Sana tanlagich shu jadvaldan o''qiydi. Ad set va kampaniya raqamlari bu yerdan yig''iladi.';

COMMENT ON COLUMN ad_insights_daily.kun IS
  'Facebook date_start. Ad akkaunt vaqt zonasida — ataylab o''zgartirilmaydi.';

-- Asosiy so'rov naqshi: "shu workspace, shu oraliq" → keyin guruhlash.
CREATE INDEX IF NOT EXISTS idx_aid_workspace_kun
  ON ad_insights_daily (workspace_id, kun);

-- Bitta reklamaning tarixi (drill-down va grafik uchun).
CREATE INDEX IF NOT EXISTS idx_aid_ad_kun
  ON ad_insights_daily (ad_id, kun);

-- Kunlik tarix qayergacha to'ldirilgani. NULL — hali hech qachon.
-- Bu ustun bo'lmasa "ma'lumot yo'q" va "hali yuklanmagan" farqlanmaydi,
-- va ekranda nol ko'rsatib qo'yardik — yana jim xato.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS daily_backfill_start DATE;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS daily_backfill_end DATE;

COMMENT ON COLUMN workspaces.daily_backfill_start IS
  'Kunlik jadval shu sanadan boshlab to''ldirilgan. NULL — to''ldirilmagan, sana tanlagich ishlamaydi.';
