import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { imzoTogrimi, leadgenHodisalari, aloqaniAjrat } from './metaSahifalar';
import { boshqaTokenSinalsinmi } from './metaLeadAds';

/* Toza funksiyalar — tarmoq va bazasiz. Imzo eng qimmat joy: xato
   o'tkazsa begona odam istalgan "lid"ni bizga yozdira oladi. */

const SIR = 'test-app-secret';
const imzo = (tana: string, sir = SIR) =>
  'sha256=' + crypto.createHmac('sha256', sir).update(tana).digest('hex');

test('imzo: to\'g\'ri imzo qabul qilinadi', () => {
  const tana = '{"object":"page","entry":[]}';
  assert.equal(imzoTogrimi(Buffer.from(tana), imzo(tana), SIR), true);
});

test('imzo: boshqa sir, o\'zgargan tana, bo\'sh sarlavha — rad', () => {
  const tana = '{"object":"page"}';
  assert.equal(imzoTogrimi(Buffer.from(tana), imzo(tana, 'boshqa'), SIR), false);
  assert.equal(imzoTogrimi(Buffer.from(tana + ' '), imzo(tana), SIR), false);
  assert.equal(imzoTogrimi(Buffer.from(tana), undefined, SIR), false);
  assert.equal(imzoTogrimi(Buffer.from(tana), 'sha1=abc', SIR), false);
  assert.equal(imzoTogrimi(undefined, imzo(tana), SIR), false);
  // Sir sozlanmagan — hech qachon qabul qilinmaydi.
  assert.equal(imzoTogrimi(Buffer.from(tana), imzo(tana, ''), undefined), false);
});

test('leadgen: Meta namunaviy tanasi ajratiladi', () => {
  const h = leadgenHodisalari({
    object: 'page',
    entry: [
      {
        id: '104293821963690',
        time: 1790000000,
        changes: [
          {
            field: 'leadgen',
            value: {
              ad_id: '120211111111111111',
              form_id: '987654321',
              leadgen_id: '1397022212571979',
              created_time: 1790000000,
              page_id: '104293821963690',
              adgroup_id: '120200000000000000',
            },
          },
          { field: 'feed', value: { item: 'post' } },
        ],
      },
    ],
  });
  assert.equal(h.length, 1);
  assert.equal(h[0].leadgenId, '1397022212571979');
  assert.equal(h[0].pageId, '104293821963690');
  assert.equal(h[0].adId, '120211111111111111');
  assert.equal(h[0].vaqt?.getTime(), 1790000000 * 1000);
});

test('leadgen: organik forma (ad_id yo\'q) — adId null, hodisa saqlanadi', () => {
  const h = leadgenHodisalari({
    object: 'page',
    entry: [{ id: '1', changes: [{ field: 'leadgen', value: { leadgen_id: '123456789012345' } }] }],
  });
  assert.equal(h.length, 1);
  assert.equal(h[0].adId, null);
  assert.equal(h[0].pageId, '1');
});

test('leadgen: begona obyekt va buzuq tana — bo\'sh', () => {
  assert.deepEqual(leadgenHodisalari({ object: 'instagram', entry: [] }), []);
  assert.deepEqual(leadgenHodisalari(null), []);
  assert.deepEqual(leadgenHodisalari({ object: 'page', entry: [{ changes: [{ field: 'leadgen', value: {} }] }] }), []);
});

test('aloqa: standart va o\'zbekcha nomlar, boshqa maydonlar o\'qilmaydi', () => {
  assert.deepEqual(
    aloqaniAjrat([
      { name: 'full_name', values: ['Ali Valiyev'] },
      { name: 'phone_number', values: ['+998901234567'] },
      { name: 'email', values: ['ali@example.com'] },
    ]),
    { telefon: '+998901234567', email: 'ali@example.com' }
  );
  assert.deepEqual(
    aloqaniAjrat([{ name: 'Telefon raqamingiz', values: ['90 123 45 67'] }]),
    { telefon: '90 123 45 67', email: null }
  );
  assert.deepEqual(aloqaniAjrat(undefined), { telefon: null, email: null });
});

test('token: ruxsat/yaroqsiz xatoda keyingi token sinaladi, tarmoq xatosida yo\'q', () => {
  const xato = (code: number, status = 400) => ({ response: { status, data: { error: { code } } } });
  assert.equal(boshqaTokenSinalsinmi(xato(10)), true);
  assert.equal(boshqaTokenSinalsinmi(xato(200)), true);
  assert.equal(boshqaTokenSinalsinmi(xato(190)), true);
  assert.equal(boshqaTokenSinalsinmi(xato(100)), true);
  assert.equal(boshqaTokenSinalsinmi(xato(4)), false); // rate limit — boshqa token yordam bermaydi
  assert.equal(boshqaTokenSinalsinmi(new Error('ECONNRESET')), false);
});
