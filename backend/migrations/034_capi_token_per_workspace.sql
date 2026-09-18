-- 034: CAPI tokeni .env dan BAZAGA — har mijoz o'zinikini o'zi ulaydi
--
-- MUAMMO: token `META_CAPI_TOKEN__<KEY>` ko'rinishida .env / Vercel
-- secret da edi. Ya'ni yangi mijoz qo'shish uchun Vercel'ga kirib
-- o'zgaruvchi qo'shish va qayta deploy qilish kerak edi.
--
-- Bu §3.1 testidan o'tmaydi: "yangi mijoz qo'shish uchun kodga (yoki
-- deploy'ga) tegish kerakmi?" — ha. Demak arxitektura noto'g'ri.
-- SaaS'da mijoz o'zi ulanishi kerak; biz uning o'rtasida turmasligimiz
-- kerak.
--
-- TO'G'RI NAQSH BIZDA ALLAQACHON BOR: Facebook va amoCRM tokenlari
-- bazada, har workspace uchun alohida, AES-256 bilan shifrlangan holda
-- yotibdi (utils/encryption.ts). amoCRM'ning `client_secret` i ham
-- foydalanuvchi formasidan kelib, shifrlanib saqlanadi. CAPI tokeni
-- yagona istisno edi.
--
-- §4.1 buzilmaydi: token MENGA ko'rsatilmaydi, log'ga tushmaydi,
-- javobda qaytarilmaydi va ochiq matnda saqlanmaydi. Faqat "bor/yo'q"
-- holati ko'rinadi.
--
-- .env yo'li o'chirilmaydi — u endi ZAXIRA: loyiha egasining o'z
-- akkauntlari uchun qulay, lekin mijoz uchun shart emas.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS meta_capi_token TEXT;

COMMENT ON COLUMN workspaces.meta_capi_token IS
  'Meta CAPI access token, AES-256 bilan shifrlangan. Hech qachon javobda qaytarilmaydi.';
