-- amoCRM akkaunt ID'si — "хук об отключении" faqat account_id yuboradi
-- (domen yubormaydi). Ulanish paytida saqlanadi, hook shu bilan topadi.
-- Runtime'da ham yaratiladi: services/amocrmDisconnect.ts (ensureAmoAccountIdColumn).
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS amocrm_account_id TEXT;
CREATE INDEX IF NOT EXISTS workspaces_amocrm_account_id ON workspaces (amocrm_account_id)
  WHERE amocrm_account_id IS NOT NULL;
