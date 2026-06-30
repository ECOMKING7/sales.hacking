import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { signOAuthState, verifyOAuthState } from '../utils/jwt';
import {
  generateAuthURL,
  exchangeCodeForTokens,
  getPipelines,
} from '../services/amocrmService';

function frontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// ---- GET /api/auth/amocrm/connect (protected) ----
export async function connect(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(400).json({ error: 'No workspace associated with this account' });
    return;
  }
  const state = signOAuthState({
    userId: req.user.userId,
    workspaceId: req.user.workspaceId,
  });
  res.json({ url: generateAuthURL(state) });
}

// ---- GET /api/auth/amocrm/callback (public; called by AmoCRM redirect) ----
export async function callback(req: Request, res: Response): Promise<void> {
  const redirectTo = (status: string) =>
    res.redirect(`${frontendUrl()}/settings?amocrm=${status}`);

  const { code, state, referer, error } = req.query as Record<string, string | undefined>;

  if (error) {
    redirectTo('denied');
    return;
  }
  if (!code || !state || !referer) {
    redirectTo('error');
    return;
  }

  let workspaceId: string | null;
  try {
    ({ workspaceId } = verifyOAuthState(state));
  } catch {
    redirectTo('error');
    return;
  }
  if (!workspaceId) {
    redirectTo('error');
    return;
  }

  try {
    // `referer` is the account domain, e.g. "example.amocrm.ru".
    await exchangeCodeForTokens(code, referer, workspaceId);
    redirectTo('connected');
  } catch (err) {
    console.error('amocrm callback error:', err);
    redirectTo('error');
  }
}

// ---- GET /api/workspace/amocrm-status (protected) ----
export async function status(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const { rows } = await pool.query<{
      amocrm_domain: string | null;
      amocrm_access_token: string | null;
      amocrm_pipeline_id: string | null;
      amocrm_won_stage_id: string | null;
    }>(
      `SELECT amocrm_domain, amocrm_access_token, amocrm_pipeline_id, amocrm_won_stage_id
         FROM workspaces WHERE id = $1`,
      [req.user.workspaceId]
    );
    const ws = rows[0];
    res.json({
      connected: Boolean(ws?.amocrm_access_token),
      domain: ws?.amocrm_domain ?? null,
      pipelineId: ws?.amocrm_pipeline_id ?? null,
      wonStageId: ws?.amocrm_won_stage_id ?? null,
    });
  } catch (err) {
    console.error('amocrm status error:', err);
    res.status(500).json({ error: 'Failed to load status' });
  }
}

// ---- GET /api/workspace/amocrm-pipelines (protected) ----
export async function listPipelines(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const pipelines = await getPipelines(req.user.workspaceId);
    res.json({
      pipelines: pipelines.map((p) => ({
        id: p.id,
        name: p.name,
        statuses: (p._embedded?.statuses ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load pipelines';
    const code = message.includes('not connected') ? 400 : 500;
    res.status(code).json({ error: message });
  }
}

// ---- POST /api/workspace/amocrm-pipeline (protected) ----
const pipelineSchema = z.object({
  pipelineId: z.union([z.string(), z.number()]).transform((v) => String(v)),
  wonStageId: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

export async function savePipeline(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const parsed = pipelineSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  try {
    const result = await pool.query(
      `UPDATE workspaces
         SET amocrm_pipeline_id = $1, amocrm_won_stage_id = $2, updated_at = now()
       WHERE id = $3`,
      [parsed.data.pipelineId, parsed.data.wonStageId, req.user.workspaceId]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({
      success: true,
      pipelineId: parsed.data.pipelineId,
      wonStageId: parsed.data.wonStageId,
    });
  } catch (err) {
    console.error('amocrm savePipeline error:', err);
    res.status(500).json({ error: 'Failed to save pipeline' });
  }
}
