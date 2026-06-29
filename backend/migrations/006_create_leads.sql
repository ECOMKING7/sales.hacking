-- 006_create_leads.sql
CREATE TABLE IF NOT EXISTS leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  crm_lead_id        TEXT,
  crm_contact_id     TEXT,

  phone_hash         TEXT,
  email_hash         TEXT,
  status             TEXT NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new', 'in_progress', 'won', 'lost')),
  revenue            NUMERIC(14, 2) NOT NULL DEFAULT 0,

  first_click_ad_id  UUID REFERENCES ads(id) ON DELETE SET NULL,
  last_click_ad_id   UUID REFERENCES ads(id) ON DELETE SET NULL,
  total_touches      INTEGER NOT NULL DEFAULT 0,
  deal_time_days     INTEGER,

  crm_created_at     TIMESTAMPTZ,
  won_at             TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, crm_lead_id)
);
