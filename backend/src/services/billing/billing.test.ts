import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  birOyKeyin,
  eslatmaVaqtimi,
  kartaNiqobi,
  keyingiUrinish,
  narxlar,
  sanaToshkent,
  somFormat,
  tiyin,
  JAMI_URINISH,
} from './qoidalar';
import { clickAuth } from './click';
import { eslatmaXati, tolovOtmadiXati } from './xatlar';

const d = (s: string) => new Date(s);

test('birOyKeyin: oddiy oy', () => {
  assert.equal(birOyKeyin(d('2026-10-03T10:00:00Z')).toISOString(), '2026-11-03T10:00:00.000Z');
});

test('birOyKeyin: oy oxiri qisqichi (31-yanvar → 28-fevral, 3-mart emas)', () => {
  assert.equal(birOyKeyin(d('2027-01-31T00:00:00Z')).toISOString(), '2027-02-28T00:00:00.000Z');
  assert.equal(birOyKeyin(d('2028-01-31T00:00:00Z')).toISOString(), '2028-02-29T00:00:00.000Z'); // kabisa
});

test('birOyKeyin: dekabr → keyingi yil yanvar', () => {
  assert.equal(birOyKeyin(d('2026-12-15T05:00:00Z')).toISOString(), '2027-01-15T05:00:00.000Z');
});

test('eslatmaVaqtimi: 7 kun ichida — ha; 8 kun — yo\'q; o\'tib ketgan — yo\'q', () => {
  const hozir = d('2026-10-01T00:00:00Z');
  assert.equal(eslatmaVaqtimi(d('2026-10-08T00:00:00Z'), hozir), true);
  assert.equal(eslatmaVaqtimi(d('2026-10-09T00:00:00Z'), hozir), false);
  assert.equal(eslatmaVaqtimi(d('2026-09-30T00:00:00Z'), hozir), false);
});

test('keyingiUrinish: 1 kun, 2 kun, keyin to\'xtatish', () => {
  const hozir = d('2026-10-01T00:00:00Z');
  assert.equal(keyingiUrinish(1, hozir)?.toISOString(), '2026-10-02T00:00:00.000Z');
  assert.equal(keyingiUrinish(2, hozir)?.toISOString(), '2026-10-03T00:00:00.000Z');
  assert.equal(keyingiUrinish(3, hozir), null);
  assert.equal(JAMI_URINISH, 3);
});

test('narxlar: env\'dan, bo\'sh/noto\'g\'ri → null (0 so\'mga sotilmaydi)', () => {
  assert.deepEqual(narxlar({ BILLING_NARX_PRO_UZS: '400 000', BILLING_NARX_AGENCY_UZS: '' }), {
    pro: 400000,
    agency: null,
  });
  assert.deepEqual(narxlar({ BILLING_NARX_PRO_UZS: '0', BILLING_NARX_AGENCY_UZS: 'abc' }), { pro: null, agency: null });
});

test('tiyin: Payme summasi ×100', () => {
  assert.equal(tiyin(400000), 40000000);
});

test('kartaNiqobi: to\'liq raqam saqlanmaydi', () => {
  assert.equal(kartaNiqobi('8600 1234 5678 9012'), '8600 12** **** 9012');
  assert.equal(kartaNiqobi('123'), '**** ****');
});

test('sanaToshkent: UTC 20:00 → Toshkentda ertasi kun', () => {
  assert.equal(sanaToshkent(d('2026-11-01T20:00:00Z')), '02.11.2026');
});

test('somFormat', () => {
  assert.equal(somFormat(1234567), '1 234 567');
});

test('clickAuth: user:sha1(ts+kalit):ts', () => {
  const kutilgan = createHash('sha1').update('1700000000abc').digest('hex');
  assert.equal(clickAuth('42', 'abc', 1700000000), `42:${kutilgan}:1700000000`);
});

test('eslatmaXati: sana, summa, karta va bekor qilish havolasi bor; HTML qochirilgan', () => {
  const x = eslatmaXati({
    kimga: 'a@b.uz',
    plan: 'pro',
    summa: 400000,
    sana: d('2026-11-03T05:00:00Z'),
    karta: '8600 12** **** <b>',
    billingUrl: 'https://www.mcqueen.uz/upgrade',
  });
  assert.match(x.mavzu, /03\.11\.2026/);
  assert.match(x.html, /400 000 so'm/);
  assert.match(x.html, /&lt;b&gt;/);
  assert.doesNotMatch(x.html, /\*\*\*\* <b>/);
  assert.match(x.matn, /https:\/\/www\.mcqueen\.uz\/upgrade/);
});

test('tolovOtmadiXati: oxirgi urinishda "to\'xtatildi"', () => {
  const x = tolovOtmadiXati({
    kimga: 'a@b.uz',
    plan: 'agency',
    summa: 1,
    sana: new Date(),
    karta: 'k',
    billingUrl: 'u',
    keyingi: null,
  });
  assert.match(x.mavzu, /to'xtatildi/);
});

import { paymeQarori, clickQarori, yangilashDavrBoshi, eslatmaSanasi } from './qoidalar';

test('paymeQarori: 4 to\'langan, 50 bekor, 0 faqat 1 soatdan keyin failed', () => {
  assert.equal(paymeQarori(4, false), 'paid');
  assert.equal(paymeQarori(50, false), 'failed');
  assert.equal(paymeQarori(0, false), null);
  assert.equal(paymeQarori(0, true), 'failed');
  assert.equal(paymeQarori(5, true), null); // oraliq holat — taxmin qilinmaydi
});

test('clickQarori', () => {
  assert.equal(clickQarori(2), 'paid');
  assert.equal(clickQarori(-1), 'failed');
  assert.equal(clickQarori(1), null);
});

test('yangilashDavrBoshi: oddiy holatda sana siljimaydi; uzoq uzilishdan keyin — hozirdan', () => {
  const pu = d('2026-10-01T00:00:00Z');
  assert.equal(yangilashDavrBoshi(pu, d('2026-10-02T00:00:00Z')).toISOString(), pu.toISOString());
  assert.equal(yangilashDavrBoshi(pu, d('2026-11-20T00:00:00Z')).toISOString(), '2026-11-20T00:00:00.000Z');
});

test('eslatmaSanasi: kech ketgan eslatma kamida 7 kun keyingi sanani ko\'rsatadi', () => {
  const hozir = d('2026-10-01T00:00:00Z');
  assert.equal(eslatmaSanasi(d('2026-10-08T00:00:00Z'), hozir).toISOString(), '2026-10-08T00:00:00.000Z');
  assert.equal(eslatmaSanasi(d('2026-10-03T00:00:00Z'), hozir).toISOString(), '2026-10-08T00:00:00.000Z');
});

import { maskla, luhn } from '../../utils/xatolar';

test('maskla: Luhn\'dan o\'tgan karta raqami niqoblanadi, Meta Lead ID kabi son — yo\'q', () => {
  assert.equal(luhn('4111111111111111'), true);
  assert.equal(maskla('karta 4111 1111 1111 1111 rad'), 'karta 4111********1111 rad');
  assert.equal(maskla('lead 1234567890123456'), 'lead 1234567890123456'); // Luhn'dan o'tmaydi
  assert.match(maskla('{"card_token":"abc-123","sms_code":"55555"}'), /card_token":"\*\*\*".*sms_code":"\*\*\*"/);
});

import { paymeCheckoutUrl, paymeAuthTogrimi, merchantKalitlari, TRANZAKSIYA_TIMEOUT_MS } from './checkout';

test('paymeCheckoutUrl: base64 parametrlar, tiyin, test/prod domen', () => {
  const url = paymeCheckoutUrl({
    merchantId: 'abc123',
    hisobMaydoni: 'order_id',
    buyurtmaId: '11111111-2222-3333-4444-555555555555',
    somSumma: 400000,
    qaytishUrl: 'https://www.mcqueen.uz/upgrade',
    test: false,
  });
  assert.match(url, /^https:\/\/checkout\.paycom\.uz\//);
  const ochiq = Buffer.from(url.split('/').pop()!, 'base64').toString('utf8');
  assert.equal(
    ochiq,
    'm=abc123;ac.order_id=11111111-2222-3333-4444-555555555555;a=40000000;c=https://www.mcqueen.uz/upgrade;l=uz'
  );
  const t = paymeCheckoutUrl({ merchantId: 'm', hisobMaydoni: 'o', buyurtmaId: 'x', somSumma: 1000, qaytishUrl: 'https://a/b;c', test: true });
  assert.match(t, /^https:\/\/checkout\.test\.paycom\.uz\//);
  assert.doesNotMatch(Buffer.from(t.split('/').pop()!, 'base64').toString(), /b;c/); // ";" URL'dan olib tashlanadi
});

test('paymeAuthTogrimi: faqat "Paycom:<kalit>", har ikki kalit, buzuq sarlavha rad', () => {
  const b = (s: string) => 'Basic ' + Buffer.from(s).toString('base64');
  assert.equal(paymeAuthTogrimi(b('Paycom:KALIT'), ['KALIT']), true);
  assert.equal(paymeAuthTogrimi(b('Paycom:TEST'), ['KALIT', 'TEST']), true);
  assert.equal(paymeAuthTogrimi(b('Paycom:boshqa'), ['KALIT']), false);
  assert.equal(paymeAuthTogrimi(b('Admin:KALIT'), ['KALIT']), false);
  assert.equal(paymeAuthTogrimi(b('Paycom:KALIT'), []), false); // kalit sozlanmagan — hech kim kirmaydi
  assert.equal(paymeAuthTogrimi(undefined, ['KALIT']), false);
  assert.equal(paymeAuthTogrimi('Bearer xyz', ['KALIT']), false);
});

test('merchantKalitlari: bo\'sh qiymatlar tashlanadi', () => {
  assert.deepEqual(merchantKalitlari({ PAYME_KEY: ' a ', PAYME_TEST_KEY: '' }), ['a']);
  assert.equal(TRANZAKSIYA_TIMEOUT_MS, 12 * 3600 * 1000);
});
