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

export function formatRoas(v: unknown): string {
  return `${n(v).toFixed(2)}x`;
}

export function formatNumber(v: unknown): string {
  return n(v).toLocaleString();
}

export function formatDays(v: unknown): string {
  const d = n(v);
  return `${d.toFixed(d % 1 === 0 ? 0 : 1)} ${d === 1 ? 'day' : 'days'}`;
}

/** ROAS badge colour: green > 5x, yellow 2–5x, red < 2x. */
export function roasColor(v: unknown): string {
  const r = n(v);
  if (r >= 5) return 'bg-green-100 text-green-700';
  if (r >= 2) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}
