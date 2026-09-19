/**
 * Raqamlar qaysi rejimda hisoblangani — jadval tepasidagi chiziq.
 *
 * NEGA KERAK: bitta jadvalda ikki xil ma'noli raqam bo'lishi mumkin.
 * Xarajat va lid tanlangan kunlar bo'yicha, daromad va ROAS esa umuman
 * hisoblanmagan (`—`). Buni aytmasak foydalanuvchi `—` ni "nol" deb
 * o'qiydi yoki xarajatni butun davrniki deb o'ylaydi.
 *
 * Qamrov ham shu yerda: kunlik tarix faqat ma'lum oraliqni qamraydi.
 * Undan tashqarida tanlansa jadval bo'm-bo'sh chiqadi va sabab
 * ko'rinmasa bu "ma'lumot yo'q" deb tushuniladi — aslida "hali
 * yuklanmagan".
 */
import { CalendarRange, Info } from 'lucide-react';
import { cn } from '../ui';

export interface VaqtHolati {
  rejim: 'kunlik' | 'butun_davr';
  from: string | null;
  to: string | null;
  qamrov: { start: string | null; end: string | null };
  izoh: string;
}

/** "2026-09-17" → "17.09.2026". Boshqa shakl kelsa o'zicha qaytadi. */
function uz(d: string | null): string {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}

export default function VaqtNote({
  state,
  className,
}: {
  state?: VaqtHolati;
  className?: string;
}) {
  if (!state) return null;

  const kunlik = state.rejim === 'kunlik';

  /**
   * Tanlangan oraliq kunlik tarix qamrovidan tashqaridami.
   * Sana matnlari `YYYY-MM-DD` — ularni satr sifatida solishtirish
   * to'g'ri ishlaydi va vaqt zonasi muammosi tug'ilmaydi.
   */
  const tashqarida =
    kunlik &&
    state.from !== null &&
    (state.qamrov.start === null || state.from < state.qamrov.start);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 border-[1.5px] px-3 py-2 text-xs',
        tashqarida ? 'border-warn/40 bg-warn/5 text-ink-2' : 'border-line text-ink-3',
        className
      )}
    >
      <CalendarRange aria-hidden className="h-3.5 w-3.5 flex-none" />

      {kunlik ? (
        <span>
          Oraliq:{' '}
          <span className="font-medium tabular-nums text-ink-2">
            {uz(state.from)} → {uz(state.to)}
          </span>
        </span>
      ) : (
        <span className="font-medium text-ink-2">Butun davr</span>
      )}

      {kunlik && (
        <span className="text-ink-3">
          · kunlik tarix:{' '}
          <span className="tabular-nums">
            {uz(state.qamrov.start)} → {uz(state.qamrov.end)}
          </span>
        </span>
      )}

      <span className="inline-flex items-center gap-1 text-ink-3">
        <Info aria-hidden className="h-3 w-3 flex-none" />
        {state.izoh}
      </span>

      {tashqarida && (
        <span className="font-medium text-warn">
          ⚠ Tanlangan boshlanish sanasi kunlik tarixdan oldin — u kunlar uchun raqam yo'q, nol
          emas.
        </span>
      )}
    </div>
  );
}
