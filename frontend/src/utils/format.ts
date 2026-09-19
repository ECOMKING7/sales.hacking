export function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Pul — HAR DOIM o'z valyutasi bilan.
 *
 * NEGA BU SHUNCHAKI FORMATLASH EMAS: dashboardda ikki xil valyutadagi raqam
 * yonma-yon turadi. Xarajat reklama akkauntining valyutasida (bu mijozda USD),
 * daromad esa CRM valyutasida (UZS). Ilgari ikkalasi ham `$` bilan chiqardi:
 *
 *     Amount Spent  $47,516        ← rost, USD
 *     Revenue       $315,300,000   ← YOLG'ON, aslida 315 300 000 so'm ≈ $26 646
 *     ARPL          $20,135        ← YOLG'ON, aslida 20 135 so'm ≈ $1.70
 *
 * Bu ROAS 6558x bug'ining aynan o'zi, faqat boshqa ustunda: operator raqamga
 * qarab qaror qabul qiladi va 11 833 barobar adashadi.
 *
 * Shuning uchun valyuta kodi MAJBURIY argument. Uni "unutib qoldirish"
 * mumkin emas — TypeScript o'tkazmaydi.
 *
 * `code` null bo'lsa (hali sinxron bo'lmagan, valyuta noma'lum) — belgisiz
 * yalang'och raqam chiqadi. Noto'g'ri belgidan ko'ra belgisiz yaxshiroq.
 */
export function formatMoney(v: unknown, code: string | null | undefined, digits = 0): string {
  const x = n(v);
  const kod = (code ?? '').trim().toUpperCase();
  const opts = { minimumFractionDigits: digits, maximumFractionDigits: digits };

  if (!kod) return x.toLocaleString(undefined, opts);

  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: kod, ...opts }).format(x);
  } catch {
    // Noma'lum ISO kod — Intl xato beradi. Raqam + kod baribir aniq.
    return `${x.toLocaleString(undefined, opts)} ${kod}`;
  }
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
