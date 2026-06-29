import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { decrypt } from '../utils/encryption';
import { getAdAccounts } from '../services/facebookOAuth';

const selectAdAccountSchema = z.object({
  adAccountId: z.string().trim().min(1, 'adAccountId is required'),
});

interface FbWorkspaceRow {
  fb_ad_account_id: string | null;
  fb_access_token: string | null;
  fb_token_expires_at: string | null;
}

async function loadFbWorkspace(workspaceId: string): Promise<FbWorkspaceRow | null> {
  const result = await pool.query<FbWorkspaceRow>(
    `SELECT fb_ad_account_id, fb_access_token, fb_token_expires_at
       FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  return result.rows[0] ?? null;
}

// ---- GET /api/workspace/ad-accounts (protected) ----
// Returns the available ad accounts (no token ever leaves the server).
export async function listAdAccounts(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const ws = await loadFbWorkspace(req.user.workspaceId);
    if (!ws || !ws.fb_access_token) {
      res.status(400).json({ error: 'Facebook is not connected' });
      return;
    }

    const accessToken = decrypt(ws.fb_access_token);
    const accounts = await getAdAccounts(accessToken);
    res.json({
      adAccounts: accounts.map((a) => ({
        id: a.id,
        accountId: a.account_id,
        name: a.name,
        status: a.account_status,
        currency: a.currency,
      })),
    });
  } catch (err) {
    console.error('listAdAccounts error:', err);
    res.status(500).json({ error: 'Failed to load ad accounts' });
  }
}

// ---- POST /api/workspace/select-ad-account (protected) ----
export async function selectAdAccount(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = selectAdAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE workspaces
         SET fb_ad_account_id = $1, updated_at = now()
       WHERE id = $2`,
      [parsed.data.adAccountId, req.user.workspaceId]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ success: true, adAccountId: parsed.data.adAccountId });
  } catch (err) {
    console.error('selectAdAccount error:', err);
    res.status(500).json({ error: 'Failed to select ad account' });
  }
}

// ---- GET /api/workspace/fb-status (protected) ----
export async function fbStatus(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const ws = await loadFbWorkspace(req.user.workspaceId);
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const expiresAt = ws.fb_token_expires_at;
    const notExpired = expiresAt ? new Date(expiresAt).getTime() > Date.now() : false;

    res.json({
      connected: Boolean(ws.fb_access_token) && notExpired,
      adAccountId: ws.fb_ad_account_id,
      expiresAt,
    });
  } catch (err) {
    console.error('fbStatus error:', err);
    res.status(500).json({ error: 'Failed to load status' });
  }
}
