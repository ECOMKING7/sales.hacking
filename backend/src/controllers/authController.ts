import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { pool } from '../db/pool';
import { signToken } from '../utils/jwt';

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

// ---- Validation schemas ----
const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  created_at: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  created_at: string;
}

function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.created_at,
  };
}

// ---- POST /api/auth/register ----
export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { name, email, password } = parsed.data;

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await client.query('BEGIN');

    const userResult = await client.query<UserRow>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, password_hash, created_at`,
      [name, email, passwordHash]
    );
    const user = userResult.rows[0];

    const workspaceResult = await client.query<WorkspaceRow>(
      `INSERT INTO workspaces (name, owner_id, plan)
       VALUES ($1, $2, 'free')
       RETURNING id, name, owner_id, plan, created_at`,
      [`${name}'s Workspace`, user.id]
    );
    const workspace = workspaceResult.rows[0];

    await client.query('COMMIT');

    const token = signToken({
      userId: user.id,
      email: user.email,
      workspaceId: workspace.id,
    });

    res.status(201).json({
      token,
      user: publicUser(user),
      workspace,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Concurrent registrations with the same email can both pass the earlier
    // SELECT check; the unique constraint is the real guard in that case.
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    console.error('register error:', err);
    res.status(500).json({ error: 'Failed to register' });
  } finally {
    client.release();
  }
}

// ---- POST /api/auth/login ----
export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { email, password } = parsed.data;

  try {
    const userResult = await pool.query<UserRow>(
      `SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1`,
      [email]
    );
    const user = userResult.rows[0];

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const workspaceResult = await pool.query<WorkspaceRow>(
      `SELECT id, name, owner_id, plan, created_at
       FROM workspaces WHERE owner_id = $1
       ORDER BY created_at ASC LIMIT 1`,
      [user.id]
    );
    const workspace = workspaceResult.rows[0] ?? null;

    const token = signToken({
      userId: user.id,
      email: user.email,
      workspaceId: workspace ? workspace.id : null,
    });

    res.json({
      token,
      user: publicUser(user),
      workspace,
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
}

// ---- GET /api/auth/me (protected) ----
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const userResult = await pool.query<UserRow>(
      `SELECT id, email, name, password_hash, created_at FROM users WHERE id = $1`,
      [req.user.userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const workspacesResult = await pool.query<WorkspaceRow>(
      `SELECT id, name, owner_id, plan, created_at
       FROM workspaces WHERE owner_id = $1
       ORDER BY created_at ASC`,
      [user.id]
    );

    res.json({
      user: publicUser(user),
      workspaces: workspacesResult.rows,
    });
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
}

// ---- POST /api/auth/logout ----
export async function logout(_req: Request, res: Response): Promise<void> {
  // JWTs are stateless; logout is handled client-side by discarding the token.
  res.json({ success: true });
}
