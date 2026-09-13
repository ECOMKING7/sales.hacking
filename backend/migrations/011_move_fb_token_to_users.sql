-- 011_move_fb_token_to_users.sql
-- Move Facebook token from workspaces to users so that one OAuth login
-- covers all workspaces owned by the same user.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fb_access_token      TEXT,
  ADD COLUMN IF NOT EXISTS fb_token_expires_at  TIMESTAMPTZ;

-- Migrate existing tokens: for each user, copy token from their first workspace
-- that already has one (in case the user had already connected).
UPDATE users u
SET fb_access_token     = w.fb_access_token,
    fb_token_expires_at = w.fb_token_expires_at
FROM (
  SELECT DISTINCT ON (owner_id)
         owner_id, fb_access_token, fb_token_expires_at
    FROM workspaces
   WHERE fb_access_token IS NOT NULL
   ORDER BY owner_id, created_at ASC
) w
WHERE w.owner_id = u.id
  AND u.fb_access_token IS NULL;

-- Remove the now-redundant columns from workspaces (keep fb_ad_account_id).
ALTER TABLE workspaces
  DROP COLUMN IF EXISTS fb_access_token,
  DROP COLUMN IF EXISTS fb_token_expires_at;
