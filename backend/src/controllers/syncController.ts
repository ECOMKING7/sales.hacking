import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { enqueueSync } from '../jobs/syncJob';
import { DateRange } from '../services/facebookAdsService';

const triggerSchema = z
  .object({
    datePreset: z.string().optional(),
    since: z.string().optional(),
    until: z.string().optional(),
  })
  .optional();

// ---- POST /api/sync/trigger (protected) ----
export async function trigger(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const workspaceId = req.user.workspaceId;

  // Validate FB is connected before doing any queue/sync work.
  const ws = await pool.query<{ fb_access_token: string | null; fb_ad_account_id: string | null }>(
    `SELECT fb_access_token, fb_ad_account_id FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const row = ws.rows[0];
  if (!row || !row.fb_access_token) {
    res.status(400).json({ error: 'Facebook is not connected' });
    return;
  }
  if (!row.fb_ad_account_id) {
    res.status(400).json({ error: 'No ad account selected' });
    return;
  }

  const parsed = triggerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const body = parsed.data ?? {};
  let range: DateRange | undefined;
  if (body.since && body.until) {
    range = { since: body.since, until: body.until };
  } else if (body.datePreset) {
    range = { datePreset: body.datePreset };
  }

  try {
    const { queued } = await enqueueSync(workspaceId, range);
    res.status(202).json({
      success: true,
      queued,
      message: queued ? 'Sync queued' : 'Sync ran inline (Redis unavailable)',
    });
  } catch (err) {
    console.error('sync trigger error:', err);
    res.status(500).json({ error: 'Failed to start sync' });
  }
}

// ---- GET /api/sync/status (protected) ----
export async function status(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, status, message, synced_at
         FROM sync_logs
        WHERE workspace_id = $1
        ORDER BY synced_at DESC
        LIMIT 1`,
      [req.user.workspaceId]
    );
    res.json({ lastSync: rows[0] ?? null });
  } catch (err) {
    console.error('sync status error:', err);
    res.status(500).json({ error: 'Failed to load sync status' });
  }
}
