import axios from 'axios';

import { GRAPH_URL, OAUTH_DIALOG_URL as OAUTH_DIALOG } from '../config/graph';

// Read-only scope is enough to list ad accounts and pull insights.
// (email isn't needed and isn't a standard scope for the Marketing API app.)
//
// Eslatma: Marketing API use case'li app'da login "Facebook Login for
// Business" orqali ketadi. U `scope=` emas, `config_id=` kutadi — config
// ichida ruxsatlar oldindan yozilgan. FB_LOGIN_CONFIG_ID qo'yilsa o'sha
// ishlatiladi; bo'lmasa eski (klassik Facebook Login) yo'liga tushadi.
const SCOPES = ['ads_read'];

function appId(): string {
  const id = process.env.FB_APP_ID;
  if (!id) throw new Error('FB_APP_ID is not set');
  return id;
}

function appSecret(): string {
  const secret = process.env.FB_APP_SECRET;
  if (!secret) throw new Error('FB_APP_SECRET is not set');
  return secret;
}

function redirectUri(): string {
  const uri = process.env.FB_REDIRECT_URI;
  if (!uri) throw new Error('FB_REDIRECT_URI is not set');
  return uri;
}

export interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  business_name?: string;
}

export interface LongLivedToken {
  accessToken: string;
  expiresIn: number; // seconds until expiry
}

/**
 * Build the Facebook OAuth dialog URL. `state` is an opaque, signed value used
 * to tie the callback back to the initiating user/workspace and guard CSRF.
 */
export function generateAuthURL(state: string): string {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri(),
    state,
    response_type: 'code',
  });

  const configId = process.env.FB_LOGIN_CONFIG_ID?.trim();
  if (configId) {
    // Facebook Login for Business — ruxsatlar config ichida.
    // `scope` bilan birga yuborilsa FB xato beradi, shuning uchun yo u, yo bu.
    params.set('config_id', configId);
  } else {
    params.set('scope', SCOPES.join(','));
  }

  return `${OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchange the OAuth `code` for a long-lived (≈60 day) access token.
 */
export async function exchangeCodeForToken(code: string): Promise<LongLivedToken> {
  // 1. code -> short-lived token
  const shortRes = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
    params: {
      client_id: appId(),
      client_secret: appSecret(),
      redirect_uri: redirectUri(),
      code,
    },
  });
  const shortToken: string = shortRes.data.access_token;

  // 2. short-lived -> long-lived token
  const longRes = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId(),
      client_secret: appSecret(),
      fb_exchange_token: shortToken,
    },
  });

  return {
    accessToken: longRes.data.access_token as string,
    // FB returns expires_in for long-lived tokens (~5,184,000s = 60 days).
    expiresIn: Number(longRes.data.expires_in) || 60 * 24 * 60 * 60,
  };
}

export interface FbUserProfile {
  id: string;
  name: string;
}

/**
 * Fetch the Facebook user's basic profile (id + name).
 */
export async function getFbUserProfile(accessToken: string): Promise<FbUserProfile> {
  const res = await axios.get(`${GRAPH_URL}/me`, {
    params: { fields: 'id,name', access_token: accessToken },
  });
  return res.data as FbUserProfile;
}

/**
 * Fetch the ad accounts the authenticated user can access.
 */
export async function getAdAccounts(accessToken: string): Promise<AdAccount[]> {
  const res = await axios.get(`${GRAPH_URL}/me/adaccounts`, {
    params: {
      fields: 'id,account_id,name,account_status,currency,business_name',
      access_token: accessToken,
      limit: 100,
    },
  });
  return (res.data.data ?? []) as AdAccount[];
}
