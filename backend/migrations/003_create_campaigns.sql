-- 003_create_campaigns.sql
CREATE TABLE IF NOT EXISTS campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fb_campaign_id  TEXT,
  name            TEXT,
  status          TEXT,

  spend           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  impressions     BIGINT NOT NULL DEFAULT 0,
  clicks          BIGINT NOT NULL DEFAULT 0,
  leads_count     INTEGER NOT NULL DEFAULT 0,
  purchases_count INTEGER NOT NULL DEFAULT 0,
  revenue         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  roas            NUMERIC(10, 4),
  cac             NUMERIC(14, 2),

  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, fb_campaign_id)
);
