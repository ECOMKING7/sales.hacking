import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// Derive a fixed 32-byte key from ENCRYPTION_KEY so any reasonable secret works,
// while still honouring the configured value.
const rawKey = process.env.ENCRYPTION_KEY;
if (!rawKey) {
  throw new Error('ENCRYPTION_KEY is not set in environment');
}
const KEY = crypto.createHash('sha256').update(rawKey).digest(); // 32 bytes

/**
 * Encrypt a UTF-8 string. Output format: "<iv-hex>:<ciphertext-hex>".
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a value produced by encrypt().
 */
export function decrypt(payload: string): string {
  const [ivHex, dataHex] = payload.split(':');
  if (!ivHex || !dataHex) {
    throw new Error('Invalid encrypted payload format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
