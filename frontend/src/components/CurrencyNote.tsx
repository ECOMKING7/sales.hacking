/**
 * Valyuta qatori — ROAS ustuni ostidagi haqiqat.
 *
 * Uch holat, uchtasi boshqacha ko'rinadi:
 *   1. Valyutalar teng          → hech narsa chizilmaydi.
 *   2. Kurs bo'yicha hisoblandi → kulrang izoh: qaysi kurs, qaysi kun.
 *   3. Kurs yo'q                → sariq ogohlantirish, ROAS ustuni bo'sh.
 *
 * Nega izoh kerak: 2-holatda raqam bor, lekin u KURSGA tayangan. Kurs
 * manbasi va sanasi ko'rinmasa, operator raqamni "aniq" deb qabul
 * qiladi. Bank sotuv kursi CBU kursidan 1–3% farq qiladi — ya'ni bu
 * yerdagi ROAS biroz optimistik.
 */
import { AlertTriangle, ArrowLeftRight } from 'lucide-react';
import type { CurrencyState } from '../types';

function fmtRate(v: number | null): string {
  if (v === null) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function CurrencyNote({
  state,
  className = '',
}: {
  state?: CurrencyState;
  className?: string;
}) {
  if (!state || !state.mismatch) return null;

  // Kurs topilmagan: raqam yo'q, sabab aytiladi.
  if (!state.converted) {
    return (
      <div
        className={`flex items-start gap-2 rounded-md border-[1.5px] border-warn/40 bg-warn/5 px-3 py-2.5 text-sm ${className}`}
      >
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 flex-none text-warn" />
        <div className="text-ink-2">
          <span className="font-medium text-ink">
            {state.reason ?? 'Valyutalar mos emas — ROAS hisoblanmadi.'}
          </span>{' '}
          Boshqa ustunlar (xarajat, lid, CPL, CAC) o'z valyutasida to'g'ri qoladi.
        </div>
      </div>
    );
  }

  // Kurs bo'yicha hisoblangan: raqam bor, lekin qaysi kursga tayangani
  // ko'rinib tursin.
  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm ${className}`}
    >
      <ArrowLeftRight aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-ink-3" />
      <div className="text-ink-2">
        ROAS kurs bo'yicha hisoblangan:{' '}
        <span className="font-medium tabular-nums text-ink">
          1 {state.fb} = {fmtRate(state.rate)} {state.crm}
        </span>{' '}
        <span className="text-ink-3">
          ({state.rateSource ?? 'manba noma\'lum'}, {state.rateDate ?? '—'})
        </span>
        . Xarajat ustuni {state.fb} da qoladi — Ads Manager bilan solishtirish uchun.
      </div>
    </div>
  );
}
