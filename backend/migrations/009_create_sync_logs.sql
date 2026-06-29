-- 009_create_sync_logs.sql
CREATE TABLE IF NOT EXISTS sync_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('success', 'error', 'running')),
  message      TEXT,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_workspace_id ON sync_logs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_synced_at    ON sync_logs (synced_at);
