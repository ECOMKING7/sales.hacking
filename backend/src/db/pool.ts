import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const host = process.env.PGHOST || 'localhost';

// Serverless'da har sovuq start yangi ulanish ochadi. Session pooler (5432)
// ulanishni butun sessiya davomida ushlab turadi → limit tez tugaydi va DB
// javob bermay qoladi. Shuning uchun:
//   • DATABASE_URL Supabase TRANSACTION pooler'iga (port 6543) qaratilsin
//   • max: 1 — bitta funksiya nusxasi bittadan ortiq ulanish ochmasin
//   • idleTimeout past — bo'sh ulanish tez qaytarilsin
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Supabase va boshqa boshqariladigan Postgres TLS talab qiladi.
const needsSSL =
  process.env.PGSSL === 'true' ||
  /supabase\.(co|com)|\.rds\.|\.neon\./.test(connectionString || host);

const base: PoolConfig = connectionString
  ? { connectionString }
  : {
      host,
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'attribution_db',
    };

const config: PoolConfig = {
  ...base,
  max: isServerless ? 1 : Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,
  connectionTimeoutMillis: 10_000,
  // Uzoq osilib qolgan so'rov funksiyaning butun byudjetini yeb qo'ymasin.
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 25_000,
};

if (needsSSL) {
  config.ssl = { rejectUnauthorized: false };
}

// ⚠ TEKSHIRILISHI KERAK: pgbouncer transaction rejimida nomlangan prepared
// statement'lar qo'llab-quvvatlanmaydi. node-pg parametrli so'rovlarda nomsiz
// statement ishlatadi (bu ruxsat etilgan), lekin birinchi deploy'dan keyin
// dashboard va webhook yo'llarini real ma'lumot bilan sinab ko'rish shart.
export const pool = new Pool(config);

pool.on('error', (err: Error) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export const query = (text: string, params?: unknown[]) => pool.query(text, params);

/** Pool haqida qisqa diagnostika — /api/sync/cron javobida ishlatiladi. */
export function poolStats() {
  return {
    mode: isServerless ? 'serverless (max 1)' : `server (max ${config.max})`,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}
