export type PresetId =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last14'
  | 'last30'
  | 'last90'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'lastYear'
  | 'maximum'
  | 'custom';

export interface DateRange {
  from: string; // ISO
  to: string; // ISO
}

export const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last14', label: 'Last 14 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'thisYear', label: 'This year' },
  { id: 'lastYear', label: 'Last year' },
  { id: 'maximum', label: 'Maximum' },
  { id: 'custom', label: 'Custom range' },
];

const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function rangeForPreset(id: PresetId): DateRange {
  const now = new Date();
  const today = startOfDay(now);
  const endOfToday = new Date(today.getTime() + DAY); // exclusive upper bound

  switch (id) {
    case 'today':
      return { from: today.toISOString(), to: endOfToday.toISOString() };
    case 'yesterday':
      return { from: new Date(today.getTime() - DAY).toISOString(), to: today.toISOString() };
    case 'last7':
      return { from: new Date(today.getTime() - 7 * DAY).toISOString(), to: endOfToday.toISOString() };
    case 'last14':
      return { from: new Date(today.getTime() - 14 * DAY).toISOString(), to: endOfToday.toISOString() };
    case 'last30':
      return { from: new Date(today.getTime() - 30 * DAY).toISOString(), to: endOfToday.toISOString() };
    case 'last90':
      return { from: new Date(today.getTime() - 90 * DAY).toISOString(), to: endOfToday.toISOString() };
    case 'thisMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        to: endOfToday.toISOString(),
      };
    case 'lastMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
        to: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      };
    case 'thisYear':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: endOfToday.toISOString() };
    case 'lastYear':
      return {
        from: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
        to: new Date(now.getFullYear(), 0, 1).toISOString(),
      };
    case 'maximum':
      // Lifetime — go far enough back to cover any campaign history.
      return { from: new Date('2015-01-01T00:00:00Z').toISOString(), to: endOfToday.toISOString() };
    default:
      return { from: new Date(today.getTime() - 30 * DAY).toISOString(), to: endOfToday.toISOString() };
  }
}

export function customRange(fromDate: string, toDate: string): DateRange {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(new Date(`${toDate}T00:00:00`).getTime() + DAY); // inclusive end day
  return { from: from.toISOString(), to: to.toISOString() };
}

export function formatRangeLabel(range: DateRange): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const end = new Date(new Date(range.to).getTime() - DAY); // show inclusive end
  return `${fmt(range.from)} – ${fmt(end.toISOString())}`;
}

/**
 * Lokal sana matni: "2026-09-19".
 *
 * ⚠ `toISOString().slice(0,10)` ISHLATILMAYDI. U UTC ga o'giradi, Toshkent
 * esa UTC+5 — mahalliy yarim tun UTC da oldingi kunning 19:00 i. Ya'ni
 * "bugun" deb tanlangan kun serverga KECHA bo'lib ketardi. Bir kunlik
 * siljish eng yomon xato turi: raqam ishonchli ko'rinadi, lekin boshqa
 * kunniki.
 */
export function kunMatn(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Oraliqni backend kutayotgan shaklga o'giradi: ikkala chekka ham KIRADI.
 *
 * `DateRange.to` — eksklyuziv yuqori chegara (bugun uchun ertangi yarim
 * tun). Backenddagi `kun BETWEEN from AND to` esa inklyuziv. Shu farq
 * hisobga olinmasa "kecha" so'rovi bugunni ham qamrab olardi.
 */
export function kunlikOraliq(r: DateRange): { from: string; to: string } {
  return {
    from: kunMatn(new Date(r.from)),
    to: kunMatn(new Date(new Date(r.to).getTime() - 1)),
  };
}
