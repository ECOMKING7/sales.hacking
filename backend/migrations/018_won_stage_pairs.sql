-- 018: "sotuv" va "sifatli lid" — voronka+etap JUFTLIKLARI ro'yxati
--
-- MUAMMO
-- Ilgari sxemada bitta amocrm_pipeline_id + bitta amocrm_won_stage_id edi.
-- Bu bitta voronkali akkauntda ishlaydi, lekin ko'p mijozda voronka
-- ikki-uch bosqichli: kvalifikatsiya -> sotuv -> qayta sotuv.
--
-- Furninglass misolida (60 kunlik real ma'lumot):
--   guli / sotib oldi            -> 14 bitim, 232 500 000 so'm
--   Kvalifikatsiya / sotuvga o'tk -> 1 bitim,    5 800 000 so'm
-- Sozlama Kvalifikatsiya voronkasiga qadalgani uchun tizim daromadning
-- faqat 2.4% ini ko'rardi. ROAS 40 barobar past chiqib, ishlayotgan
-- reklama "zarar keltiryapti" deb ko'rinardi.
--
-- NEGA "hamma voronka + 142" YECHIM EMAS
-- amoCRM'da 142 = yutildi, 143 = yutqazildi — bu universal va HAR
-- voronkada bor. Ya'ni voronkani bo'sh qoldirib 142 ni tanlash
-- "Sotib olganlar / otzif olindi" (142) etapini ham sotuv deb
-- hisoblaydi — u esa otziv olingani, sotuv emas.
-- Shuning uchun voronkani ham, etapni ham birga saqlaymiz.
--
-- FORMAT
-- Har element: '<pipeline_id>:<status_id>' matni, masalan '10742882:142'.
-- Ikkita alohida massiv emas — juftlik bitta matnda, chunki
-- Postgres'da juftliklar massivi murakkablashadi va bu qiymat
-- faqat tenglik bo'yicha tekshiriladi.
--
-- §3.5: ID lar TAXMIN QILINMAYDI. Foydalanuvchi amoCRM API bergan
-- ro'yxatdan tanlaydi; bu migratsiya faqat joy ochadi.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_won_pairs TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_qualified_pairs TEXT[] NOT NULL DEFAULT '{}';

-- Mavjud sozlamani yangi shaklga ko'chiramiz, ma'lumot yo'qolmasin.
-- Faqat bo'sh bo'lganini to'ldiradi — takror ishga tushirilsa zarar yo'q.
UPDATE workspaces
   SET amocrm_won_pairs = ARRAY[amocrm_pipeline_id || ':' || amocrm_won_stage_id]
 WHERE amocrm_won_pairs = '{}'
   AND amocrm_pipeline_id IS NOT NULL
   AND amocrm_won_stage_id IS NOT NULL;

-- 017 dagi bitta-voronkali sifatli etaplar ham juftlikka aylanadi.
UPDATE workspaces
   SET amocrm_qualified_pairs = (
         SELECT ARRAY_AGG(amocrm_pipeline_id || ':' || s)
           FROM UNNEST(amocrm_qualified_stage_ids) AS s
       )
 WHERE amocrm_qualified_pairs = '{}'
   AND amocrm_pipeline_id IS NOT NULL
   AND COALESCE(ARRAY_LENGTH(amocrm_qualified_stage_ids, 1), 0) > 0;

-- Eski ustunlar O'CHIRILMAYDI: ular hali ham "asosiy voronka" sifatida
-- ishlatiladi (hisobotda standart filtr) va orqaga moslik uchun kerak.
-- Yozuv mantiqi endi juftliklarga tayanadi.

COMMENT ON COLUMN workspaces.amocrm_won_pairs IS
  'Sotuv hisoblanadigan (voronka:etap) juftliklari, masalan {10742882:142}';
COMMENT ON COLUMN workspaces.amocrm_qualified_pairs IS
  'Sifatli lid hisoblanadigan (voronka:etap) juftliklari';
