import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const host = process.env.PGHOST || 'localhost';

// Supabase (and most managed Postgres) require TLS. Enable SSL when the host
// looks like a managed provider, or when PGSSL=true is set explicitly.
const needsSSL =
  process.env.PGSSL === 'true' ||
  /supabase\.(co|com)|\.rds\.|\.neon\./.test(connectionString || host);

const config: PoolConfig = connectionString
  ? { connectionString }
  : {
      host,
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'attribution_db',
    };

if (needsSSL) {
  config.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(config);

pool.on('error', (err: Error) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export const query = (text: string, params?: unknown[]) => pool.query(text, params);
