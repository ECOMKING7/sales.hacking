/**
 * ROAS valyuta qo'riqchisi.
 *
 * MUAMMO (real ma'lumotda topilgan):
 *   ROAS = revenue / spend
 *   revenue → CRM valyutasi (UZS), spend → reklama akkaunti valyutasi (USD)
 * Ya'ni formula SO'MNI DOLLARGA bo'lardi. Voronka endpointi 6558x qaytardi;
 * haqiqiy ko'rsatkich ~23x edi. Farq ~12 600 barobar — kurs.
 *
 * QOIDA: valyutalar teng bo'lmasa ROAS hisoblanmaydi, `null` qaytadi va
 * sabab aytiladi. Noto'g'ri raqam yo'q raqamdan battar: 6558x ko'rgan
 * operator byudjetni oshiradi, "—" ko'rgan operator tekshiradi.
 *
 * `fb_currency` hali NULL bo'lsa (eski workspace, sync bo'lmagan) —
 * to'smaymiz, chunki bu "boshqa valyuta" degani emas, "hali bilmaymiz"
 * degani. Sync har 15 daqiqada uni to'ldiradi.
 *
 * Kunlik kurs qatlami keyingi qadam; shunda bu qo'riqchi konvertatsiyaga
 * o'rin bo'shatadi.
 */
import { pool } from '../db/pool';

export interface CurrencyGuard {
  /** Reklama akkaunti valyutasi (FB). */
  fb: string | null;
  /** CRM daromadi valyutasi (workspace). */
  crm: string | null;
  /** Teng emasmi — shu holda ROAS chiqarilmaydi. */
  mismatch: boolean;
  /** UI ko'rsatadigan sabab. Mos bo'lsa null. */
  reason: string | null;
}

const OK: CurrencyGuard = { fb: null, crm: null, mismatch: false, reason: null };

function norm(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim().toUpperCase();
  return s.length ? s : null;
}

export async function loadCurrencyGuard(workspaceId: string): Promise<CurrencyGuard> {
  try {
    const { rows } = await pool.query<{ fb_currency: string | null; currency: string | null }>(
      `SELECT fb_currency, currency FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    const fb = norm(rows[0]?.fb_currency);
    const crm = norm(rows[0]?.currency);

    if (!fb || !crm || fb === crm) return { fb, crm, mismatch: false, reason: null };

    return {
      fb,
      crm,
      mismatch: true,
      reason:
        `Reklama akkaunti ${fb}, CRM daromadi ${crm}. ` +
        `Kurs sozlanmagani uchun ROAS hisoblanmaydi.`,
    };
  } catch (err) {
    // Fail-soft: qo'riqchi ishlamasa sahifa yiqilmasin. Bu holda ROAS
    // eski holicha chiqadi — migratsiya qo'llanmagan dev bazada shunday.
    console.error('currency guard failed (fail-soft):', (err as Error).message);
    return OK;
  }
}

/** Bitta obyektdagi `roas` ni o'chiradi (mos bo'lmasa). */
export function guardRoas<T extends Record<string, unknown>>(row: T, guard: CurrencyGuard): T {
  if (!guard.mismatch || !row || !('roas' in row)) return row;
  return { ...row, roas: null };
}

/** Qator ro'yxatidagi `roas` ni o'chiradi (mos bo'lmasa). */
export function guardRoasAll<T extends Record<string, unknown>>(
  rows: T[],
  guard: CurrencyGuard
): T[] {
  if (!guard.mismatch) return rows;
  return rows.map((r) => guardRoas(r, guard));
}

/** Javobga qo'shiladigan valyuta bloki — UI shu asosda ogohlantirish chizadi. */
export function currencyMeta(guard: CurrencyGuard) {
  return {
    fb: guard.fb,
    crm: guard.crm,
    mismatch: guard.mismatch,
    reason: guard.reason,
  };
}
