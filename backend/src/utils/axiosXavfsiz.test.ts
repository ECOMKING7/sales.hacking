import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'util';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { axiosXatoniTozala } from './axiosXavfsiz';

/* Prod logida FB tokeni ochiq chiqqan edi — bu test o'sha hodisani
   takrorlaydi: xato obyekti to'liq chop etilganda sir ko'rinmasligi kerak. */
const SIR = 'EAAtestSIRtoken1234567890abcdef';

function soxtaXato() {
  const config = {
    method: 'get',
    url: `https://graph.facebook.com/v24.0/me/adaccounts?access_token=${SIR}`,
    params: { access_token: SIR, fields: 'id' },
    headers: new AxiosHeaders({ Authorization: `Bearer ${SIR}` }),
  };
  const request = { _header: `GET /me?access_token=${SIR} HTTP/1.1`, responseUrl: `https://x/?access_token=${SIR}` };
  const response = {
    status: 400,
    statusText: 'Bad Request',
    headers: { 'x-app-usage': '{"call_count":1}' },
    data: { error: { code: 190, message: 'Error validating access token' } },
    config,
    request,
  };
  return new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', config as never, request, response as never);
}

test('axios xatosi: chop etilganda token ko\'rinmaydi', () => {
  const e = axiosXatoniTozala(soxtaXato());
  const matn = inspect(e, { depth: 10 });
  assert.equal(matn.includes(SIR), false, 'token logga tushmoqda');
  assert.equal(JSON.stringify(e).includes(SIR), false);
});

test('axios xatosi: kod uchun kerakli maydonlar saqlanadi', () => {
  const e = axiosXatoniTozala(soxtaXato()) as AxiosError<{ error: { code: number } }>;
  assert.equal(axios.isAxiosError(e), true);
  assert.equal(e.response?.status, 400);
  assert.equal(e.response?.data.error.code, 190);
  assert.equal((e.response?.headers as Record<string, string>)['x-app-usage'], '{"call_count":1}');
  assert.equal(e.code, 'ERR_BAD_REQUEST');
  assert.match(e.message, /\[fb 190:/);
});

test('axios bo\'lmagan xato o\'zgarmaydi', () => {
  const x = new Error('oddiy');
  assert.equal(axiosXatoniTozala(x), x);
});
