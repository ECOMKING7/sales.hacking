-- 040: amoMarket ommaviy integratsiyasi (McQueen AI)
--
-- Kod bu sxemani o'zi ham yaratadi (services/amocrmPublic.ts →
-- ensureAmoPublicSchema), chunki Vercel deploy migratsiya yurgizmaydi.
-- Bu fayl tarix va lokal muhit uchun. Ikkala buyruq ham idempotent.

-- Token qaysi kalit bilan olingan: 'public' = amoMarket integratsiyasi,
-- NULL = eski yo'l (workspace kaliti yoki .env). Yangilash aynan shu
-- kalit va redirect bilan bo'lishi shart.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_oauth_client TEXT;

-- amoMarket'dan o'rnatilgan, lekin hali workspace'ga biriktirilmagan
-- o'rnatmalar. Tokenlar AES-256 bilan shifrlangan.
CREATE TABLE IF NOT EXISTS amocrm_pending_installs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain         TEXT NOT NULL UNIQUE,
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
