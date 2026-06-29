import Queue from 'bull';
import cron from 'node-cron';
import { pool } from '../db/pool';
import { syncWorkspace, DateRange } from '../services/facebookAdsService';

const QUEUE_NAME = 'fb-sync';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface SyncJobData {
  workspaceId: string;
  range?: DateRange;
}

let queue: Queue.Queue<SyncJobData> | null = null;
let redisAvailable = true;

/**
 * Lazily create the Bull queue. Importing this module must NOT connect to Redis
 * (so the API boots fine without it); the connection is established on first use.
 */
function getQueue(): Queue.Queue<SyncJobData> {
  if (queue) return queue;
  queue = new Queue<SyncJobData>(QUEUE_NAME, REDIS_URL, {
    redis: {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // Stop endless reconnect spam when Redis isn't running locally.
      retryStrategy: () => null,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });

  queue.on('error', () => {
    redisAvailable = false;
  });

  queue.process(async (job) => {
    return runSync(job.data.workspaceId, job.data.range);
  });

  return queue;
}

/**
 * Run a sync and record the outcome in sync_logs.
 */
export async function runSync(workspaceId: string, range?: DateRange) {
  try {
    const result = await syncWorkspace(workspaceId, range ?? { datePreset: 'last_30d' });
    await pool.query(
      `INSERT INTO sync_logs (workspace_id, status, message)
       VALUES ($1, 'success', $2)`,
      [
        workspaceId,
        `Synced ${result.campaigns} campaigns, ${result.adsets} adsets, ${result.ads} ads`,
      ]
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await pool.query(
      `INSERT INTO sync_logs (workspace_id, status, message) VALUES ($1, 'error', $2)`,
      [workspaceId, message]
    );
    throw err;
  }
}

/**
 * Enqueue a sync. Falls back to inline execution if Redis is unavailable so the
 * platform still works in environments without a running Redis.
 */
export async function enqueueSync(
  workspaceId: string,
  range?: DateRange
): Promise<{ queued: boolean }> {
  try {
    const q = getQueue();
    await q.add({ workspaceId, range });
    return { queued: true };
  } catch {
    redisAvailable = false;
    // Run inline (don't await fully blocking the request beyond the work itself).
    await runSync(workspaceId, range);
    return { queued: false };
  }
}

/**
 * Schedule an automatic sync for every workspace every 15 minutes.
 */
export function startSyncCron(): void {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM workspaces
         WHERE fb_access_token IS NOT NULL AND fb_ad_account_id IS NOT NULL`
      );
      for (const ws of rows) {
        await enqueueSync(ws.id);
      }
    } catch (err) {
      console.error('sync cron error:', err);
    }
  });
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}
