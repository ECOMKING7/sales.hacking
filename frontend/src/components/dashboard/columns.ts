import { trNow } from '../../lib/til';
export interface ColumnDef {
  key: string;
  label: string;
  /** Ruscha nom. Yo'q bo'lsa (CPC, CTR, ROAS) — label hamma tilda bir xil. */
  ru?: string;
  sortKey?: string; // backend ORDER BY whitelist key
  align?: 'right';
  always?: boolean; // can't be hidden
  unavailable?: boolean; // not synced yet — renders "—"
}

// Full column set, mirroring Facebook Ads Manager's metric columns.
/** Ustun nomi joriy tilda. O'zbekcha va inglizchada Ads Manager atamalari. */
export function ustunNomi(c: ColumnDef): string {
  return trNow(c.label, c.label, c.ru ?? c.label);
}

export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', ru: 'Название', sortKey: 'name', always: true },
  { key: 'status', label: 'Delivery', ru: 'Показ', always: true },
  { key: 'spend', label: 'Spent', ru: 'Расход', sortKey: 'spend', align: 'right' },
  { key: 'cpc', label: 'CPC', align: 'right' },
  { key: 'cpm', label: 'CPM', align: 'right' },
  { key: 'ctr', label: 'CTR', align: 'right' },
  { key: 'clicks', label: 'Clicks', ru: 'Клики', sortKey: 'clicks', align: 'right' },
  { key: 'impressions', label: 'Impressions', ru: 'Показы', align: 'right' },
  { key: 'reach', label: 'Reach', ru: 'Охват', align: 'right', unavailable: true },
  { key: 'frequency', label: 'Frequency', ru: 'Частота', align: 'right', unavailable: true },
  // Natija = kampaniya maqsadidagi asosiy hodisa (lid, sotuv, klik...).
  // Bitta akkauntda turli maqsadli kampaniyalarni solishtirish uchun yagona
  // ustun; 'Cost/lead' faqat lid kampaniyalari uchun mos edi.
  { key: 'results', label: 'Results', ru: 'Результаты', sortKey: 'results', align: 'right' },
  { key: 'costPerResult', label: 'Cost/result', ru: 'Цена/результат', sortKey: 'costPerResult', align: 'right' },
  { key: 'leads', label: 'Leads', ru: 'Лиды', sortKey: 'leads', align: 'right' },
  { key: 'costPerLead', label: 'Cost/lead', ru: 'Цена/лид', align: 'right' },
  { key: 'purchases', label: 'Purchases', ru: 'Продажи', sortKey: 'purchases', align: 'right' },
  { key: 'costPerPurchase', label: 'Cost/purchase', ru: 'Цена/продажа', align: 'right' },
  { key: 'revenue', label: 'Revenue', ru: 'Выручка', sortKey: 'revenue', align: 'right' },
  { key: 'roas', label: 'ROAS', sortKey: 'roas', align: 'right' },
];

export const DEFAULT_VISIBLE = [
  'name',
  'status',
  'spend',
  'cpc',
  'results',
  'costPerResult',
  'purchases',
  'costPerPurchase',
  'revenue',
  'roas',
];

const STORAGE_KEY = 'dashboard-columns';

export function loadVisibleColumns(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return DEFAULT_VISIBLE;
}

export function saveVisibleColumns(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}
