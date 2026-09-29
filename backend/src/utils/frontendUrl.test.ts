import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendUrl } from './frontendUrl';

test("frontendUrl: ro'yxatdan birinchisini oladi", () => {
  const saved = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = ' https://www.mcqueen.uz/ , https://sales-hacking-web.vercel.app';
  assert.equal(frontendUrl(), 'https://www.mcqueen.uz');
  process.env.FRONTEND_URL = 'https://sales-hacking-web.vercel.app';
  assert.equal(frontendUrl(), 'https://sales-hacking-web.vercel.app');
  delete process.env.FRONTEND_URL;
  assert.equal(frontendUrl(), 'http://localhost:5173');
  if (saved !== undefined) process.env.FRONTEND_URL = saved;
});
