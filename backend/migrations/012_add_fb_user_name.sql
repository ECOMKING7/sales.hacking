-- Migration 012: store the Facebook user's display name so Settings can show
-- "Connected as <name>" without an extra API call.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fb_user_name TEXT;
