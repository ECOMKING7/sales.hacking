import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { decrypt } from '../utils/encryption';
import { getAdAccounts } from '../services/facebookOAuth';
import { getUsage } from '../middleware/planLimits';

const selectAdAccountSchema = z.object({
  adAccountId: z.string().trim().min(1, 'adAccountId is required'),
});

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email'),
  role: z.enum(['admin', 'member']).optional(),
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
        businessName: a.business_name ?? null,
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

// ---- POST /api/workspace/invite (protected) ----
export async function invite(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { email, role } = parsed.data;

  try {
    // If the invitee already has an account, link them straight away.
    const userRes = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );
    const userId = userRes.rows[0]?.id ?? null;

    const result = await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, email, role, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, email)
       DO UPDATE SET role = EXCLUDED.role, user_id = COALESCE(EXCLUDED.user_id, workspace_members.user_id)
       RETURNING id, email, role, status`,
      [req.user.workspaceId, userId, email, role ?? 'member', userId ? 'active' : 'pending']
    );
    res.status(201).json({ success: true, member: result.rows[0] });
  } catch (err) {
    console.error('invite error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to invite member' });
  }
}

// ---- GET /api/workspace/members (protected) ----
export async function members(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const owner = await pool.query(
      `SELECT u.id AS user_id, u.email, u.name, 'owner' AS role, 'active' AS status
         FROM workspaces w JOIN users u ON u.id = w.owner_id
        WHERE w.id = $1`,
      [req.user.workspaceId]
    );
    const invited = await pool.query(
      `SELECT m.user_id, m.email, u.name, m.role, m.status
         FROM workspace_members m
         LEFT JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1
        ORDER BY m.created_at ASC`,
      [req.user.workspaceId]
    );
    res.json({ members: [...owner.rows, ...invited.rows] });
  } catch (err) {
    console.error('members error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load members' });
  }
}

// ---- DELETE /api/workspace/members/:userId (protected) ----
export async function removeMember(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const userId = String(req.params.userId);

  try {
    // Never allow removing the workspace owner.
    const owner = await pool.query(
      `SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2`,
      [req.user.workspaceId, userId]
    );
    if (owner.rowCount) {
      res.status(400).json({ error: 'Cannot remove the workspace owner' });
      return;
    }
    const result = await pool.query(
      `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [req.user.workspaceId, userId]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('removeMember error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to remove member' });
  }
}

// ---- GET /api/workspace/usage (protected) ----
export async function usage(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const data = await getUsage(req.user.workspaceId);
    res.json({
      plan: data.plan,
      limits: {
        adAccounts: data.limits.adAccounts,
        leadsPerMonth: data.limits.leadsPerMonth === Infinity ? null : data.limits.leadsPerMonth,
        export: data.limits.export,
        whiteLabel: data.limits.whiteLabel,
      },
      usage: {
        leadsThisMonth: data.leadsThisMonth,
        adAccounts: data.adAccounts,
      },
    });
  } catch (err) {
    console.error('usage error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to load usage' });
  }
}
