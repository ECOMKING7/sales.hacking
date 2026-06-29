-- 007_create_touchpoints.sql
CREATE TABLE IF NOT EXISTS touchpoints (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id             UUID REFERENCES leads(id) ON DELETE CASCADE,
  ad_id               UUID REFERENCES ads(id) ON DELETE SET NULL,
  adset_id            UUID REFERENCES adsets(id) ON DELETE SET NULL,
  campaign_id         UUID REFERENCES campaigns(id) ON DELETE SET NULL,

  event_type          TEXT NOT NULL
                        CHECK (event_type IN ('view', 'click', 'lead', 'purchase')),
  touch_number        INTEGER,
  attribution_weight  NUMERIC(6, 4),

  fbclid              TEXT,
  fb_event_id         TEXT,
  ip_hash             TEXT,

  occurred_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
