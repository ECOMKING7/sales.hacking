import { test } from 'node:test';
import assert from 'node:assert/strict';

// jwt.ts JWT_SECRET'siz yuklanmaydi — test uchun soxta qiymat.
process.env.JWT_SECRET ||= 'test-secret-for-amo-claim-only';

import { validAmoDomain, publicCreds } from './amocrmPublic';
import {
  signAmoClaim,
  verifyAmoClaim,
  signOAuthState,
  verifyOAuthState,
  signToken,
  verifyTokenString,
} from '../utils/jwt';

test('validAmoDomain: amoCRM domenlarini qabul qiladi', () => {
  assert.equal(validAmoDomain('furninglass.amocrm.ru'), 'furninglass.amocrm.ru');
  assert.equal(validAmoDomain('https://Test-1.amocrm.com/'), 'test-1.amocrm.com');
  assert.equal(validAmoDomain('acme.kommo.com'), 'acme.kommo.com');
});

test("validAmoDomain: begona hostni rad etadi (token o'g'irlash yo'li)", () => {
  // referer orqali tokenni o'z serveriga yubortirish urinishi
  assert.equal(validAmoDomain('evil.com'), null);
  assert.equal(validAmoDomain('amocrm.ru.evil.com'), null);
  assert.equal(validAmoDomain('x.amocrm.ru@evil.com'), null);
  assert.equal(validAmoDomain(''), null);
  assert.equal(validAmoDomain(undefined), null);
});

test("publicCreds: kalit yo'q bo'lsa null, redirect standart", () => {
  const saved = {
    id: process.env.AMOCRM_PUBLIC_CLIENT_ID,
    sec: process.env.AMOCRM_PUBLIC_CLIENT_SECRET,
    red: process.env.AMOCRM_PUBLIC_REDIRECT_URI,
  };
  delete process.env.AMOCRM_PUBLIC_CLIENT_ID;
  delete process.env.AMOCRM_PUBLIC_CLIENT_SECRET;
  delete process.env.AMOCRM_PUBLIC_REDIRECT_URI;
  assert.equal(publicCreds(), null);

  process.env.AMOCRM_PUBLIC_CLIENT_ID = 'id';
  process.env.AMOCRM_PUBLIC_CLIENT_SECRET = 'secret';
  const c = publicCreds();
  assert.equal(c?.kind, 'public');
  assert.equal(c?.redirectUri, 'https://api.mcqueen.uz/api/auth/amocrm/callback');

  if (saved.id) process.env.AMOCRM_PUBLIC_CLIENT_ID = saved.id; else delete process.env.AMOCRM_PUBLIC_CLIENT_ID;
  if (saved.sec) process.env.AMOCRM_PUBLIC_CLIENT_SECRET = saved.sec; else delete process.env.AMOCRM_PUBLIC_CLIENT_SECRET;
  if (saved.red) process.env.AMOCRM_PUBLIC_REDIRECT_URI = saved.red;
});

test("da'vo kaliti: o'zi o'tadi, OAuth state o'rnida o'tmaydi", () => {
  const t = signAmoClaim('11111111-1111-1111-1111-111111111111');
  assert.equal(verifyAmoClaim(t).pid, '11111111-1111-1111-1111-111111111111');

  // Boshqa maqsadli imzolangan token da'vo sifatida ishlamasligi kerak.
  const state = signOAuthState({ userId: 'u', workspaceId: 'w' });
  assert.throws(() => verifyAmoClaim(state));
  assert.throws(() => verifyAmoClaim('not-a-token'));
});

test("state va da'vo kaliti SESSIYA tokeni sifatida o'tmaydi", () => {
  const state = signOAuthState({ userId: 'u', workspaceId: 'w', amo: 'public' });
  const claim = signAmoClaim('11111111-1111-1111-1111-111111111111');
  assert.throws(() => verifyTokenString(state));
  assert.throws(() => verifyTokenString(claim));

  const session = signToken({ userId: 'u', email: 'a@b.c', workspaceId: 'w' });
  assert.equal(verifyTokenString(session).userId, 'u');
});

test("sessiya tokeni va da'vo kaliti OAuth state o'rnida o'tmaydi", () => {
  const session = signToken({ userId: 'u', email: 'a@b.c', workspaceId: 'w' });
  assert.throws(() => verifyOAuthState(session));
  assert.throws(() => verifyOAuthState(signAmoClaim('p')));

  const st = verifyOAuthState(signOAuthState({ userId: 'u', workspaceId: 'w', amo: 'legacy' }));
  assert.deepEqual(st, { userId: 'u', workspaceId: 'w', amo: 'legacy' });
});
