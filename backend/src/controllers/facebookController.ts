import { Request, Response } from 'express';
import { frontendUrl } from '../utils/frontendUrl';
import { pool } from '../db/pool';
import { encrypt } from '../utils/encryption';
import { signOAuthState, verifyOAuthState } from '../utils/jwt';
import {
  generateAuthURL,
  exchangeCodeForToken,
} from '../services/facebookOAuth';
import { sahifalarniYangila } from '../services/metaSahifalar';
import { runInBackground } from '../utils/background';


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
  /* Popup → SPA emas, 1 KB'lik statik sahifa (frontend/public/oauth-done.html):
     JS bundle (≈260 KB) yuklanmaydi, natija darhol ko'rinadi va oyna yopiladi. */
  const redirectTo = (status: string) =>
    res.redirect(
      popup
        ? `${frontendUrl()}/oauth-done.html?fb=${status}`
        : `${frontendUrl()}/settings?fb=${status}`
    );

  const { code, state, error } = req.query as Record<string, string | undefined>;

  /* STATE BIRINCHI tekshiriladi — `popup` belgisi shunda. Ilgari `error`
     (foydalanuvchi "Cancel" bosdi) undan oldin qaytardi: popup=false bo'lib
     qolardi, popup ichida butun sayt ochilib, yopilmay turardi va asosiy
     oyna natijani bilmasdi. */
  let userId = '';
  let stateOk = false;
  if (state) {
    try {
      const st = verifyOAuthState(state);
      userId = st.userId;
      popup = Boolean(st.popup);
      stateOk = true;
    } catch {
      /* imzosi yaroqsiz — pastda 'error' */
    }
  }

  if (error) {
    redirectTo('denied');
    return;
  }
  if (!code || !stateOk || !userId) {
    redirectTo('error');
    return;
  }

  try {
    const { accessToken, expiresIn } = await exchangeCodeForToken(code);

    /* Alohida "token ishlaydimi" so'rovi yo'q: Facebook uzoq muddatli
       tokenni bergan bo'lsa — u yaroqli. Ilgari bu yerda to'liq
       getAdAccounts (50 tagacha ketma-ket so'rov) kutilardi — popup
       "Got it"dan keyin 10+ soniya qora turardi. Akkauntlar ro'yxatini
       sozlamalar oynasi o'zi yuklaydi. */

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
    /* 20 sahifa = obuna POST'lari + shifrlab yozish — bir necha soniya.
       Foydalanuvchini UMUMAN kuttirmaymiz: to'liq fonda (Vercel waitUntil).
       Frontend sahifalar ro'yxatini 3 s va 8 s da qayta so'raydi. */
    void runInBackground(
      sahifalarniYangila(userId, accessToken).then(
        (sahifalar) =>
          console.log(`facebook callback: ${sahifalar.length} sahifa, ${sahifalar.filter((x) => x.leadgenObuna).length} tasi leadgen'ga obuna`),
        (err) => console.warn('facebook callback: sahifalar yangilanmadi —', (err as Error).message)
      ),
      'fb-callback-sahifalar'
    );

    redirectTo('connected');
  } catch (err) {
    console.error('facebook callback error:', err);
    redirectTo('error');
  }
}
