/**
 * Telefon raqamini E.164 ga keltirish.
 *
 * NEGA KERAK — Meta Conversions API `ph` maydonini faqat E.164 ko'rinishida
 * (mamlakat kodi bilan, "+" siz, faqat raqam) hash qilingan holda qabul
 * qiladi. Ilgari faqat `replace(/\D/g, '')` qilinardi: "+998 90 123 45 67"
 * ham, "90 123 45 67" ham turli hash bergan va Meta hech birini topmagan —
 * match rate 0.
 *
 * §3.1: mamlakat kodi kodda QOTIRILMAYDI — u konfiguratsiyadan keladi
 * (workspaces.phone_country_code, standart '998').
 */

/** E.164 bo'yicha raqam uzunligi: mamlakat kodi bilan birga 15 tadan oshmaydi. */
const E164_MAX = 15;
/** Eng qisqa real xalqaro raqam (mamlakat kodi + abonent) ~8 ta raqam. */
const E164_MIN = 8;
/**
 * Mamlakat kodisiz (milliy) qismning eng qisqa uzunligi.
 *
 * NEGA KERAK — TEST TOPGAN KAMCHILIK: "12345" kabi axlat qiymat
 * milliy raqam deb qabul qilinardi, oldiga 998 qo'shilardi va
 * "99812345" — ko'rinishidan yaroqli raqam — chiqardi. U hash
 * qilinib Meta'ga ketardi va hech kimga mos kelmasdi.
 *
 * Endi milliy qism 7 ta raqamdan qisqa bo'lsa — null. Hech bir real
 * mobil raqamlash rejasida 7 tadan qisqa abonent raqami yo'q.
 */
const MILLIY_MIN = 7;

/**
 * Raqamni E.164 ga keltiradi. Keltirib bo'lmasa `null` qaytaradi —
 * chunki noto'g'ri normalizatsiya qilingan raqamni hash qilish
 * hash qilmaslikdan battar: u jim ravishda hech kimga mos kelmaydi.
 *
 * Qoidalar (tartib bilan):
 *  1. "+" bilan boshlansa yoki "00" prefiksi bo'lsa — raqam allaqachon
 *     xalqaro, faqat raqamlar qoldiriladi.
 *  2. Mamlakat kodi bilan boshlansa — o'zgartirilmaydi.
 *  3. Milliy formatdagi bitta boshlang'ich "0" olib tashlanadi
 *     (ko'p mamlakatlarda trunk prefiksi).
 *  4. 10 ta va undan kam raqam — milliy deb hisoblanadi, oldiga
 *     mamlakat kodi qo'shiladi.
 *  5. Undan uzun bo'lsa — "+" siz yozilgan xalqaro raqam deb olinadi.
 *
 * ⚠ Bu tekshirilishi kerak: qoidalar O'zbekiston (998 + 9 xonali) va
 * shunga o'xshash raqamlash rejalariga mo'ljallangan. Boshqa bozorga
 * chiqilganda `scripts/check-phones.ts` bilan taqsimotni ko'ring.
 *
 * ⚠ MA'LUM CHEKLOV — BIR XONALI MAMLAKAT KODI (7: RU/KZ, 1: US/CA).
 * "7012345678" (qozoq mobil raqami, milliy shakl) mamlakat kodi bilan
 * boshlangani uchun "allaqachon xalqaro" deb qabul qilinadi va
 * "77012345678" ga keltirilmaydi. Bu bozorga chiqishdan oldin
 * raqamlash rejasi uzunligi bo'yicha qoida qo'shish kerak.
 * Xalqaro shaklda ("+7 701 ...") to'g'ri ishlaydi.
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  countryCode = '998'
): string | null {
  if (!raw) return null;

  const text = String(raw).trim();
  if (!text) return null;

  const cc = String(countryCode).replace(/\D/g, '');
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;

  const isInternational = text.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (!isInternational && !digits.startsWith(cc)) {
    // Trunk prefiksi: "0 90 123 45 67" -> "90 123 45 67"
    if (digits.startsWith('0')) digits = digits.slice(1);
    // Juda qisqa milliy qism — bu raqam emas. Taxmin qilmaymiz.
    if (digits.length < MILLIY_MIN) return null;
    if (digits.length <= 10) digits = cc + digits;
  }

  if (digits.length < E164_MIN || digits.length > E164_MAX) return null;
  return digits;
}

/**
 * Raqamning "shakli" — diagnostika uchun. Raqamning O'ZINI qaytarmaydi,
 * shuning uchun log'ga yozish xavfsiz.
 * Masalan: "+/len12/998" yoki "raw/len9/other".
 */
export function phoneShape(raw: string | null | undefined, countryCode = '998'): string {
  if (!raw) return 'empty';
  const text = String(raw).trim();
  const digits = text.replace(/\D/g, '');
  const cc = String(countryCode).replace(/\D/g, '');
  const prefix = text.startsWith('+') ? '+' : digits.startsWith('00') ? '00' : 'raw';
  const known = digits.startsWith(cc) ? cc : digits.startsWith('0') ? 'leading0' : 'other';
  return `${prefix}/len${digits.length}/${known}`;
}
