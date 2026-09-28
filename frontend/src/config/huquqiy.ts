/**
 * HUQUQIY SAHIFALAR — o'zgaradigan hamma qiymat SHU YERDA.
 *
 * NEGA BITTA FAYL. Yuridik nom, email va domen vaqt o'tib o'zgaradi:
 * o'z domeni ulanadi, support@ pochtasi ochiladi. Agar bu qiymatlar
 * uchta sahifaga tarqalib ketsa — bittasi eskirib qoladi va Meta
 * tekshiruvchisi aynan shu nomuvofiqlikni topadi ("sahifada bir nom,
 * formada boshqa nom"). Bu rad etishning eng ko'p uchraydigan sababi.
 *
 * Shuning uchun §3.1 qoidasi bu yerda ham amal qiladi: matnda hech
 * narsa QOTIRILMAYDI, hammasi shu obyektdan o'qiladi.
 *
 * ════════════════════════════════════════════════════════════════
 * ⚠⚠ BU FAYLGA HECH QACHON YOZILMAYDI:
 *     JSHSHIR · pasport yoki ID-karta raqami · INN/STIR bo'lmagan
 *     shaxsiy raqamlar · bank hisob raqami · uy manzili (kvartira,
 *     ko'cha, uy raqami darajasida).
 *
 * Bu fayl GitHub'da ochiq turadi va sahifa internetda hamma uchun
 * ko'rinadi. Guvohnomadagi hamma narsa ochiq emas: ro'yxat raqami
 * va faoliyat turi — ochiq reyestr ma'lumoti, JSHSHIR va pasport —
 * shaxsiy identifikator. Ikkalasini aralashtirish qimmatga tushadi.
 * ════════════════════════════════════════════════════════════════
 */

export interface HuquqiyMalumot {
  /** Xizmatning ko'rinadigan nomi. */
  mahsulot: string;
  /** Ma'lumotni qayta ishlovchi YURIDIK shaxs. Meta aynan shuni qidiradi. */
  yuridikNom: string;
  /** Yuridik shaxs ro'yxatdan o'tganmi — matn shunga qarab o'zgaradi. */
  royxatdanOtgan: boolean;
  /** Davlat reyestridagi ro'yxat raqami. Ochiq ma'lumot. */
  royxatRaqami: string | null;
  /** Ro'yxatdan o'tgan sana, YYYY-MM-DD. */
  royxatSanasi: string | null;
  /** Guvohnomadagi faoliyat turi. */
  faoliyat: string | null;
  /**
   * Manzil — SHAHAR VA TUMAN darajasida, ko'cha va uy raqamisiz.
   * Yuridik shaxsni aniqlash uchun yetarli, shaxsiy xavfsizlik uchun
   * esa xavfsiz. Meta to'liq manzilni so'rasa — u FORMAGA yoziladi,
   * ochiq sahifaga emas.
   */
  manzil: string | null;
  /** Mamlakat — yurisdiksiya uchun. */
  mamlakat: string;
  /** Har qanday murojaat shu manzilga. Javob beradigan bo'lishi SHART. */
  email: string;
  /** Sahifalar turgan manzil, protokolsiz. */
  domen: string;
  /** Oxirgi tahrir sanasi — YYYY-MM-DD. */
  yangilandi: string;
}

export const HUQUQIY: HuquqiyMalumot = {
  mahsulot: 'Sales Hacking',

  yuridikNom: "YaTT Maxmudov Abduraxmonjon Murodjon o'g'li",
  royxatdanOtgan: true,
  royxatRaqami: '7637129',
  royxatSanasi: '2026-04-02',
  faoliyat: 'Reklamani ishlab chiqish va joylashtirish',
  manzil: 'Toshkent shahri, Yakkasaroy tumani',

  mamlakat: "O'zbekiston Respublikasi",

  // TODO: o'z domeningizda privacy@ ochilgach almashtiring.
  email: 'abdurohmanmurad@gmail.com',

  // Asosiy domen (ahost.uz → Vercel). Meta va amoCRM formalarida ham shu.
  domen: 'www.mcqueen.uz',

  yangilandi: '2026-09-28',
};

/** `https://domen/yo'l` — sahifalarda havola qurish uchun. */
export function huquqiyHavola(yol: string): string {
  return `https://${HUQUQIY.domen}${yol}`;
}

/**
 * Footerdagi bir qator: nom · ro'yxat raqami · manzil.
 * Bo'sh maydonlar jimgina tushib qoladi — "null" so'zi ekranga
 * chiqmasligi kerak (`null` hech qachon qiymat emas).
 */
export function huquqiyQator(): string {
  return [
    HUQUQIY.yuridikNom,
    HUQUQIY.royxatRaqami ? `ro'yxat № ${HUQUQIY.royxatRaqami}` : null,
    HUQUQIY.manzil,
    HUQUQIY.mamlakat,
  ]
    .filter(Boolean)
    .join(' · ');
}
