-- 027: piksel so'rovlari hisoblagichi
--
-- MUAMMO: pixelController'da cheklov xotiradagi Map bilan qilingan edi.
-- Serverless'da (server doim yonib turmaydi, so'rov kelganda bir necha
-- soniyaga uyg'onadi) har so'rov boshqa nusxada bajarilishi mumkin va
-- har nusxaning o'z xotirasi bor. Ya'ni "daqiqasiga 100 ta" cheklovi
-- amalda 100 × nusxalar soni bo'lib ketardi — cheklov bezak edi.
--
-- Bu endpoint PAROLSIZ ochiq: manzilini bilgan har kim so'rov yubora
-- oladi (u mijoz saytidan chaqiriladi, shuning uchun boshqacha bo'lishi
-- ham mumkin emas). Demak cheklov bu yerda himoyaning o'zi.
--
-- SHAKLI: har workspace × har daqiqa uchun bitta qator. Bitta UPSERT
-- so'rovi hisoblagichni oshiradi va yangi qiymatni qaytaradi —
-- alohida o'qish kerak emas.

CREATE TABLE IF NOT EXISTS pixel_hits (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Daqiqaga yaxlitlangan vaqt: date_trunc('minute', now())
  minute       TIMESTAMPTZ NOT NULL,
  n            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, minute)
);

-- Eski qatorlarni tozalash uchun.
CREATE INDEX IF NOT EXISTS pixel_hits_minute ON pixel_hits (minute);

COMMENT ON TABLE pixel_hits IS
  'Piksel so''rovlari: har workspace × har daqiqa. Cheklov hamma funksiya nusxasi uchun bitta haqiqat.';
