import { Request, Response } from 'express';
import { frontendUrl } from '../utils/frontendUrl';
import { pool } from '../db/pool';
import { encrypt } from '../utils/encryption';
import { signOAuthState, verifyOAuthState } from '../utils/jwt';
import {
  generateAuthURL,
  exchangeCodeForToken,
  getAdAccounts,
} from '../services/facebookOAuth';
import { sahifalarniYangila } from '../services/metaSahifalar';


// ---- GET /api/auth/facebook/connect (protected) ----
export async function connect(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Token is stored per-user, so workspaceId is not needed in the state.
  const state = signOAuthState({
    userId: req.user.userId,
    workspaceId: null,
    popup: req.query.popup === '1',
  });
  const url = generateAuthURL(state);
  res.json({ url });
}

// ---- GET /api/auth/facebook/callback (public; called by Facebook redirect) ----
export async function callback(req: Request, res: Response): Promise<void> {
  let popup = false;
  const redirectTo = (status: string) =>
    res.redirect(`${frontendUrl()}/settings?fb=${status}${popup ? '&popup=1' : ''}`);

  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    redirectTo('denied');
    return;
  }
  if (!code || !state) {
    redirectTo('error');
    return;
  }

  let userId: string;
  try {
    const st = verifyOAuthState(state);
    userId = st.userId;
    popup = Boolean(st.popup);
  } catch {
    redirectTo('error');
    return;
  }
  if (!userId) {
    redirectTo('error');
    return;
  }

  try {
    const { accessToken, expiresIn } = await exchangeCodeForToken(code);

    // Validate the token actually grants ad access before persisting it.
    await getAdAccounts(accessToken);

    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const encryptedToken = encrypt(accessToken);

    // Token is saved on the user — one token covers ALL their workspaces.
    await pool.query(
      `UPDATE users
         SET fb_access_token = $1,
             fb_token_expires_at = $2,
             updated_at = now()
       WHERE id = $3`,
      [encryptedToken, expiresAt, userId]
    );

    /* Lead Ads: sahifa tokenlari + leadgen obunasi. FAIL-SOFT — mijoz
       sahifa tanlamagan yoki ruxsat yo'q bo'lsa Facebook ulanishi
       baribir muvaffaqiyatli. */
    try {
      const sahifalar = await sahifalarniYangila(userId, accessToken);
      console.log(`facebook callback: ${sahifalar.length} sahifa, ${sahifalar.filter((x) => x.leadgenObuna).length} tasi leadgen'ga obuna`);
    } catch (err) {
      console.warn('facebook callback: sahifalar yangilanmadi —', (err as Error).message);
    }

    redirectTo('connected');
  } catch (err) {
    console.error('facebook callback error:', err);
    redirectTo('error');
  }
}
