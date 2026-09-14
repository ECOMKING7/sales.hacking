export interface ColumnDef {
  key: string;
  label: string;
  sortKey?: string; // backend ORDER BY whitelist key
  align?: 'right';
  always?: boolean; // can't be hidden
  unavailable?: boolean; // not synced yet — renders "—"
}

// Full column set, mirroring Facebook Ads Manager's metric columns.
export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', sortKey: 'name', always: true },
  { key: 'status', label: 'Delivery', always: true },
  { key: 'spend', label: 'Spent', sortKey: 'spend', align: 'right' },
  { key: 'cpc', label: 'CPC', align: 'right' },
  { key: 'cpm', label: 'CPM', align: 'right' },
  { key: 'ctr', label: 'CTR', align: 'right' },
  { key: 'clicks', label: 'Clicks', sortKey: 'clicks', align: 'right' },
  { key: 'impressions', label: 'Impressions', align: 'right' },
  { key: 'reach', label: 'Reach', align: 'right', unavailable: true },
  { key: 'frequency', label: 'Frequency', align: 'right', unavailable: true },
  // Natija = kampaniya maqsadidagi asosiy hodisa (lid, sotuv, klik...).
  // Bitta akkauntda turli maqsadli kampaniyalarni solishtirish uchun yagona
  // ustun; 'Cost/lead' faqat lid kampaniyalari uchun mos edi.
  { key: 'results', label: 'Results', sortKey: 'results', align: 'right' },
  { key: 'costPerResult', label: 'Cost/result', sortKey: 'costPerResult', align: 'right' },
  { key: 'leads', label: 'Leads', sortKey: 'leads', align: 'right' },
  { key: 'costPerLead', label: 'Cost/lead', align: 'right' },
  { key: 'purchases', label: 'Purchases', sortKey: 'purchases', align: 'right' },
  { key: 'costPerPurchase', label: 'Cost/purchase', align: 'right' },
  { key: 'revenue', label: 'Revenue', sortKey: 'revenue', align: 'right' },
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
