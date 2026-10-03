import '../utils/axiosXavfsiz';
/**
 * Natijasi noma'lum to'lovni qo'lda hal qilish.
 *
 *   npm run billing:hal                      → ochiq (pending/unknown) to'lovlar ro'yxati
 *   npm run billing:hal -- <tolov_id> paid   → provayder kabinetida PUL TUSHGAN bo'lsa
 *   npm run billing:hal -- <tolov_id> failed → pul TUSHMAGAN bo'lsa
 *
 * ⚠ Avval Payme/Click kabinetida tekshiring. "paid" — obunani uzaytiradi;
 *   "failed" — davrni bo'shatadi va keyingi cron qayta yechishi mumkin.
 *   Noto'g'ri tanlov = mijozdan ikki marta pul olish yoki bepul oy.
 */
import dotenv from 'dotenv';
dotenv.config();
import { pool } from '../db/pool';
import { tolovniQoldaHalQil } from '../services/billing/obuna';

async function main(): Promise<void> {
  const [id, natija] = process.argv.slice(2);
  if (!id) {
    const { rows } = await pool.query(
      `SELECT p.id, p.status, p.provider, p.provider_ref, p.amount_uzs, p.kind, p.created_at, w.name
         FROM billing_payments p JOIN workspaces w ON w.id = p.workspace_id
        WHERE p.status IN ('pending', 'unknown') ORDER BY p.created_at`
    );
    if (!rows.length) console.log("Ochiq to'lov yo'q.");
    else console.table(rows);
    return;
  }
  if (natija !== 'paid' && natija !== 'failed') {
    console.error('Ikkinchi argument: paid | failed');
    process.exitCode = 1;
    return;
  }
  const ok = await tolovniQoldaHalQil(id, natija);
  console.log(ok ? `✓ ${id} → ${natija}` : `To'lov topilmadi yoki allaqachon yopilgan: ${id}`);
}

main()
  .catch((err) => {
    console.error('Xato:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
