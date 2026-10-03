/* ─────────────────────────────────────────────────────────────
   OBUNA QOIDALARI — toza funksiyalar (DB yo'q, tarmoq yo'q) → testlanadi.

   Hayot sikli:
     none ──(birinchi to'lov)──► active
     active ──(paid_until keldi, yechildi)──► active (+1 oy)
     active ──(yechilmadi)──► past_due ──(1 kun, keyin 2 kun)──► qayta urinish
     past_due ──(3-urinish ham o'tmadi)──► expired (plan = free)
     active ──(foydalanuvchi bekor qildi)──► canceled ──(paid_until)──► expired

   past_due davrida tarif SAQLANADI (3 kunlik "grace") — kartada pul
   yo'qligi uchun mijozni darhol o'chirib qo'yish uni yo'qotishning eng
   tez yo'li.
   ───────────────────────────────────────────────────────────── */

export type PullikPlan = 'pro' | 'agency';
export type Provayder = 'payme' | 'click';
export type BillingHolat = 'none' | 'active' | 'past_due' | 'expired' | 'canceled';

/** Eslatma necha kun oldin yuboriladi. */
export const ESLATMA_KUN = 7;
/** Muvaffaqiyatsiz urinishdan keyingi kutishlar (kun). Uzunligi+1 = jami urinish. */
export const QAYTA_URINISH_KUN = [1, 2] as const;
export const JAMI_URINISH = QAYTA_URINISH_KUN.length + 1;

/**
 * Narxlar so'mda, env'dan. Qotirilmaydi: narx o'zgarsa kodga tegilmaydi.
 * O'rnatilmagan tarif sotilmaydi (null) — "0 so'mga obuna" xavfi yo'q.
 */
export function narxlar(env: NodeJS.ProcessEnv = process.env): Record<PullikPlan, number | null> {
  const o = (v: string | undefined) => {
    const n = Number(String(v ?? '').replace(/[\s_]/g, ''));
    return Number.isInteger(n) && n >= 1000 ? n : null;
  };
  return { pro: o(env.BILLING_NARX_PRO_UZS), agency: o(env.BILLING_NARX_AGENCY_UZS) };
}

export function pullikPlanmi(v: unknown): v is PullikPlan {
  return v === 'pro' || v === 'agency';
}

/**
 * Keyingi davr oxiri: +1 kalendar oy, OY OXIRI QISQICHI bilan.
 * 31-yanvar + 1 oy = 28/29-fevral (JS'ning o'zi 3-martga o'tkazib yuborardi —
 * mijoz har yili bir necha kun "yo'qotardi" va sana siljib ketardi).
 * Vaqt (soat) saqlanadi — yechish kunning o'sha paytida bo'ladi.
 */
export function birOyKeyin(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const oxirgiKun = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const kun = Math.min(d.getUTCDate(), oxirgiKun);
  return new Date(
    Date.UTC(y, m, kun, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())
  );
}

/** Muvaffaqiyatsiz urinishdan keyin: keyingi urinish vaqti yoki null (= tugatish). */
export function keyingiUrinish(muvaffaqiyatsizlarSoni: number, hozir: Date): Date | null {
  const kun = QAYTA_URINISH_KUN[muvaffaqiyatsizlarSoni - 1];
  if (kun === undefined) return null;
  return new Date(hozir.getTime() + kun * 86_400_000);
}

/** Eslatma yuborish vaqti keldimi: yechishgacha ≤ 7 kun qoldi va hali o'tmagan. */
export function eslatmaVaqtimi(paidUntil: Date, hozir: Date): boolean {
  const qoldi = paidUntil.getTime() - hozir.getTime();
  return qoldi > 0 && qoldi <= ESLATMA_KUN * 86_400_000;
}

/** Payme summani TIYINDA oladi. */
export const tiyin = (som: number): number => Math.round(som * 100);

/** Karta raqamini niqoblash: 8600 12** **** 3456. To'liq raqam hech qayerda saqlanmaydi. */
export function kartaNiqobi(raqam: string): string {
  const r = raqam.replace(/\D/g, '');
  if (r.length < 12) return '**** ****';
  return `${r.slice(0, 4)} ${r.slice(4, 6)}** **** ${r.slice(-4)}`;
}

/** Sana Toshkent vaqtida: 02.11.2026 */
export function sanaToshkent(d: Date): string {
  const t = new Date(d.getTime() + 5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

/** 400000 → "400 000" */
export function somFormat(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export const PLAN_NOMI: Record<PullikPlan, string> = { pro: 'Pro', agency: 'Agency' };

/* ───────────── Qaror funksiyalari (provayder javobi → holat) ───────────── */

export type Qaror = 'paid' | 'failed' | null; // null = hali noma'lum, kutamiz

/** Payme chek holati. 0 = yaratilgan, to'lanmagan: 1 soatdan keyin xavfsiz "failed". */
export function paymeQarori(state: number, eski: boolean): Qaror {
  if (state === 4) return 'paid';
  if (state === 50) return 'failed';
  if (state === 0 && eski) return 'failed';
  return null;
}

/** Click payment_status: 2 = to'langan, manfiy = rad. (tekshirilishi kerak) */
export function clickQarori(status: number): Qaror {
  if (status === 2) return 'paid';
  if (status < 0) return 'failed';
  return null;
}

/** Yechish muddatidan ko'p o'tgan bo'lsa (cron to'xtab qolgan) — davr HOZIRDAN.
 *  Aks holda bir oydan ortiq uzilishdan keyin har soatda ketma-ket oylar yechilardi. */
export const KECHIKISH_CHEGARASI_KUN = 3;
export function yangilashDavrBoshi(paidUntil: Date, hozir: Date): Date {
  return hozir.getTime() - paidUntil.getTime() > KECHIKISH_CHEGARASI_KUN * 86_400_000 ? hozir : paidUntil;
}

/** Eslatmada ko'rsatiladigan yechish sanasi: eslatma kech ketgan bo'lsa ham kamida 7 kun keyin. */
export function eslatmaSanasi(paidUntil: Date, hozir: Date): Date {
  return new Date(Math.max(paidUntil.getTime(), hozir.getTime() + ESLATMA_KUN * 86_400_000));
}
