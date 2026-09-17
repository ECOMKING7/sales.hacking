export function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function formatCurrency(v: unknown): string {
  return `$${n(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatCurrency2(v: unknown): string {
  return `$${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(v: unknown): string {
  return `${n(v).toFixed(1)}%`;
}

/**
 * ROAS. `null` — "hisoblab bo'lmadi" (masalan reklama valyutasi CRM
 * valyutasidan farq qiladi), 0 esa "pul kelmadi". Ikkisi bir xil
 * ko'rinmasligi kerak, shuning uchun null'da "—" chiqadi.
 */
export function formatRoas(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return `${n(v).toFixed(2)}x`;
}

export function formatNumber(v: unknown): string {
  return n(v).toLocaleString();
}

export function formatDays(v: unknown): string {
  const d = n(v);
  return `${d.toFixed(d % 1 === 0 ? 0 : 1)} ${d === 1 ? 'day' : 'days'}`;
}

/**
 * ROAS uchun Badge ohangi: >= 5x kuchli, 2–5x o'rtacha, < 2x zaif.
 * Havorang qaytarilmaydi — natija ranglari faqat ok/warn/bad.
 * Ishlatish: <Badge tone={roasTone(row.roas)}>{formatRoas(row.roas)}</Badge>
 */
export function roasTone(v: unknown): 'ok' | 'warn' | 'bad' {
  const r = n(v);
  if (r >= 5) return 'ok';
  if (r >= 2) return 'warn';
  return 'bad';
}
