/**
 * axios xatolaridan SIRLARNI olib tashlash (§4.2).
 *
 * MUAMMO (prod logida topildi): `console.error('...', err)` axios xatosini
 * to'liq chop etadi — `config.params.access_token`, `request._header`,
 * `responseUrl` ichida Facebook tokeni OCHIQ holda Vercel logiga tushardi.
 * amoCRM'da esa `config.headers.Authorization: Bearer ...`.
 *
 * YECHIM: global axios'ga bitta interceptor. Xato kodga qaytishidan OLDIN:
 *   - `config` → faqat method + maskalangan URL (params/headers yo'q);
 *   - `request` → o'chiriladi (ichida xom HTTP sarlavha va URL bor);
 *   - `response` → faqat status, statusText, headers, data qoladi
 *     (kod `response.status`, `response.data.error.code`,
 *     `response.headers` ni o'qiydi — ular saqlanadi);
 *   - `message` → maskla() dan o'tadi.
 *
 * Xato obyekti O'SHA AxiosError bo'lib qoladi — `axios.isAxiosError`,
 * `instanceof AxiosError` va `err.code` ishlashda davom etadi.
 *
 * Yon ta'sir bilan ulanadi: `import './utils/axiosXavfsiz'` — app.ts'ning
 * eng boshida, har qanday so'rovdan oldin.
 */
import axios, { AxiosError } from 'axios';
import { maskla } from './xatolar';

const BELGI = Symbol.for('mcq.axiosXavfsiz');

/** Toza funksiya — testlanadi. Xatoni joyida tozalaydi va qaytaradi. */
export function axiosXatoniTozala(err: unknown): unknown {
  if (!axios.isAxiosError(err)) return err;
  const e = err as AxiosError & Record<string, unknown>;

  const method = e.config?.method;
  const url = e.config?.url ? maskla(String(e.config.url).split('?')[0]) : undefined;
  // `config` tipda majburiy — minimal xavfsiz shakl bilan almashtiramiz.
  (e as { config: unknown }).config = { method, url };

  delete (e as { request?: unknown }).request;

  if (e.response) {
    const r = e.response;
    const headers = { ...(r.headers as Record<string, unknown>) };
    delete headers['set-cookie'];
    (e as { response: unknown }).response = {
      status: r.status,
      statusText: r.statusText,
      headers,
      // Javob tanasi ham sir aks ettirishi mumkin (token almashish xatosi) —
      // string bo'lsa maskla; obyektni kod o'qiydi (error.code), tegilmaydi.
      data: typeof r.data === 'string' ? maskla(r.data) : r.data,
    };
  }

  if (typeof e.message === 'string') e.message = maskla(e.message);
  if (typeof e.stack === 'string') e.stack = maskla(e.stack);

  // Facebook xatosining qisqa izohi — logda darhol ko'rinsin.
  const fb = (e.response?.data as { error?: { code?: number; message?: string } } | undefined)?.error;
  if (fb?.code !== undefined && !e.message.includes('[fb ')) {
    e.message = `${e.message} [fb ${fb.code}: ${maskla(String(fb.message ?? ''))}]`;
  }
  return e;
}

const g = globalThis as Record<symbol, unknown>;
if (!g[BELGI]) {
  g[BELGI] = true;
  axios.interceptors.response.use(
    (r) => r,
    (err) => Promise.reject(axiosXatoniTozala(err))
  );
}
