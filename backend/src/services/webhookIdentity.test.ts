import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bizniki } from './webhookIdentity';

/* ═══════════════════════════════════════════════════════════════════════
   Bu test bitta REAL xato uchun yozildi.

   `bizniki()` avval faqat YO'LNI tekshirgan: /api/webhooks/amocrm.
   Mijozning amoCRM'ida raqobatchi mahsulot (my.venaai.uz) AYNAN shu
   yo'ldan foydalanar ekan. Natijada tekshiruv "bizning webhook bor,
   hammasi joyida" dedi — holbuki bizga birorta hodisa kelmayotgan edi
   va atribusiya 0% turardi.

   Xulosa: yo'l mos kelishi shart, lekin YETARLI EMAS. Host hal qiladi.
   ═══════════════════════════════════════════════════════════════════════ */

const BIZ = 'sales-hacking-api.vercel.app';

test('bizning host + bizning yo\'l — bizniki', () => {
  assert.equal(bizniki('https://sales-hacking-api.vercel.app/api/webhooks/amocrm', BIZ), true);
});

test('secret query bilan ham bizniki', () => {
  assert.equal(
    bizniki('https://sales-hacking-api.vercel.app/api/webhooks/amocrm?secret=abc', BIZ),
    true
  );
});

test('oxirida slash bo\'lsa ham bizniki', () => {
  assert.equal(bizniki('https://sales-hacking-api.vercel.app/api/webhooks/amocrm/', BIZ), true);
});

test('BOSHQA host, bir xil yo\'l — bizniki EMAS (asl xato)', () => {
  assert.equal(bizniki('https://my.venaai.uz/api/webhooks/amocrm', BIZ), false);
});

test('bizning host, boshqa yo\'l — bizniki emas', () => {
  assert.equal(bizniki('https://sales-hacking-api.vercel.app/api/pixel/track', BIZ), false);
});

test('host katta-kichik harfi farq qilmaydi', () => {
  assert.equal(bizniki('https://SALES-HACKING-API.VERCEL.APP/api/webhooks/amocrm', BIZ), true);
});

test("URL bo'lmagan matn — bizniki emas, xato ham tashlamaydi", () => {
  assert.equal(bizniki('shunchaki matn', BIZ), false);
});

test("bizning host noma'lum bo'lsa — hech narsa bizniki emas", () => {
  assert.equal(bizniki('https://sales-hacking-api.vercel.app/api/webhooks/amocrm', ''), false);
});

/* Cheklov (§tests): subdomen tekshirilmaydi — `sales-hacking-api.vercel.app`
   va `sales-hacking-api-git-x.vercel.app` ikki xil host deb qaraladi.
   Preview deploy webhook qo'ysa "bizniki emas" deyiladi. Bu ataylab:
   production'dan boshqa manzilga lid ketayotgan bo'lsa, buni ko'rish
   kerak, yashirish emas. */
