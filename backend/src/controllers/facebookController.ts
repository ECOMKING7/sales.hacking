import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { encrypt } from '../utils/encryption';
import { signOAuthState, verifyOAuthState } from '../utils/jwt';
import {
  generateAuthURL,
  exchangeCodeForToken,
  getAdAccounts,
} from '../services/facebookOAuth';

function frontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// ---- GET /api/auth/facebook/connect (protected) ----
export async function connect(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!req.user.workspaceId) {
    res.status(400).json({ error: 'No workspace associated with this account' });
    return;
  }

  const state = signOAuthState({
    userId: req.user.userId,
    workspaceId: req.user.workspaceId,
  });
  const url = generateAuthURL(state);
  res.json({ url });
}

// ---- GET /api/auth/facebook/callback (public; called by Facebook redirect) ----
export async function callback(req: Request, res: Response): Promise<void> {
  const redirectTo = (status: string) =>
    res.redirect(`${frontendUrl()}/settings?fb=${status}`);

  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    redirectTo('denied');
    return;
  }
  if (!code || !state) {
    redirectTo('error');
    return;
  }

  let workspaceId: string | null;
  try {
    ({ workspaceId } = verifyOAuthState(state));
  } catch {
    redirectTo('error');
    return;
  }
  if (!workspaceId) {
    redirectTo('error');
    return;
  }

  try {
    const { accessToken, expiresIn } = await exchangeCodeForToken(code);

    // Validate the token actually grants ad access before persisting it.
    await getAdAccounts(accessToken);

    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const encryptedToken = encrypt(accessToken);

    await pool.query(
      `UPDATE workspaces
         SET fb_access_token = $1,
             fb_token_expires_at = $2,
             updated_at = now()
       WHERE id = $3`,
      [encryptedToken, expiresAt, workspaceId]
    );

    redirectTo('connected');
  } catch (err) {
    console.error('facebook callback error:', err);
    redirectTo('error');
  }
}
