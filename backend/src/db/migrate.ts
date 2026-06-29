import fs from 'fs';
import path from 'path';
import { pool } from './pool';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations'
  );
  return new Set(rows.map((r) => r.name));
}

async function run(): Promise<void> {
  await ensureMigrationsTable();
  const done = await appliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;

  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip     ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`success  ${file}`);
      appliedCount++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`FAILED   ${file}`);
      console.error(err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(
    `\nDone. ${appliedCount} migration(s) applied, ${files.length} total.`
  );
}

run()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Migration run failed:', err.message);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
