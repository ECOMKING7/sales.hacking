-- 002_create_workspaces.sql
CREATE TABLE IF NOT EXISTS workspaces (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  owner_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan                   TEXT NOT NULL DEFAULT 'free'
                           CHECK (plan IN ('free', 'pro', 'agency')),

  -- Facebook / Meta Ads integration
  fb_ad_account_id       TEXT,
  fb_access_token        TEXT,
  fb_token_expires_at    TIMESTAMPTZ,

  -- amoCRM integration
  amocrm_domain          TEXT,
  amocrm_access_token    TEXT,
  amocrm_refresh_token   TEXT,
  amocrm_pipeline_id     TEXT,
  amocrm_won_stage_id    TEXT,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
