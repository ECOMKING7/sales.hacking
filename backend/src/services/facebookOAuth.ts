import axios from 'axios';

const GRAPH_VERSION = 'v19.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

const SCOPES = ['ads_management', 'ads_read', 'business_management', 'email'];

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
    scope: SCOPES.join(','),
  });
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

/**
 * Fetch the ad accounts the authenticated user can access.
 */
export async function getAdAccounts(accessToken: string): Promise<AdAccount[]> {
  const res = await axios.get(`${GRAPH_URL}/me/adaccounts`, {
    params: {
      fields: 'id,account_id,name,account_status,currency',
      access_token: accessToken,
      limit: 100,
    },
  });
  return (res.data.data ?? []) as AdAccount[];
}
