-- 022: reklama akkaunti valyutasi — ROAS'ni yolg'on hisoblamaslik uchun
--
-- MUAMMO (real ma'lumotda topildi)
-- Facebook reklama akkauntlari USD da, amoCRM bitimlari UZS da:
--   guli / sotib oldi -> 14 bitim, 232 500 000 so'm
--   FB xarajati       -> dollarda
-- Kod esa shunday hisoblardi:
--   roas = revenue / spend     ya'ni SO'MNI DOLLARGA bo'lardi
-- Natija ~12 600 barobar shishgan. Voronka endpointi 6558x qaytardi.
--
-- Haqiqiy hisob: 232.5 mln so'm ~ 18 400 USD. Xarajat 800 USD bo'lsa
-- real ROAS ~23x. Bizning formula 290 000x chiqarardi.
--
-- NEGA "TO'XTATISH" TANLANDI, "TAXMINIY KURS" EMAS
-- Noto'g'ri raqam yo'q raqamdan battar: 6558x ko'rgan operator
-- byudjetni oshiradi. Raqam yo'q bo'lsa — hech bo'lmasa tekshiradi.
-- Bu mahsulotning o'z qoidasiga mos: ikki reklama bir xil nomda
-- bo'lsa ham taxmin qilmaymiz, "noaniq" deb belgilaymiz.
--
-- Kunlik kurs qatlami keyingi qadam. Statik kurs yaramaydi: 232 mln
-- so'mlik oborotda 5% kurs farqi ~900 USD ni yo'qotadi.

-- Reklama akkauntining valyutasi (FB API `currency` maydonidan).
-- Workspace'ning `currency` ustuni esa CRM daromadi valyutasi (019/017).
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS fb_currency TEXT;

COMMENT ON COLUMN workspaces.fb_currency IS
  'Facebook reklama akkaunti valyutasi. workspaces.currency dan farq qilsa ROAS hisoblanmaydi.';
