import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { getAdAccounts } from './facebookOAuth';

type Resp = { data: { data: unknown[] } };

function mockGet(routes: Record<string, Resp | Error>) {
  const orig = axios.get;
  (axios as unknown as { get: unknown }).get = async (url: string) => {
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    const r = key ? routes[key] : new Error('404 ' + url);
    if (r instanceof Error) throw r;
    return r;
  };
  return () => {
    (axios as unknown as { get: unknown }).get = orig;
  };
}

test("getAdAccounts: biznes portfeli hisoblari qo'shiladi, dublikatsiz", async () => {
  const restore = mockGet({
    '/me/adaccounts': { data: { data: [{ id: 'act_1', name: 'Own' }] } },
    '/me/businesses': { data: { data: [{ id: 'b1', name: 'Agency' }] } },
    '/b1/owned_ad_accounts': { data: { data: [{ id: 'act_1', name: 'Own' }, { id: 'act_2', name: 'BM' }] } },
    '/b1/client_ad_accounts': { data: { data: [{ id: 'act_3', name: 'Client' }] } },
  });
  try {
    const r = await getAdAccounts('t');
    assert.deepEqual(r.map((a) => a.id).sort(), ['act_1', 'act_2', 'act_3']);
    assert.equal(r.find((a) => a.id === 'act_3')?.business_name, 'Agency');
  } finally {
    restore();
  }
});

test("getAdAccounts: business_management yo'q bo'lsa faqat /me/adaccounts", async () => {
  const restore = mockGet({
    '/me/adaccounts': { data: { data: [{ id: 'act_1', name: 'Own' }] } },
    '/me/businesses': new Error('(#100) Missing permission'),
  });
  try {
    const r = await getAdAccounts('t');
    assert.deepEqual(r.map((a) => a.id), ['act_1']);
  } finally {
    restore();
  }
});
