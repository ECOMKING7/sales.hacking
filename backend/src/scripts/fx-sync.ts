/**
 * Kursni qo'lda yangilash.
 *
 *   npm run fx:sync
 *
 * Natija:
 *   Kurs yangilandi: 2026-09-17 — 22 ta valyuta
 *   1 USD = 11797.46 UZS
 *
 * Cron ishlamay qolgan bo'lsa yoki yangi muhitni birinchi marta
 * to'ldirishda shu skript ishlatiladi. Qayta ishga tushirish xavfsiz:
 * bir kun uchun bitta yozuv (UPSERT).
 */
import { pool } from '../db/pool';
import { syncFxRates, getFxRate } from '../services/fxRates';

async function main(): Promise<void> {
  const { saved, date } = await syncFxRates();
  console.log(`Kurs yangilandi: ${date ?? 'sana yo\'q'} — ${saved} ta valyuta`);

  const usd = await getFxRate('USD', 'UZS');
  if (usd) {
    console.log(`1 USD = ${usd.rate} UZS  (${usd.source}, ${usd.date})`);
  } else {
    console.log('⚠ USD/UZS kursi topilmadi — manba shaklini tekshiring.');
  }
}

main()
  .catch((err) => {
    console.error('Kurs yangilanmadi:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
