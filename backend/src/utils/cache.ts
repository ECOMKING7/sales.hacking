import { createClient, RedisClientType } from 'redis';

// Lazy, fail-soft Redis cache. If Redis is unreachable, every operation
// silently degrades to a no-op so the dashboard still works without it.
let client: RedisClientType | null = null;
let triedConnect = false;
let available = false;

async function getClient(): Promise<RedisClientType | null> {
  if (available) return client;
  if (triedConnect) return null;
  triedConnect = true;
  try {
    const c: RedisClientType = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: { reconnectStrategy: false, connectTimeout: 1000 },
    });
    c.on('error', () => {
      /* swallow — handled by degraded mode */
    });
    await c.connect();
    client = c;
    available = true;
    return client;
  } catch {
    available = false;
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const c = await getClient();
    if (!c) return null;
    const raw = await c.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const c = await getClient();
    if (!c) return;
    await c.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    /* ignore */
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const c = await getClient();
    if (!c) return;
    await c.del(key);
  } catch {
    /* ignore */
  }
}

/** Delete all keys matching a glob pattern (e.g. "dashboard:overview:WS:*"). */
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const c = await getClient();
    if (!c) return;
    const keys: string[] = [];
    for await (const key of c.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key as unknown as string);
    }
    if (keys.length) await c.del(keys);
  } catch {
    /* ignore */
  }
}

export const overviewCacheKey = (workspaceId: string, from: string, to: string): string =>
  `dashboard:overview:${workspaceId}:${from}:${to}`;

export const overviewCachePattern = (workspaceId: string): string =>
  `dashboard:overview:${workspaceId}:*`;
