-- 008_create_indexes.sql

-- workspace_id on every tenant-scoped table
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id      ON workspaces (owner_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_id   ON campaigns (workspace_id);
CREATE INDEX IF NOT EXISTS idx_adsets_workspace_id      ON adsets (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ads_workspace_id         ON ads (workspace_id);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_id       ON leads (workspace_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_workspace_id ON touchpoints (workspace_id);

-- Facebook / external id lookups (used during sync)
CREATE INDEX IF NOT EXISTS idx_campaigns_fb_campaign_id ON campaigns (fb_campaign_id);
CREATE INDEX IF NOT EXISTS idx_adsets_fb_adset_id       ON adsets (fb_adset_id);
CREATE INDEX IF NOT EXISTS idx_ads_fb_ad_id             ON ads (fb_ad_id);
CREATE INDEX IF NOT EXISTS idx_leads_crm_lead_id        ON leads (crm_lead_id);

-- Foreign-key join columns
CREATE INDEX IF NOT EXISTS idx_adsets_campaign_id          ON adsets (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_adset_id                ON ads (adset_id);
CREATE INDEX IF NOT EXISTS idx_ads_campaign_id             ON ads (campaign_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_lead_id         ON touchpoints (lead_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_ad_id           ON touchpoints (ad_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_campaign_id     ON touchpoints (campaign_id);

-- Status filters
CREATE INDEX IF NOT EXISTS idx_campaigns_status   ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_ads_status         ON ads (status);
CREATE INDEX IF NOT EXISTS idx_leads_status       ON leads (status);

-- Time-range queries
CREATE INDEX IF NOT EXISTS idx_touchpoints_occurred_at ON touchpoints (occurred_at);
CREATE INDEX IF NOT EXISTS idx_leads_won_at            ON leads (won_at);
