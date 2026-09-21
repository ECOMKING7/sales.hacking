import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadIdShakliTogrimi, javobdanReklama, xatoSababi } from './metaLeadAds';

/* ═══════════════════════════════════════════════════════════════════════
   Toza funksiyalar — tarmoq va bazasiz.

   Bu yerdagi eng qimmat xato: noto'g'ri qiymatni Lead ID deb Meta'ga
   yuborish. Rate limit yeyiladi, javob xato bo'ladi, va xato keshga
   tushib lid abadiy atribusiyasiz qoladi.
   ═══════════════════════════════════════════════════════════════════════ */

test('15–17 xonali son — to\'g\'ri Lead ID', () => {
  assert.equal(leadIdShakliTogrimi('139702221257197'), true); // 15
  assert.equal(leadIdShakliTogrimi('1397022212571979'), true); // 16
  assert.equal(leadIdShakliTogrimi('13970222125719790'), true); // 17
});

test('telefon (12 xona) Lead ID emas', () => {
  assert.equal(leadIdShakliTogrimi('998940593900'), false);
});

test('unix vaqt (10 xona) Lead ID emas', () => {
  assert.equal(leadIdShakliTogrimi('1789736493'), false);
});

test('amoCRM lid raqami (8 xona) Lead ID emas', () => {
  assert.equal(leadIdShakliTogrimi('60335169'), false);
});

test("prefiksli teg Lead ID emas — avval raqam ajratilishi kerak", () => {
  assert.equal(leadIdShakliTogrimi('fb796849276154811'), false);
});

test('bo\'sh, null, probel — Lead ID emas', () => {
  assert.equal(leadIdShakliTogrimi(null), false);
  assert.equal(leadIdShakliTogrimi(undefined), false);
  assert.equal(leadIdShakliTogrimi(''), false);
  assert.equal(leadIdShakliTogrimi('   '), false);
});

test('atrofdagi probel kechiriladi', () => {
  assert.equal(leadIdShakliTogrimi('  1397022212571979 '), true);
});

test('javobdan ad_id va form_id ajratiladi', () => {
  const r = javobdanReklama('1397022212571979', {
    id: '1397022212571979',
    ad_id: '120210000000000000',
    form_id: '796849276154811',
  });
  assert.equal(r.adId, '120210000000000000');
  assert.equal(r.formId, '796849276154811');
});

test('ad_id son sifatida kelsa ham matnga o\'giriladi — aniqlik yo\'qolmaydi', () => {
  // ⚠ 17 xonali son Number.MAX_SAFE_INTEGER dan katta. Meta JSON'da
  // uni tirnoqsiz yuborishi mumkin va JSON.parse aniqlikni buzadi.
  // Bu yerda biz allaqachon parse qilingan qiymat bilan ishlaymiz —
  // ya'ni himoya to'liq emas. CHEKLOV, hujjatlashtirildi.
  const r = javobdanReklama('1397022212571979', { ad_id: 12345678901234567 as unknown as number });
  assert.equal(typeof r.adId, 'string');
});

test('ad_id yo\'q bo\'lsa null — xato emas (organik forma lidi)', () => {
  const r = javobdanReklama('1397022212571979', { form_id: '796849276154811' });
  assert.equal(r.adId, null);
  assert.equal(r.formId, '796849276154811');
});

test('javob bo\'sh bo\'lsa ham yiqilmaydi', () => {
  const r = javobdanReklama('1397022212571979', null);
  assert.equal(r.adId, null);
  assert.equal(r.formId, null);
  assert.equal(r.fbLeadId, '1397022212571979');
});

test('raqam bo\'lmagan ad_id rad etiladi', () => {
  const r = javobdanReklama('1397022212571979', { ad_id: 'act_123' });
  assert.equal(r.adId, null);
});

/* ---- xato xabarlari ---- */

test('190 — token yaroqsiz', () => {
  const s = xatoSababi({ response: { data: { error: { code: 190, message: 'expired' } } } });
  assert.match(s, /Token yaroqsiz/);
});

test('10 — ruxsat yetarli emas, kerakli huquq nomlanadi', () => {
  const s = xatoSababi({ response: { data: { error: { code: 10, message: 'no perm' } } } });
  assert.match(s, /ads_management/);
});

test('404 — lid Meta\'da yo\'q', () => {
  const s = xatoSababi({ response: { status: 404 } });
  assert.match(s, /topilmadi/);
});

test('TOKEN xato xabariga tushmaydi — maskalanadi', () => {
  const s = xatoSababi({
    message: 'Request failed: https://graph.facebook.com/x?access_token=EAAsecret123&fields=ad_id',
  });
  assert.ok(!s.includes('EAAsecret123'), 'token sizib chiqdi');
  assert.match(s, /access_token=\*\*\*/);
});

test('notanish xato ham matn qaytaradi, throw qilmaydi', () => {
  assert.equal(typeof xatoSababi({}), 'string');
  assert.equal(typeof xatoSababi(new Error('boom')), 'string');
});
