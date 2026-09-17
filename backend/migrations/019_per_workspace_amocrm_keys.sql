-- 019: har mijozning o'z amoCRM kalitlari
--
-- MUAMMO
-- AMOCRM_CLIENT_ID / AMOCRM_CLIENT_SECRET umumiy .env da edi. Bu bitta
-- integratsiya uchun to'g'ri, lekin amoCRM xususiy integratsiyani faqat
-- yaratilgan akkauntda ishlatishga ruxsat beradi. Ya'ni ikkinchi mijoz
-- o'z CRM'ida o'z integratsiyasini yaratadi va uning client_id/secret'i
-- BOSHQA bo'ladi. Umumiy env bilan ikkinchi mijozni ulash imkonsiz.
--
-- amoMarket'ga chiqqanda (ommaviy integratsiya) bitta client_id hamma
-- mijoz uchun ishlaydi — shuning uchun env fallback SAQLANADI:
--   workspace'da kalit bor  -> o'shani ishlat  (xususiy integratsiya)
--   yo'q                    -> .env dan ol     (ommaviy integratsiya)
--
-- XAVFSIZLIK (§4.1)
-- client_secret shifrlangan holda saqlanadi (utils/encryption.ts, AES-256).
-- API uni hech qachon qaytarmaydi — faqat "bor/yo'q" holatini.
-- client_id maxfiy emas (OAuth'da ochiq yuboriladi), shifrlanmaydi.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_client_id TEXT;

-- Shifrlangan. Format: "<iv-hex>:<ciphertext-hex>".
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_client_secret TEXT;

-- Har mijozga alohida webhook siri.
--
-- Ilgari AMOCRM_WEBHOOK_SECRET hamma mijoz uchun bitta edi: bitta sir
-- sizib chiqsa, hamma mijozning webhook manziliga yolg'on lid yuborish
-- mumkin bo'lardi. Endi har workspace o'z sirini oladi.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_webhook_secret TEXT;

-- Token muddati.
--
-- amoCRM access token 24 soatda o'ladi. Hozir yangilanish faqat 401
-- kelgandan keyin bo'ladi — ya'ni har mijozda kuniga kamida bitta
-- so'rov behuda ketadi va lid kechikadi. Muddatni bilsak, oldindan
-- yangilaymiz.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_token_expires_at TIMESTAMPTZ;

-- Mavjud ulangan workspace'larga webhook siri yasab beramiz, shunda
-- migratsiyadan keyin ham webhook tekshiruvi ishlashda davom etadi.
-- gen_random_uuid() pgcrypto/pg13+ da mavjud (oldingi migratsiyalarda
-- ham ishlatilgan).
UPDATE workspaces
   SET amocrm_webhook_secret = replace(gen_random_uuid()::text, '-', '')
 WHERE amocrm_webhook_secret IS NULL
   AND amocrm_domain IS NOT NULL;

COMMENT ON COLUMN workspaces.amocrm_client_secret IS
  'AES-256 shifrlangan. Hech qachon API javobida qaytarilmaydi.';
COMMENT ON COLUMN workspaces.amocrm_webhook_secret IS
  'Har mijozga alohida webhook siri; webhook URL ichida keladi.';
