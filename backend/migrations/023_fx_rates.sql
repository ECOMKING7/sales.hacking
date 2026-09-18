-- 023: kunlik valyuta kurslari
--
-- 022 da ROAS'ni to'sib qo'ydik: reklama akkaunti USD, CRM UZS bo'lsa
-- revenue/spend so'mni dollarga bo'lardi. Bu migratsiya to'siqni
-- konvertatsiyaga almashtiradi.
--
-- SAQLASH SHAKLI
-- Har qator: 1 birlik `base` necha `quote`. Manba (cbu.uz) hamma
-- valyutani SO'MDA kotirovka qiladi, shuning uchun quote har doim UZS.
-- Boshqa juftlik kerak bo'lsa kross-kurs orqali olinadi:
--   USD -> EUR  =  (USD->UZS) / (EUR->UZS)
-- Shu sababli mijoz CRM'i EUR, reklamasi USD bo'lsa ham ishlaydi —
-- kod bironta valyutaga qotirilmagan.
--
-- NOMINAL
-- Manbada ba'zi valyuta 100 yoki 1000 birlik uchun kotirovka qilinadi
-- (masalan 100 JPY). Yozishdan oldin 1 birlikka bo'linadi, ya'ni bu
-- jadvalda nominal DOIM 1.
--
-- SANA
-- Kurs kunlik. Hisobot sanasiga ANIQ mos kurs bo'lmasa (dam olish kuni,
-- manba kechikkani), o'sha sanadan oldingi eng yaqin kurs olinadi —
-- keyingisi emas. Kelajakdagi kursni o'tgan kunga qo'llash =
-- ma'lumotni orqadan o'zgartirish.

CREATE TABLE IF NOT EXISTS fx_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base        TEXT NOT NULL,
  quote       TEXT NOT NULL,
  -- 1 base = rate quote. NUMERIC: so'm kurslari katta va aniq bo'lishi kerak.
  rate        NUMERIC(20, 6) NOT NULL CHECK (rate > 0),
  rate_date   DATE NOT NULL,
  source      TEXT NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bir kunga bitta kurs. Qayta yuklash UPSERT bo'ladi, dublikat emas.
CREATE UNIQUE INDEX IF NOT EXISTS fx_rates_unique
  ON fx_rates (base, quote, rate_date);

-- "Shu sanadan oldingi eng yaqin kurs" so'rovi uchun.
CREATE INDEX IF NOT EXISTS fx_rates_lookup
  ON fx_rates (base, quote, rate_date DESC);

COMMENT ON TABLE fx_rates IS
  'Kunlik valyuta kurslari. 1 base = rate quote. Manba: cbu.uz (UZS kotirovkasi).';
