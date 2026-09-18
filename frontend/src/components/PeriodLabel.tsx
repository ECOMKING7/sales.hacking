/**
 * Raqamlar qaysi davrni qamrayotgani.
 *
 * NEGA KERAK: jadvaldagi xarajat, natija, lid va daromad — hammasi
 * BUTUN DAVR uchun (sync `date_preset=maximum` bilan ishlaydi). Sana
 * yozilmasa foydalanuvchi buni "shu oyning raqami" deb o'qiydi va
 * xarajatni bir necha barobar kam baholaydi.
 *
 * Sana Facebook aytgan `date_start`/`date_stop` dan keladi — taxmin
 * emas. Facebook 37 oydan eskisini bermaydi, shuning uchun akkaunt
 * undan oldin ochilgan bo'lsa boshlanish sanasi kesilgan bo'ladi va
 * buni ko'rsatib turish halolroq.
 */
import { CalendarRange } from 'lucide-react';

export interface PeriodWindow {
  start: string | null;
  end: string | null;
}

/** "2026-09-17" -> "17.09.2026". Boshqa shakl kelsa o'zicha qaytadi. */
function uz(date: string | null): string {
  if (!date) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : date;
}

export default function PeriodLabel({ window: win }: { window?: PeriodWindow }) {
  if (!win?.start) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
        <CalendarRange aria-hidden className="h-3.5 w-3.5" />
        Davr hali aniqlanmagan — birinchi sync kutilmoqda
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-ink-3"
      title="Facebook 37 oydan eskisini bermaydi. Akkaunt undan oldin ochilgan bo'lsa boshlanish sanasi shu chegara."
    >
      <CalendarRange aria-hidden className="h-3.5 w-3.5" />
      Butun davr:{' '}
      <span className="font-medium tabular-nums text-ink-2">
        {uz(win.start)} → {uz(win.end)}
      </span>
    </span>
  );
}
