/**
 * Facebook'da ma'lumot qaysi sanadan boshlanishi.
 *
 * ⚠ YORLIQ O'ZGARDI: ilgari "Butun davr" deb yozardi, chunki jadval
 * haqiqatan butun tarixni ko'rsatardi. Endi sana tanlagichi ishlaydi
 * (`ad_insights_daily`) va jadval tanlangan oraliqni beradi — shunday
 * ekan "Butun davr" yonida "Sep 19 – Sep 19" turishi QARAMA-QARSHI
 * ikki gap bo'lardi va foydalanuvchi qaysi biriga ishonishni bilmasdi.
 *
 * Endi bu chiziq boshqa savolga javob beradi: "umuman qaysi sanadan
 * boshlab ma'lumot bor?" Tanlangan oraliq esa jadval tepasida
 * (VaqtNote) yoziladi.
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
      Ma'lumot qamrovi:{' '}
      <span className="font-medium tabular-nums text-ink-2">
        {uz(win.start)} → {uz(win.end)}
      </span>
    </span>
  );
}
