-- 021: login urinishlarini hisoblash (brute-force himoyasi)
--
-- MUAMMO
-- /api/auth/login da hech qanday cheklov yo'q edi. Ya'ni parolni
-- cheksiz marta sinab ko'rish mumkin. bcrypt (12 raund) sekin, lekin
-- bu faqat sekinlashtiradi — to'smaydi. Va har urinish serverless
-- funksiyani ishga tushirib pul sarflaydi.
--
-- NEGA XOTIRADA EMAS, BAZADA
-- Vercel'da har so'rov boshqa nusxada ishlashi mumkin. Xotiradagi
-- Map (pixelController'dagi kabi) serverless'da bir nusxa uchun
-- ishlaydi va amalda deyarli hech narsa to'smaydi. Bazadagi hisoblagich
-- hamma nusxada bir xil ko'rinadi.
--
-- MAXFIYLIK
-- Email ham, IP ham XOM holda saqlanmaydi: ikkisi birga SHA-256
-- qilinadi. Ya'ni jadvaldan "kim kirishga urindi" degan ma'lumot
-- chiqarib bo'lmaydi, lekin "shu juftlik necha marta urindi" ma'lum.

CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGSERIAL PRIMARY KEY,
  -- sha256(lower(email) + '|' + ip)
  key_hash     TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Oyna bo'yicha sanash uchun.
CREATE INDEX IF NOT EXISTS idx_login_attempts_key
  ON login_attempts (key_hash, attempted_at DESC);

-- Eski yozuvlarni tozalash uchun (fon ishi yoki opportunistik DELETE).
CREATE INDEX IF NOT EXISTS idx_login_attempts_time
  ON login_attempts (attempted_at);

COMMENT ON TABLE login_attempts IS
  'Muvaffaqiyatsiz login urinishlari. key_hash = sha256(email|ip) — xom email/IP saqlanmaydi.';
