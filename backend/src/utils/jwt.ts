import jwt, { SignOptions } from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export interface JwtPayload {
  userId: string;
  email: string;
  workspaceId: string | null;
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  // Fail fast — a missing secret would silently make tokens forgeable.
  throw new Error('JWT_SECRET is not set in environment');
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);
}

export function verifyTokenString(token: string): JwtPayload {
  const p = jwt.verify(token, JWT_SECRET as string) as JwtPayload & { typ?: string };
  // OAuth state va amoCRM da'vo kaliti ham shu sir bilan imzolanadi va
  // URL orqali uchinchi tomonlardan o'tadi. Ular SESSIYA sifatida
  // qabul qilinmasligi kerak: sessiya tokenida `typ` yo'q va `email` bor.
  if (p.typ || !p.email) throw new Error('Not a session token');
  return p;
}

// ---- OAuth state (CSRF + workspace binding for the FB callback) ----
export interface OAuthStatePayload {
  userId: string;
  workspaceId: string | null;
  /**
   * amoCRM: ulanish qaysi kalit bilan boshlangani. Callback aynan shu
   * kalit bilan almashtirishi kerak (redirect_uri ham kalitga bog'liq).
   */
  amo?: 'public' | 'private' | 'legacy';
  /** Facebook: ulanish popup oynada boshlangan — callback oynani yopadi. */
  popup?: boolean;
}

export function signOAuthState(payload: OAuthStatePayload): string {
  return jwt.sign({ ...payload, typ: 'oauth-state' }, JWT_SECRET as string, {
    expiresIn: '10m',
  });
}

export function verifyOAuthState(token: string): OAuthStatePayload {
  const p = jwt.verify(token, JWT_SECRET as string) as OAuthStatePayload & {
    typ?: string;
    email?: string;
  };
  // Sessiya tokeni yoki da'vo kaliti state o'rnida ishlamasin.
  // (Eski, typ'siz state'lar 10 daqiqada o'ladi — ularni ham qabul qilamiz.)
  if (p.typ && p.typ !== 'oauth-state') throw new Error('Not an OAuth state');
  if (p.email) throw new Error('Not an OAuth state');
  return {
    userId: p.userId,
    workspaceId: p.workspaceId,
    amo: p.amo,
    ...(p.popup === true ? { popup: true } : {}),
  };
}

// ---- amoMarket o'rnatish "da'vo" kaliti ----
//
// amoMarket'dan o'rnatilganda bizda foydalanuvchi yo'q (state kelmaydi).
// Tokenlar vaqtincha `amocrm_pending_installs` ga yoziladi, brauzer esa
// shu imzolangan kalit bilan saytga yuboriladi. Foydalanuvchi kirgach
// kalit orqali o'rnatmani o'z workspace'iga biriktiradi.
// 15 daqiqa: ro'yxatdan o'tishga yetadi, URL tarixida qolsa ham tez eskiradi.
export interface AmoClaimPayload {
  typ: 'amo-claim';
  pid: string;
}

export function signAmoClaim(pendingId: string): string {
  const payload: AmoClaimPayload = { typ: 'amo-claim', pid: pendingId };
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: '15m' });
}

export function verifyAmoClaim(token: string): AmoClaimPayload {
  const p = jwt.verify(token, JWT_SECRET as string) as Partial<AmoClaimPayload>;
  if (p.typ !== 'amo-claim' || typeof p.pid !== 'string') {
    throw new Error('Invalid claim token');
  }
  return { typ: 'amo-claim', pid: p.pid };
}
