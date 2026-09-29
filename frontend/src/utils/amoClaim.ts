/* amoMarket o'rnatmasining "da'vo" kaliti.

   amoCRM'da "Установить" bosilganda server brauzerni
   /amocrm/install?claim=...&domain=... ga yuboradi. Foydalanuvchi hali
   kirmagan bo'lishi mumkin — shuning uchun kalit brauzerda saqlanadi va
   kirgandan keyin shu sahifaga qaytariladi. Kalit 15 daqiqa yashaydi.

   localStorage yopiq bo'lishi mumkin (inkognito) — shunda kalit faqat
   shu sahifada ishlaydi, xato bermaydi. */

const KEY = 'ap-amo-claim';

export interface SavedClaim {
  claim: string;
  domain: string | null;
}

export function saveClaim(v: SavedClaim): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* saqlab bo'lmadi — sahifadagi oqim baribir ishlaydi */
  }
}

export function readClaim(): SavedClaim | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedClaim>;
    return typeof v.claim === 'string' ? { claim: v.claim, domain: v.domain ?? null } : null;
  } catch {
    return null;
  }
}

export function clearClaim(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* e'tiborsiz */
  }
}

/** 4xx — kalit endi yaroqsiz (eskirgan, ishlatilgan, band). 5xx/tarmoq — qayta urinsa bo'ladi. */
export function isFinalError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** Server javobidan o'qiladigan xato matni. */
export function claimError(err: unknown): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
    'Could not connect amoCRM. Check your connection and try again.'
  );
}
