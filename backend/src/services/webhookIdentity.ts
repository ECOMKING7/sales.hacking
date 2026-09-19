/* ═══════════════════════════════════════════════════════════════════════
   Webhook manzilini TANISH — toza funksiyalar, DB va Express'siz.

   Alohida modul, chunki bu kod bir marta jiddiy xato berdi va endi
   testlanadi. Controller ichida qolsa test uni import qila olmaydi:
   controller `req.user` global augmentatsiyasiga bog'liq.
   ═══════════════════════════════════════════════════════════════════════ */

/** Bizning webhook yo'limiz. amoCRM boshqa yo'lga yozmaydi. */
const YOL = /^\/api\/webhooks\/amocrm\/?$/i;

/**
 * Bizning webhook manzilimizni tanish.
 *
 * ⚠ Bu funksiya avval FAQAT YO'LNI tekshirgan edi va shu sabab JIDDIY
 * XATO berdi: mijozning amoCRM'idagi raqobatchi mahsulot
 * (`my.venaai.uz/api/webhooks/amocrm`) aynan shu yo'ldan foydalanar
 * ekan. Tekshiruv uni "bizniki" deb belgiladi va "hammasi joyida" degan
 * xulosa chiqardi — holbuki bizga birorta hodisa kelmayotgan edi va
 * atribusiya 0% turardi.
 *
 * Endi HOST hal qiladi. Yo'l mos kelishi shart, lekin yetarli emas.
 */
export function bizniki(destination: string, bizningHost: string): boolean {
  if (!bizningHost) return false;
  try {
    const u = new URL(destination);
    if (!YOL.test(u.pathname)) return false;
    return u.hostname.toLowerCase() === bizningHost.toLowerCase();
  } catch {
    return false; // manzil umuman URL emas
  }
}

/** `https://api.example.com/x` -> `api.example.com`. URL bo'lmasa bo'sh satr. */
export function hostAjrat(base: string): string {
  try {
    return new URL(base).hostname.toLowerCase();
  } catch {
    return '';
  }
}
