-- 026: amoCRM so'rov limiti — sovish vaqti
--
-- HODISA: 15.09 da mijozning amoCRM akkaunti "API so'rovlari limitidan
-- oshdi" degan sabab bilan bloklandi. O'sha akkauntga to'rtta
-- integratsiya ulangan, biz beshinchisimiz. Bizda Facebook uchun
-- limit hisobi bor edi, amoCRM uchun — umuman yo'q.
--
-- amoCRM 429 qaytarganda ikkita narsa kerak:
--   1. Darhol to'xtash (qayta urinish limitni yanada uzaytiradi)
--   2. Boshqa nusxalar ham to'xtashi — serverless'da xotira umumiy emas
--
-- Shuning uchun sovish vaqti BAZADA saqlanadi: 429 kelgan zahoti
-- yoziladi, har so'rovdan oldin tekshiriladi. Bitta funksiya nusxasi
-- limitni ko'rsa, qolganlari ham to'xtaydi.
--
-- NULL yoki o'tgan vaqt — cheklov yo'q, oddiy ish.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_cooldown_until TIMESTAMPTZ;

COMMENT ON COLUMN workspaces.amocrm_cooldown_until IS
  'amoCRM 429 qaytargan bo''lsa — shu vaqtgacha so''rov yuborilmaydi. NULL: cheklov yo''q.';
