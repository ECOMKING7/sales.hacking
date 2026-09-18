import Queue from 'bull';
import cron from 'node-cron';
import { pool } from '../db/pool';
import { ensureFreshFxRates } from '../services/fxRates';
import { DEFAULT_RANGE, syncWorkspace, DateRange } from '../services/facebookAdsService';
import { xatoQayd } from '../utils/xatolar';

const QUEUE_NAME = 'fb-sync';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
// Only use the Bull/Redis queue when explicitly enabled. Without a running Redis,
// constructing the queue spawns worker connections that can crash the process on
// ECONNREFUSED, so we default to running syncs inline.
const QUEUE_ENABLED = process.env.USE_REDIS === 'true';

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
    // Standart oyna bitta joyda turadi (DEFAULT_RANGE): cron ham,
    // qo'lda ishga tushirish ham bir xil davrni yozadi.
    const result = await syncWorkspace(workspaceId, range ?? DEFAULT_RANGE);
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
  if (!QUEUE_ENABLED) {
    // No Redis configured — run inline.
    await runSync(workspaceId, range);
    return { queued: false };
  }
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
  /**
   * Valyuta kursi — kuniga bir marta, 01:10 UTC (Toshkentda 06:10).
   * CBU yangi kursni tunda e'lon qiladi. Server ko'tarilganda ham bir
   * marta tekshiriladi, aks holda uzoq to'xtab qolgan muhitda kurs
   * ertangi cron'gacha eski qolardi.
   *
   * ensureFreshFxRates o'zi tekshiradi: kurs yangi bo'lsa CBU ga
   * bormaydi, xato bo'lsa jim o'tadi.
   */
  void ensureFreshFxRates();
  cron.schedule('10 1 * * *', () => {
    void ensureFreshFxRates();
  });

  cron.schedule('*/15 * * * *', async () => {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM workspaces
         WHERE fb_access_token IS NOT NULL AND fb_ad_account_id IS NOT NULL`
      );
      for (const ws of rows) {
        // One workspace's failure (expired token, rate limit, etc.) must not
        // abort the whole batch — runSync already logs the error to sync_logs.
        try {
          await enqueueSync(ws.id);
        } catch (err) {
          xatoQayd(err, { joy: 'sync-cron', workspaceId: ws.id });
        }
      }
    } catch (err) {
      xatoQayd(err, { joy: 'sync-cron' });
    }
  });
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}
