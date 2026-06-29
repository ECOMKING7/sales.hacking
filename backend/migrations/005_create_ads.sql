-- 005_create_ads.sql
CREATE TABLE IF NOT EXISTS ads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  adset_id        UUID REFERENCES adsets(id) ON DELETE CASCADE,
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  fb_ad_id        TEXT,
  name            TEXT,
  status          TEXT,
  creative_type   TEXT CHECK (creative_type IN ('video', 'image', 'carousel')),
  thumbnail_url   TEXT,

  spend           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  impressions     BIGINT NOT NULL DEFAULT 0,
  clicks          BIGINT NOT NULL DEFAULT 0,
  leads_count     INTEGER NOT NULL DEFAULT 0,
  purchases_count INTEGER NOT NULL DEFAULT 0,
  revenue         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  roas            NUMERIC(10, 4),

  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, fb_ad_id)
);
