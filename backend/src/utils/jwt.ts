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
  return jwt.verify(token, JWT_SECRET as string) as JwtPayload;
}

// ---- OAuth state (CSRF + workspace binding for the FB callback) ----
export interface OAuthStatePayload {
  userId: string;
  workspaceId: string | null;
}

export function signOAuthState(payload: OAuthStatePayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: '10m' });
}

export function verifyOAuthState(token: string): OAuthStatePayload {
  return jwt.verify(token, JWT_SECRET as string) as OAuthStatePayload;
}
