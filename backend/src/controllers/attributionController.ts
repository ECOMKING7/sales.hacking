import { Request, Response } from 'express';
import { processLeadAttribution, AttributionModel } from '../services/attributionEngine';

const VALID_MODELS: AttributionModel[] = ['first_click', 'last_click', 'linear', 'time_decay'];

// ---- POST /api/attribution/reprocess/:leadId (protected) ----
export async function reprocess(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const leadId = String(req.params.leadId);

  const requested = typeof req.body?.model === 'string' ? req.body.model : undefined;
  const model: AttributionModel | undefined =
    requested && VALID_MODELS.includes(requested as AttributionModel)
      ? (requested as AttributionModel)
      : undefined;

  try {
    const result = await processLeadAttribution(leadId, req.user.workspaceId, model);
    res.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Attribution failed';
    const code = message === 'Lead not found' ? 404 : 500;
    res.status(code).json({ error: message });
  }
}
