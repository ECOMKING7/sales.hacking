/**
 * Login urinishlarini cheklash.
 *
 * NEGA BAZADA: Vercel'da har so'rov boshqa nusxada ishlashi mumkin,
 * shuning uchun xotiradagi hisoblagich (pixelController'dagi Map kabi)
 * serverless'da deyarli hech narsa to'smaydi. Bazadagi hisoblagich
 * hamma nusxa uchun bitta haqiqat.
 *
 * MAXFIYLIK: email va IP xom holda saqlanmaydi — ikkisi birga
 * SHA-256 qilinadi. Jadvaldan kim uringanini chiqarib bo'lmaydi.
 *
 * FAIL-OPEN: baza javob bermasa foydalanuvchi kira oladi. Aks holda
 * bazadagi vaqtinchalik muammo hamma uchun login'ni yopib qo'yadi —
 * bu brute-force'dan ko'ra qimmatga tushadi.
 */
import crypto from 'crypto';
import { pool } from '../db/pool';

/** Shu oyna ichida ruxsat etilgan muvaffaqiyatsiz urinishlar soni. */
const MAX_FAILURES = 10;
/** Oyna uzunligi (daqiqa). */
const WINDOW_MIN = 15;
/** Shu muddatdan eski yozuvlar keraksiz. */
const RETENTION_HOURS = 24;

function keyOf(email: string, ip: string): string {
  return crypto
    .createHash('sha256')
    .update(`${email.trim().toLowerCase()}|${ip}`)
    .digest('hex');
}

/** So'rovdan haqiqiy IP. Proksi ortida x-forwarded-for birinchi qiymati. */
export function clientIp(headers: Record<string, unknown>, fallback?: string): string {
  const fwd = headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return fallback ?? 'unknown';
}

export interface ThrottleState {
  blocked: boolean;
  /** Blok tugashiga necha soniya qoldi — javobda Retry-After uchun. */
  retryAfterSec: number;
}

/** Bu juftlik hozir bloklanganmi? */
export async function checkLoginThrottle(
  email: string,
  ip: string
): Promise<ThrottleState> {
  try {
    const { rows } = await pool.query<{ n: string; oldest: Date | null }>(
      `SELECT COUNT(*)::text AS n, MIN(attempted_at) AS oldest
         FROM login_attempts
        WHERE key_hash = $1
          AND attempted_at > now() - make_interval(mins => $2::int)`,
      [keyOf(email, ip), WINDOW_MIN]
    );

    const n = Number(rows[0]?.n ?? 0);
    if (n < MAX_FAILURES) return { blocked: false, retryAfterSec: 0 };

    const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : Date.now();
    const freeAt = oldest + WINDOW_MIN * 60_000;
    return {
      blocked: true,
      retryAfterSec: Math.max(1, Math.ceil((freeAt - Date.now()) / 1000)),
    };
  } catch (err) {
    // Fail-open: baza yiqilsa login butunlay yopilib qolmasin.
    console.error('login throttle check failed (fail-open):', (err as Error).message);
    return { blocked: false, retryAfterSec: 0 };
  }
}

/** Muvaffaqiyatsiz urinishni yozish. */
export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO login_attempts (key_hash) VALUES ($1)`,
      [keyOf(email, ip)]
    );
    // Opportunistik tozalash: alohida cron kerak bo'lmasin.
    // 1% so'rovda ishlaydi, ya'ni yuklama sezilmaydi.
    if (Math.random() < 0.01) {
      await pool.query(
        `DELETE FROM login_attempts
          WHERE attempted_at < now() - make_interval(hours => $1::int)`,
        [RETENTION_HOURS]
      );
    }
  } catch (err) {
    console.error('login failure not recorded:', (err as Error).message);
  }
}

/** Muvaffaqiyatli kirishdan keyin hisoblagichni tozalash. */
export async function clearLoginFailures(email: string, ip: string): Promise<void> {
  try {
    await pool.query(`DELETE FROM login_attempts WHERE key_hash = $1`, [keyOf(email, ip)]);
  } catch (err) {
    console.error('login failures not cleared:', (err as Error).message);
  }
}
