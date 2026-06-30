import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { getLead, getContact, hashPhone, hashEmail } from '../services/amocrmService';
import { processLeadAttribution } from '../services/attributionEngine';
import { cacheDelPattern, overviewCachePattern } from '../utils/cache';

// AmoCRM's default "closed - lost" status id.
const DEFAULT_LOST_STATUS_ID = '143';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * AmoCRM cannot HMAC-sign webhooks, so we verify a shared secret passed either
 * as ?secret= or the X-Webhook-Secret header (the webhook URL embeds it).
 */
function verifySignature(req: Request): boolean {
  const secret = process.env.AMOCRM_WEBHOOK_SECRET;
  if (!secret) return true; // not configured (dev) → allow
  const provided =
    (typeof req.query.secret === 'string' ? req.query.secret : '') ||
    req.header('x-webhook-secret') ||
    '';
  if (provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

interface AmoLeadEvent {
  id?: string;
  status_id?: string;
  pipeline_id?: string;
  price?: string;
  created_at?: string;
}
interface AmoContactEvent {
  id?: string;
}

interface WorkspaceCrmConfig {
  id: string;
  amocrm_won_stage_id: string | null;
  amocrm_pipeline_id: string | null;
}

async function findWorkspaceBySubdomain(subdomain: string): Promise<WorkspaceCrmConfig | null> {
  const { rows } = await pool.query<WorkspaceCrmConfig>(
    `SELECT id, amocrm_won_stage_id, amocrm_pipeline_id
       FROM workspaces WHERE amocrm_domain LIKE $1 LIMIT 1`,
    [`${subdomain}.%`]
  );
  return rows[0] ?? null;
}

/**
 * Fetch the authoritative deal value from the AmoCRM API. The webhook payload's
 * price can be missing or stale, so when a deal is won we pull the full lead and
 * use its price. Falls back to the webhook price if the API call fails.
 */
async function resolveWonRevenue(
  workspaceId: string,
  leadId: string,
  webhookPrice: number
): Promise<number> {
  try {
    const full = await getLead(workspaceId, leadId);
    const apiPrice = num(full.price);
    if (apiPrice > 0) return apiPrice;
  } catch (err) {
    console.error('could not fetch full lead price, using webhook price:', (err as Error).message);
  }
  return webhookPrice;
}

async function handleLeadAdd(workspaceId: string, lead: AmoLeadEvent): Promise<void> {
  if (!lead.id) return;

  let contactId: number | null = null;
  let phoneHash: string | null = null;
  let emailHash: string | null = null;

  // Enrich with contact info from the AmoCRM API (needs a valid token).
  try {
    const full = await getLead(workspaceId, lead.id);
    contactId = full._embedded?.contacts?.[0]?.id ?? null;
    if (contactId) {
      const contact = await getContact(workspaceId, contactId);
      if (contact.phone) phoneHash = hashPhone(contact.phone);
      if (contact.email) emailHash = hashEmail(contact.email);
    }
  } catch (err) {
    console.error('lead enrichment failed (will store minimal lead):', (err as Error).message);
  }

  await pool.query(
    `INSERT INTO leads
       (workspace_id, crm_lead_id, crm_contact_id, phone_hash, email_hash,
        status, revenue, crm_created_at)
     VALUES ($1,$2,$3,$4,$5,'new',$6,
             CASE WHEN $7::bigint IS NULL THEN NULL ELSE to_timestamp($7::bigint) END)
     ON CONFLICT (workspace_id, crm_lead_id) DO UPDATE SET
        crm_contact_id = COALESCE(EXCLUDED.crm_contact_id, leads.crm_contact_id),
        phone_hash = COALESCE(EXCLUDED.phone_hash, leads.phone_hash),
        email_hash = COALESCE(EXCLUDED.email_hash, leads.email_hash)`,
    [
      workspaceId,
      lead.id,
      contactId ? String(contactId) : null,
      phoneHash,
      emailHash,
      num(lead.price),
      lead.created_at ?? null,
    ]
  );
}

async function handleLeadStatus(
  workspaceId: string,
  lead: AmoLeadEvent,
  config: WorkspaceCrmConfig
): Promise<void> {
  if (!lead.id) return;
  const statusId = lead.status_id ? String(lead.status_id) : null;
  const pipelineId = lead.pipeline_id ? String(lead.pipeline_id) : null;
  let revenue = num(lead.price);

  // A deal is "won" when it lands on the customer-selected won stage. When a
  // pipeline is configured, the event must also belong to that pipeline.
  const wonStageId = config.amocrm_won_stage_id;
  const pipelineMatches = !config.amocrm_pipeline_id || pipelineId === config.amocrm_pipeline_id;

  let newStatus: 'won' | 'lost' | 'in_progress' = 'in_progress';
  if (wonStageId && statusId === wonStageId && pipelineMatches) {
    newStatus = 'won';
  } else if (statusId === DEFAULT_LOST_STATUS_ID) {
    newStatus = 'lost';
  }

  // For a won deal, pull the authoritative deal value from the API.
  if (newStatus === 'won') {
    revenue = await resolveWonRevenue(workspaceId, lead.id, revenue);
  }

  const result = await pool.query(
    `UPDATE leads
       SET status = $1,
           revenue = CASE WHEN $1 = 'won' THEN $2 ELSE revenue END,
           won_at  = CASE WHEN $1 = 'won' THEN now() ELSE won_at END
     WHERE workspace_id = $3 AND crm_lead_id = $4`,
    [newStatus, revenue, workspaceId, lead.id]
  );

  // Lead arrived via status event before we saw its add — create it.
  if (!result.rowCount) {
    await pool.query(
      `INSERT INTO leads (workspace_id, crm_lead_id, status, revenue, won_at)
       VALUES ($1,$2,$3,$4, CASE WHEN $3='won' THEN now() ELSE NULL END)
       ON CONFLICT (workspace_id, crm_lead_id) DO NOTHING`,
      [workspaceId, lead.id, newStatus, revenue]
    );
  }

  // When a lead is won, run the attribution engine to credit the ads.
  if (newStatus === 'won') {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM leads WHERE workspace_id = $1 AND crm_lead_id = $2`,
        [workspaceId, lead.id]
      );
      if (rows[0]) {
        await processLeadAttribution(rows[0].id, workspaceId);
      }
      // Fresh won deal — invalidate cached dashboard overviews.
      await cacheDelPattern(overviewCachePattern(workspaceId));
    } catch (err) {
      console.error('attribution after won failed:', (err as Error).message);
    }
  }
}

async function handleContactAdd(workspaceId: string, contact: AmoContactEvent): Promise<void> {
  if (!contact.id) return;
  try {
    const info = await getContact(workspaceId, contact.id);
    const phoneHash = info.phone ? hashPhone(info.phone) : null;
    const emailHash = info.email ? hashEmail(info.email) : null;
    if (!phoneHash && !emailHash) return;
    // Attach hashes to any lead already linked to this contact.
    await pool.query(
      `UPDATE leads
         SET phone_hash = COALESCE($1, phone_hash),
             email_hash = COALESCE($2, email_hash)
       WHERE workspace_id = $3 AND crm_contact_id = $4`,
      [phoneHash, emailHash, workspaceId, String(contact.id)]
    );
  } catch (err) {
    console.error('contact add handling failed:', (err as Error).message);
  }
}

// ---- POST /api/webhooks/amocrm ----
export async function amocrmWebhook(req: Request, res: Response): Promise<void> {
  if (!verifySignature(req)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  // Acknowledge immediately — AmoCRM retries on non-2xx.
  res.status(200).json({ ok: true });

  try {
    const body = req.body as {
      account?: { subdomain?: string };
      leads?: { add?: AmoLeadEvent[]; status?: AmoLeadEvent[] };
      contacts?: { add?: AmoContactEvent[] };
    };

    const subdomain = body.account?.subdomain;
    if (!subdomain) return;

    const workspace = await findWorkspaceBySubdomain(subdomain);
    if (!workspace) {
      console.warn('webhook: no workspace for subdomain', subdomain);
      return;
    }

    for (const lead of body.leads?.add ?? []) {
      await handleLeadAdd(workspace.id, lead);
    }
    for (const lead of body.leads?.status ?? []) {
      await handleLeadStatus(workspace.id, lead, workspace);
    }
    for (const contact of body.contacts?.add ?? []) {
      await handleContactAdd(workspace.id, contact);
    }
  } catch (err) {
    // Already responded 200; just log so AmoCRM doesn't retry endlessly.
    console.error('amocrm webhook processing error:', err);
  }
}
