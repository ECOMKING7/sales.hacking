import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { decrypt } from '../utils/encryption';
import { getAdAccounts } from '../services/facebookOAuth';
import { getUsage } from '../middleware/planLimits';
import { signToken } from '../utils/jwt';
import { runInBackground } from '../utils/background';
import { syncWorkspace } from '../services/facebookAdsService';

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

// Token now lives on the user row; ad account ID stays on the workspace.
async function loadFbWorkspace(workspaceId: string): Promise<FbWorkspaceRow | null> {
  const result = await pool.query<FbWorkspaceRow>(
    `SELECT w.fb_ad_account_id,
            u.fb_access_token,
            u.fb_token_expires_at
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
      WHERE w.id = $1`,
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

  const workspaceId = req.user.workspaceId;
  const adAccountId = parsed.data.adAccountId;

  try {
    const prev = await pool.query<{ fb_ad_account_id: string | null }>(
      `SELECT fb_ad_account_id FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    if (!prev.rowCount) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const previousId = prev.rows[0].fb_ad_account_id;
    const changed = previousId !== adAccountId;

    /**
     * Akkaunt valyutasi ham shu yerda saqlanadi.
     *
     * NEGA: ROAS = revenue / spend. Daromad CRM valyutasida (UZS),
     * xarajat esa reklama akkaunti valyutasida (USD). Ikkisi teng
     * bo'lmasa formula so'mni dollarga bo'ladi — real ma'lumotda
     * ~12 600 barobar shishgan raqam chiqqan edi. Valyutani bilsak,
     * ROAS'ni ko'rsatmay turib sababini aytamiz.
     *
     * Xato bo'lsa to'xtatmaymiz: akkaunt tanlash valyuta o'qib
     * bo'lmagani uchun buzilmasin. Sync keyin to'ldiradi.
     */
    let currency: string | null = null;
    /* Vaqt zonasi ham shu yerda. `ad_insights_daily.kun` — Facebook'ning
       o'z sanasi, ya'ni AKKAUNT vaqt zonasida. Uni bilmasak "kecha" ni
       noto'g'ri zonada hisoblaymiz va Ads Manager bilan raqam bir kunga
       siljiydi. */
    let timezone: string | null = null;
    try {
      const ws = await loadFbWorkspace(workspaceId);
      if (ws?.fb_access_token) {
        const accounts = await getAdAccounts(decrypt(ws.fb_access_token));
        const found = accounts.find((a) => a.id === adAccountId || a.account_id === adAccountId);
        currency = found?.currency ? String(found.currency).toUpperCase() : null;
        timezone = found?.timezone_name ? String(found.timezone_name) : null;
      }
    } catch (err) {
      console.error('ad account currency not read:', (err as Error).message);
    }

    await pool.query(
      `UPDATE workspaces
         SET fb_ad_account_id = $1,
             -- Akkaunt almashsa eski valyuta saqlanmaydi: noto'g'ri
             -- valyuta noma'lum valyutadan xavfliroq (ROAS jim xato
             -- chiqaradi). O'qib bo'lmasa NULL — sync to'ldiradi.
             fb_currency = CASE WHEN $4::boolean THEN $3
                                ELSE COALESCE($3, fb_currency) END,
             -- Valyuta bilan bir xil qoida: akkaunt almashsa eskisi
             -- saqlanmaydi. Noto'g'ri zona noma'lum zonadan xavfliroq.
             fb_timezone = CASE WHEN $4::boolean THEN $5
                                ELSE COALESCE($5, fb_timezone) END,
             updated_at = now()
       WHERE id = $2`,
      [adAccountId, workspaceId, currency, changed, timezone]
    );

    // Ad account almashtirilganda eski kampaniya/adset/ad qatorlari qolib
    // ketardi — jadvallarda ad account ustuni yo'q, shuning uchun dashboard
    // yangi akkauntni ko'rsatib, ma'lumotni eskisidan chizardi.
    //
    // Workspace bir vaqtda bitta ad account bilan ishlaydi, demak eski
    // qatorlar shunchaki axlat. campaigns o'chsa adsets/ads CASCADE bilan
    // ketadi; leads va touchpoints saqlanadi, faqat ad havolalari NULL
    // bo'ladi (ular baribir boshqa akkauntga tegishli edi).
    if (changed) {
      await pool.query(`DELETE FROM campaigns WHERE workspace_id = $1`, [workspaceId]);
      await pool.query(`DELETE FROM adsets WHERE workspace_id = $1`, [workspaceId]);
      await pool.query(`DELETE FROM ads WHERE workspace_id = $1`, [workspaceId]);

      // Yangi akkauntni darhol tortamiz — aks holda foydalanuvchi bo'sh
      // dashboard ko'rib, keyingi cron'gacha (15 daq) kutardi.
      runInBackground(
        syncWorkspace(workspaceId).then(() => undefined),
        `resync after ad account switch (${workspaceId})`
      );
    }

    res.json({ success: true, adAccountId, resyncing: changed });
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

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
});

// ---- POST /api/workspace/create (protected) ----
// Creates a new workspace for the logged-in user and returns a JWT scoped to it.
export async function createWorkspace(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const parsed = createWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  try {
    const ws = await pool.query<{ id: string; name: string; owner_id: string; plan: string; created_at: string }>(
      `INSERT INTO workspaces (name, owner_id, plan)
       VALUES ($1, $2, 'free')
       RETURNING id, name, owner_id, plan, created_at`,
      [parsed.data.name, req.user.userId]
    );
    const workspace = ws.rows[0];
    // Issue a new JWT scoped to the freshly created workspace.
    const token = signToken({
      userId: req.user.userId,
      email: req.user.email,
      workspaceId: workspace.id,
    });
    res.status(201).json({ token, workspace });
  } catch (err) {
    console.error('createWorkspace error:', err);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
}

// ---- POST /api/workspace/switch/:id (protected) ----
// Switches the active workspace and returns a new scoped JWT.
export async function switchWorkspace(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { id } = req.params;
  try {
    // Allow if user is owner OR an active member of the target workspace.
    const ws = await pool.query<{ id: string; name: string; owner_id: string; plan: string; created_at: string }>(
      `SELECT w.id, w.name, w.owner_id, w.plan, w.created_at
         FROM workspaces w
         LEFT JOIN workspace_members m
           ON m.workspace_id = w.id AND m.user_id = $2 AND m.status = 'active'
        WHERE w.id = $1
          AND (w.owner_id = $2 OR m.user_id = $2)`,
      [id, req.user.userId]
    );
    if (!ws.rows[0]) {
      res.status(403).json({ error: 'Workspace not found or access denied' });
      return;
    }
    const workspace = ws.rows[0];
    const token = signToken({
      userId: req.user.userId,
      email: req.user.email,
      workspaceId: workspace.id,
    });
    res.json({ token, workspace });
  } catch (err) {
    console.error('switchWorkspace error:', err);
    res.status(500).json({ error: 'Failed to switch workspace' });
  }
}

// ---- GET /api/workspace/list (protected) ----
// Lists all workspaces the user owns or is a member of.
export async function listWorkspaces(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const { rows } = await pool.query<{ id: string; name: string; plan: string; role: string }>(
      `SELECT w.id, w.name, w.plan, 'owner' AS role
         FROM workspaces w
        WHERE w.owner_id = $1
       UNION
       SELECT w.id, w.name, w.plan, m.role
         FROM workspaces w
         JOIN workspace_members m ON m.workspace_id = w.id
        WHERE m.user_id = $1 AND m.status = 'active'
        ORDER BY name ASC`,
      [req.user.userId]
    );
    res.json({ workspaces: rows });
  } catch (err) {
    console.error('listWorkspaces error:', err);
    res.status(500).json({ error: 'Failed to list workspaces' });
  }
}
