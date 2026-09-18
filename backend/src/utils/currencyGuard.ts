/**
 * ROAS valyuta qatlami.
 *
 * MUAMMO (real ma'lumotda topilgan):
 *   ROAS = revenue / spend
 *   revenue → CRM valyutasi (UZS), spend → reklama akkaunti valyutasi (USD)
 * Ya'ni formula SO'MNI DOLLARGA bo'lardi. Voronka endpointi 6558x qaytardi;
 * haqiqiy ko'rsatkich ~23x edi. Farq ~12 600 barobar — bu shunchaki kurs.
 *
 * QOIDA (uch holat, aralashmaydi):
 *   1. Valyutalar teng          → ROAS to'g'ridan-to'g'ri hisoblanadi.
 *   2. Teng emas, kurs bor      → xarajat CRM valyutasiga o'giriladi,
 *                                 ROAS hisoblanadi, kurs va sanasi aytiladi.
 *   3. Teng emas, kurs yo'q     → ROAS = null. Taxmin QILINMAYDI.
 *
 * Nega taxmin yo'q: noto'g'ri raqam yo'q raqamdan battar. 6558x ko'rgan
 * operator byudjetni oshiradi, "—" ko'rgan operator tekshiradi. Bu
 * mahsulotning o'z qoidasiga mos: ikki reklama bir xil nomda bo'lsa ham
 * atribusiya taxmin qilinmaydi, "noaniq" deb belgilanadi.
 *
 * `fb_currency` NULL bo'lsa to'smaymiz: bu "boshqa valyuta" emas, "hali
 * bilmaymiz" degani. syncWorkspace uni birinchi sync'da to'ldiradi.
 */
import { pool } from '../db/pool';
import { getFxRate } from '../services/fxRates';

export interface CurrencyGuard {
  /** Reklama akkaunti valyutasi (FB). */
  fb: string | null;
  /** CRM daromadi valyutasi (workspace). */
  crm: string | null;
  /** Valyutalar teng emasmi. */
  mismatch: boolean;
  /** 1 fb = rate crm. Kurs topilmasa null. */
  rate: number | null;
  /** Kurs qaysi kunga tegishli. */
  rateDate: string | null;
  /** Kurs manbasi (cbu.uz). */
  rateSource: string | null;
  /** ROAS hisoblanyaptimi (teng valyuta yoki kurs mavjud). */
  canComputeRoas: boolean;
  /** UI ko'rsatadigan izoh yoki ogohlantirish. */
  reason: string | null;
}

const OK: CurrencyGuard = {
  fb: null,
  crm: null,
  mismatch: false,
  rate: null,
  rateDate: null,
  rateSource: null,
  canComputeRoas: true,
  reason: null,
};

function norm(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim().toUpperCase();
  return s.length ? s : null;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export async function loadCurrencyGuard(workspaceId: string): Promise<CurrencyGuard> {
  try {
    const { rows } = await pool.query<{ fb_currency: string | null; currency: string | null }>(
      `SELECT fb_currency, currency FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    const fb = norm(rows[0]?.fb_currency);
    const crm = norm(rows[0]?.currency);

    // Bilinmaganda yoki teng bo'lganda hisob o'zgarmaydi.
    if (!fb || !crm || fb === crm) {
      return { ...OK, fb, crm };
    }

    const fx = await getFxRate(fb, crm);
    if (!fx) {
      return {
        fb,
        crm,
        mismatch: true,
        rate: null,
        rateDate: null,
        rateSource: null,
        canComputeRoas: false,
        reason:
          `Reklama akkaunti ${fb}, CRM daromadi ${crm}. ` +
          `Kurs bazada yo'q — ROAS hisoblanmaydi.`,
      };
    }

    return {
      fb,
      crm,
      mismatch: true,
      rate: fx.rate,
      rateDate: fx.date,
      rateSource: fx.source,
      canComputeRoas: true,
      reason:
        `Xarajat ${fb} da, daromad ${crm} da. ` +
        `ROAS kurs bo'yicha hisoblandi: 1 ${fb} = ${fmt(fx.rate)} ${crm} ` +
        `(${fx.source}, ${fx.date}).`,
    };
  } catch (err) {
    // Fail-soft: qo'riqchi ishlamasa sahifa yiqilmasin.
    console.error('currency guard failed (fail-soft):', (err as Error).message);
    return OK;
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Xarajatni CRM valyutasiga o'giradi. Kurs kerak bo'lmasa (teng valyuta)
 * o'zgarishsiz qaytaradi, kurs yo'q bo'lsa null.
 */
export function spendInCrmCurrency(spend: unknown, guard: CurrencyGuard): number | null {
  if (!guard.mismatch) return num(spend);
  if (guard.rate === null) return null;
  return num(spend) * guard.rate;
}

/** Bitta qatordagi `roas` ni kursga ko'ra qayta hisoblaydi. */
export function applyRoas<T extends Record<string, unknown>>(row: T, guard: CurrencyGuard): T {
  if (!guard.mismatch || !row || !('roas' in row)) return row;

  // Kurs yo'q — raqam chiqarilmaydi.
  if (guard.rate === null) return { ...row, roas: null };

  // Kurs bor — xarajatni CRM valyutasiga o'girib qayta bo'lamiz.
  // SQL dagi roas bu yerda ishlatilmaydi: u xom (noto'g'ri) nisbat.
  const spend = num(row.spend) * guard.rate;
  const revenue = num(row.revenue);
  return { ...row, roas: spend > 0 ? revenue / spend : null };
}

/** Qator ro'yxati uchun. */
export function applyRoasAll<T extends Record<string, unknown>>(
  rows: T[],
  guard: CurrencyGuard
): T[] {
  if (!guard.mismatch) return rows;
  return rows.map((r) => applyRoas(r, guard));
}

/** Javobga qo'shiladigan valyuta bloki — UI shu asosda izoh chizadi. */
export function currencyMeta(guard: CurrencyGuard) {
  return {
    fb: guard.fb,
    crm: guard.crm,
    mismatch: guard.mismatch,
    converted: guard.mismatch && guard.rate !== null,
    rate: guard.rate,
    rateDate: guard.rateDate,
    rateSource: guard.rateSource,
    reason: guard.reason,
  };
}
