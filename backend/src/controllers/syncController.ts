import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { pool, poolStats } from '../db/pool';
import { enqueueSync } from '../jobs/syncJob';
import { DateRange } from '../services/facebookAdsService';
import { fbUsage } from '../services/fbRateLimit';
import { ensureFreshFxRates } from '../services/fxRates';

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
  // Token lives on the user row; ad account ID is on the workspace.
  const ws = await pool.query<{ fb_access_token: string | null; fb_ad_account_id: string | null }>(
    `SELECT u.fb_access_token, w.fb_ad_account_id
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
      WHERE w.id = $1`,
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

/**
 * ---- POST /api/sync/cron ----
 * Tashqi rejalashtiruvchi uchun (cron-job.org, GitHub Actions, Vercel Cron).
 *
 * NEGA KERAK: serverless muhitda node-cron ishlamaydi — funksiya so'rovlar
 * orasida yashamaydi. Vercel'ning o'z cron'i esa Hobby tarifida kuniga 1 marta.
 * Shuning uchun tetik tashqaridan keladi.
 *
 * Himoya: JWT emas (cron xizmatida foydalanuvchi yo'q), balki CRON_SECRET.
 * Header: X-Cron-Secret, yoki ?secret= query parametri.
 *
 * CRON_SECRET o'rnatilmagan bo'lsa endpoint 503 qaytaradi — ochiq qolmaydi.
 */
export async function cronSync(req: Request, res: Response): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET sozlanmagan — endpoint o\'chirilgan' });
    return;
  }

  const provided =
    req.header('x-cron-secret') ||
    (typeof req.query.secret === 'string' ? req.query.secret : '') ||
    '';

  // Vaqt bo'yicha doimiy solishtirish — uzunlik farqi ham sirni ochmasin.
  const a = Buffer.from(provided.padEnd(secret.length).slice(0, secret.length));
  const b = Buffer.from(secret);
  if (provided.length !== secret.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid cron secret' });
    return;
  }

  const startedAt = Date.now();
  const results: Array<{ workspaceId: string; ok: boolean; error?: string }> = [];

  // Serverless'da ichki cron yo'q, shuning uchun kurs ham shu tetikdan
  // yangilanadi. Kurs yangi bo'lsa tashqi so'rov yuborilmaydi.
  await ensureFreshFxRates();

  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT w.id
         FROM workspaces w
         JOIN users u ON u.id = w.owner_id
        WHERE u.fb_access_token IS NOT NULL
          AND w.fb_ad_account_id IS NOT NULL`
    );

    for (const ws of rows) {
      // Bitta workspace'dagi xato qolganlarini to'xtatmaydi.
      try {
        await enqueueSync(ws.id);
        results.push({ workspaceId: ws.id, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`cron sync: workspace ${ws.id} failed:`, message);
        results.push({ workspaceId: ws.id, ok: false, error: message });
      }
    }

    const failed = results.filter((r) => !r.ok).length;
    res.status(200).json({
      success: true,
      workspaces: results.length,
      failed,
      durationMs: Date.now() - startedAt,
      pool: poolStats(),
      // Facebook aniq chaqiruvlar sonini bermaydi — limitning necha foizi
      // ishlatilganini beradi. Bloklangan bo'lsa regainMinutes to'ladi.
      fbUsage: fbUsage(),
      results,
    });
  } catch (err) {
    console.error('cron sync error:', err);
    res.status(500).json({ error: 'Cron sync failed', durationMs: Date.now() - startedAt });
  }
}
