-- 004_create_adsets.sql
CREATE TABLE IF NOT EXISTS adsets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  fb_adset_id     TEXT,
  name            TEXT,
  status          TEXT,

  spend           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  impressions     BIGINT NOT NULL DEFAULT 0,
  clicks          BIGINT NOT NULL DEFAULT 0,
  leads_count     INTEGER NOT NULL DEFAULT 0,
  purchases_count INTEGER NOT NULL DEFAULT 0,
  revenue         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  roas            NUMERIC(10, 4),
  cost_per_lead   NUMERIC(14, 2),

  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, fb_adset_id)
);
