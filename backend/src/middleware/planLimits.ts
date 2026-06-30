import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';

export type Plan = 'free' | 'pro' | 'agency';

export interface PlanLimit {
  adAccounts: number;
  leadsPerMonth: number; // Infinity = unlimited
  export: boolean;
  whiteLabel: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimit> = {
  free: { adAccounts: 1, leadsPerMonth: 500, export: false, whiteLabel: false },
  pro: { adAccounts: 3, leadsPerMonth: 5000, export: true, whiteLabel: false },
  agency: { adAccounts: 10, leadsPerMonth: Infinity, export: true, whiteLabel: true },
};

const UPGRADE_MSG = 'Plan limit reached. Please upgrade your plan.';

async function getPlan(workspaceId: string): Promise<Plan> {
  const { rows } = await pool.query<{ plan: string }>(
    `SELECT plan FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const plan = rows[0]?.plan;
  return plan === 'pro' || plan === 'agency' ? plan : 'free';
}

async function leadsThisMonth(workspaceId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM leads
      WHERE workspace_id = $1
        AND COALESCE(crm_created_at, created_at) >= date_trunc('month', now())`,
    [workspaceId]
  );
  return Number(rows[0]?.count ?? 0);
}

export interface Usage {
  plan: Plan;
  limits: PlanLimit;
  leadsThisMonth: number;
  adAccounts: number;
}

export async function getUsage(workspaceId: string): Promise<Usage> {
  const plan = await getPlan(workspaceId);
  const [leads, ws] = await Promise.all([
    leadsThisMonth(workspaceId),
    pool.query<{ fb_ad_account_id: string | null }>(
      `SELECT fb_ad_account_id FROM workspaces WHERE id = $1`,
      [workspaceId]
    ),
  ]);
  return {
    plan,
    limits: PLAN_LIMITS[plan],
    leadsThisMonth: leads,
    adAccounts: ws.rows[0]?.fb_ad_account_id ? 1 : 0,
  };
}

// ---- middlewares ----

/** Block a feature (e.g. CSV export) the current plan doesn't include. */
export function requireFeature(feature: keyof Pick<PlanLimit, 'export' | 'whiteLabel'>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const plan = await getPlan(req.user.workspaceId);
      if (!PLAN_LIMITS[plan][feature]) {
        res.status(403).json({
          error: `${UPGRADE_MSG} The "${feature}" feature requires a higher plan.`,
          plan,
          upgrade: true,
        });
        return;
      }
      next();
    } catch {
      res.status(500).json({ error: 'Failed to verify plan' });
    }
  };
}

/** Reject new lead ingestion once the monthly quota is hit. */
export async function checkLeadQuota(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const plan = await getPlan(req.user.workspaceId);
    const limit = PLAN_LIMITS[plan].leadsPerMonth;
    if (limit !== Infinity) {
      const used = await leadsThisMonth(req.user.workspaceId);
      if (used >= limit) {
        res.status(403).json({
          error: `${UPGRADE_MSG} Monthly lead limit (${limit}) reached.`,
          plan,
          upgrade: true,
        });
        return;
      }
    }
    next();
  } catch {
    res.status(500).json({ error: 'Failed to verify plan' });
  }
}
