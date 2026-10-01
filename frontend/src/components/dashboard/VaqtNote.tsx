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
import { trNow } from '../../lib/til';

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
  faqatOgoh = false,
}: {
  state?: VaqtHolati;
  className?: string;
  /**
   * Faqat OGOHLANTIRISH holatida chiqadi, oddiy izoh chiqmaydi.
   *
   * Nega kerak: jadval tepasida ikkita doimiy chiziq turardi va ular
   * har doim bir xil matnni takrorlardi — o'qilmay qolgan izoh shovqin.
   * Oraliq allaqachon sana tanlagichida yozilgan, "—" ning sababi esa
   * ustun sarlavhasining tooltipida.
   *
   * Lekin OGOHLANTIRISH qolishi shart: tanlangan sana kunlik tarixdan
   * oldin bo'lsa jadval bo'm-bo'sh chiqadi va sababsiz bu "ma'lumot
   * yo'q" deb o'qiladi — aslida "hali yuklanmagan".
   */
  faqatOgoh?: boolean;
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

  if (faqatOgoh && !tashqarida) return null;

  if (faqatOgoh) {
    return (
      <div
        className={cn(
          'flex items-start gap-2 border-[1.5px] border-warn/40 bg-warn/5 px-3 py-2 text-xs text-ink-2',
          className
        )}
      >
        <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-warn" />
        <span>
          {trNow(
            `Tanlangan boshlanish sanasi (${uz(state.from)}) kunlik tarixdan oldin — kunlik tarix ${uz(state.qamrov.start)} dan boshlanadi. Undan oldingi kunlar uchun raqam yo'q, nol emas.`,
            `The selected start date (${uz(state.from)}) is before the daily history, which starts on ${uz(state.qamrov.start)}. Earlier days have no data — not zero.`
          , `Выбранная дата начала (${uz(state.from)}) раньше дневной истории, которая начинается с ${uz(state.qamrov.start)}. За более ранние дни данных нет — это не ноль.`)}
        </span>
      </div>
    );
  }

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
          {trNow('Oraliq:', 'Range:', 'Период:')}{' '}
          <span className="font-medium tabular-nums text-ink-2">
            {uz(state.from)} → {uz(state.to)}
          </span>
        </span>
      ) : (
        <span className="font-medium text-ink-2">{trNow('Butun davr', 'All time', 'За всё время')}</span>
      )}

      {kunlik && (
        <span className="text-ink-3">
          · {trNow('kunlik tarix:', 'daily history:', 'дневная история:')}{' '}
          <span className="tabular-nums">
            {uz(state.qamrov.start)} → {uz(state.qamrov.end)}
          </span>
        </span>
      )}

      <span className="inline-flex items-center gap-1 text-ink-3">
        <Info aria-hidden className="h-3 w-3 flex-none" />
        {trNow(
          state.izoh,
          kunlik
            ? 'Spend, clicks, impressions and leads are for the selected days. Sales, revenue and ROAS are not in the daily table, so they show "—".'
            : 'All time. Pick dates to see spend and leads for those days.',
          kunlik
            ? 'Расход, клики, показы и лиды — за выбранные дни. Продаж, выручки и ROAS нет в дневной таблице, поэтому «—».'
            : 'За всё время. Выберите даты, чтобы увидеть расход и лиды за эти дни.'
        )}
      </span>

      {tashqarida && (
        <span className="font-medium text-warn">
          ⚠{' '}
          {trNow(
            "Tanlangan boshlanish sanasi kunlik tarixdan oldin — u kunlar uchun raqam yo'q, nol emas.",
            'The selected start date is before the daily history — those days have no data, not zero.'
          , 'Выбранная дата начала раньше дневной истории — за эти дни данных нет, это не ноль.')}
        </span>
      )}
    </div>
  );
}
