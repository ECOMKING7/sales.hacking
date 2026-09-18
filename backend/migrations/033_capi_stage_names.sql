-- 033: CAPI hodisa nomlari — bitta mijozning voronkasi sukut bo'lib qolmasin
--
-- MUAMMO: sifatli lid uchun sukut `Schedule` edi. Bu Facebook'ning
-- standart hodisasi va u aniq ma'no beradi: "uchrashuv belgilandi".
-- Birinchi mijozda («uchrashuv belgilandi» etapi bor) u tasodifan
-- mos tushdi va shu sabab sukutga aylanib qoldi. Klinikada u
-- "qabulga yozildi", do'konda esa umuman ma'nosiz.
--
-- Mahsulotda bosqich UCHTA va ular hamma mijozda bir xil:
--   lid       — CRM ga tushgan har qanday yozuv
--   sifatli   — sotuvchi vaqt sarflashga arziydigan holatga yetgan
--   sotuv     — pul kirdi
-- Mijoz faqat QAYSI ETAP qaysi bosqichga kirishini belgilaydi
-- (amocrm_lead_pairs / _qualified_pairs / _won_pairs). Meta ga
-- ketadigan NOM esa mahsulotning o'zinikidir, mijozning voronkasi emas.
--
-- Shuning uchun sifatli lid uchun o'z nomimiz: QualifiedLead.
-- U hech qanday biznesga noto'g'ri ma'no yuklamaydi.
--
-- ⚠ QualifiedLead standart emas, custom. Ya'ni Facebook unga
-- OPTIMALLASHISHI uchun Events Manager'da Custom Conversion yaratish
-- kerak. Bu ataylab: standart nom tanlab, ma'noni buzgandan ko'ra,
-- to'g'ri nom qo'yib bitta qo'shimcha qadamni aytgan ma'qul.
-- Meta ning CRM hujjati ham aynan shuni kutadi: "event_name" o'rniga
-- o'z voronka bosqichingiz nomi.

UPDATE workspaces
   SET capi_event_qualified = 'QualifiedLead'
 WHERE (capi_event_qualified IS NULL OR capi_event_qualified = 'Schedule')
   AND COALESCE(meta_capi_enabled, false) = false;

COMMENT ON COLUMN workspaces.capi_event_qualified IS
  'Meta hodisa nomi (sifatli lid). Sukut QualifiedLead — custom, Custom Conversion talab qiladi.';
