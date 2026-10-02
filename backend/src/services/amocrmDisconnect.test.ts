import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { imzoTogrimi, tokenAkkaunti } from './amocrmDisconnect';

/* amoCRM hujjatidagi formula: HMAC-SHA256("<client_id>|<account_id>", secret).
   Imzo xato o'tkazsa — begona odam istalgan mijozning ulanishini uza oladi. */
const SIR = 'test-amocrm-client-secret-value';
const CID = 'a1b2c3d4-0000-1111-2222-333344445555';
const imzo = (cid: string, acc: string, sir = SIR) =>
  crypto.createHmac('sha256', sir).update(`${cid}|${acc}`).digest('hex');

test('imzo: to\'g\'ri imzo qabul qilinadi (katta harf ham)', () => {
  assert.equal(imzoTogrimi(CID, '31234567', imzo(CID, '31234567'), SIR), true);
  assert.equal(imzoTogrimi(CID, '31234567', imzo(CID, '31234567').toUpperCase(), SIR), true);
});

test('imzo: boshqa akkaunt, boshqa sir, buzuq imzo, bo\'sh qiymat — rad', () => {
  assert.equal(imzoTogrimi(CID, '31234568', imzo(CID, '31234567'), SIR), false);
  assert.equal(imzoTogrimi(CID, '31234567', imzo(CID, '31234567', 'boshqa'), SIR), false);
  assert.equal(imzoTogrimi(CID, '31234567', 'abc', SIR), false);
  assert.equal(imzoTogrimi(CID, '31234567', imzo(CID, '31234567'), undefined), false);
  assert.equal(imzoTogrimi(undefined, '31234567', imzo(CID, '31234567'), SIR), false);
  assert.equal(imzoTogrimi(CID, undefined, imzo(CID, '31234567'), SIR), false);
});

test('token: JWT payload\'idan account_id olinadi', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'RS256' })}.${b64({ account_id: 31234567, base_domain: 'amocrm.ru' })}.sig`;
  assert.equal(tokenAkkaunti(jwt), '31234567');
  assert.equal(tokenAkkaunti('not-a-jwt'), null);
  assert.equal(tokenAkkaunti(null), null);
  assert.equal(tokenAkkaunti(`${b64({})}.${b64({ sub: 1 })}.x`), null);
});
