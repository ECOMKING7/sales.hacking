import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Kalit MODUL YUKLANGANDA emas, BIRINCHI ISHLATILGANDA tekshiriladi.
 *
 * NEGA — buni CI birinchi ishga tushishidayoq topdi: bu yerda
 * modul darajasida `throw` turardi, ya'ni ENCRYPTION_KEY yo'q bo'lsa
 * shu faylni bilvosita import qilgan HAR QANDAY narsa yiqilardi.
 * Testlar shifrlashga umuman tegmaydi, lekin amocrmService orqali
 * import zanjiriga tushgani uchun butun to'plam ishga tushmadi.
 *
 * Bu faqat testning muammosi emas: kalit talab qilmaydigan skript
 * (masalan kurs yangilash) ham shu sababdan ishga tushmasdi.
 *
 * Qoida: yetishmagan sozlama O'ZI KERAK BO'LGAN JOYDA yiqilsin,
 * import paytida emas.
 */
let KEY: Buffer | null = null;

function kalit(): Buffer {
  if (KEY) return KEY;
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY is not set in environment');
  }
  // Har qanday uzunlikdagi sirdan qat'iy 32 baytli kalit.
  KEY = crypto.createHash('sha256').update(rawKey).digest();
  return KEY;
}

/**
 * Encrypt a UTF-8 string. Output format: "<iv-hex>:<ciphertext-hex>".
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, kalit(), iv);
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
  const decipher = crypto.createDecipheriv(ALGORITHM, kalit(), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
