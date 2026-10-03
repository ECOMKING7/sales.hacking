import axios from 'axios';
import crypto from 'crypto';

/* ─────────────────────────────────────────────────────────────
   Click Merchant API — karta tokeni (avto-yechish uchun).

   ⚠ TEKSHIRILISHI KERAK: endpoint yo'llari va javob maydonlari Click
   Merchant API hujjati (docs.click.uz → Merchant API) asosida yozilgan,
   lekin bu sessiyada rasmiy sahifani to'liq o'qib bo'lmadi. Click
   test kalitlari kelgach birinchi navbatda shu modul sinaladi.

   Avtorizatsiya:  Auth: <merchant_user_id>:<sha1(timestamp + secret_key)>:<timestamp>
   Baza:           https://api.click.uz/v2/merchant
     POST   /card_token/request   {service_id, card_number, expire_date(MMYY), temporary}
     POST   /card_token/verify    {service_id, card_token, sms_code}
     POST   /card_token/payment   {service_id, card_token, amount, transaction_parameter}
     DELETE /card_token/{service_id}/{card_token}
     GET    /payment/status/{service_id}/{payment_id}

   ⚠ temporary=0 (qayta ishlatiladigan token) Click tomonidan ALOHIDA
   yoqiladi — merchant arizasida "рекуррентные платежи" so'ralsin.

   Karta raqami bu modul orqali o'tadi (Payme'dagidek brauzer rejimi yo'q),
   lekin HECH QAYERDA saqlanmaydi va loglanmaydi: axios xato tozalovchisi
   so'rov tanasini (config) butunlay olib tashlaydi.
   ───────────────────────────────────────────────────────────── */

export interface ClickSozlama {
  serviceId: number;
  userId: string;
  kalit: string;
  url: string;
}

export function clickSozlama(env: NodeJS.ProcessEnv = process.env): ClickSozlama | null {
  const serviceId = Number((env.CLICK_SERVICE_ID ?? '').trim());
  const userId = (env.CLICK_MERCHANT_USER_ID ?? '').trim();
  const kalit = (env.CLICK_SECRET_KEY ?? '').trim();
  if (!Number.isInteger(serviceId) || serviceId <= 0 || !userId || !kalit) return null;
  return { serviceId, userId, kalit, url: 'https://api.click.uz/v2/merchant' };
}

/** Toza funksiya — testlanadi. */
export function clickAuth(userId: string, kalit: string, timestamp: number): string {
  const digest = crypto.createHash('sha1').update(`${timestamp}${kalit}`).digest('hex');
  return `${userId}:${digest}:${timestamp}`;
}

export class ClickXato extends Error {
  constructor(
    message: string,
    public kod?: number
  ) {
    super(message);
    this.name = 'ClickXato';
  }
}

interface ClickJavob {
  error_code: number;
  error_note?: string;
}

async function sorov<T extends ClickJavob>(
  s: ClickSozlama,
  method: 'GET' | 'POST' | 'DELETE',
  yol: string,
  data?: object
): Promise<T> {
  const ts = Math.floor(Date.now() / 1000);
  let javob: T;
  try {
    ({ data: javob } = await axios.request<T>({
      method,
      url: `${s.url}${yol}`,
      data,
      timeout: 25_000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Auth: clickAuth(s.userId, s.kalit, ts),
      },
    }));
  } catch (err) {
    // Click rad javobini ham 4xx bilan qaytarishi mumkin — matnini saqlaymiz.
    const d = (err as { response?: { data?: ClickJavob } }).response?.data;
    if (d && typeof d.error_code === 'number') {
      throw new ClickXato(d.error_note || `Click xatosi ${d.error_code}`, d.error_code);
    }
    throw err;
  }
  // Tushunarsiz javob ClickXato EMAS: pul yechilgan bo'lishi mumkin → natija 'noma'lum'.
  if (!javob || typeof javob.error_code !== 'number') throw new Error('Click javobi tushunarsiz');
  if (javob.error_code !== 0) throw new ClickXato(javob.error_note || `Click xatosi ${javob.error_code}`, javob.error_code);
  return javob;
}

export async function clickTokenSora(
  s: ClickSozlama,
  kartaRaqami: string,
  muddat: string
): Promise<{ token: string; telefon?: string }> {
  const r = await sorov<ClickJavob & { card_token: string; phone_number?: string }>(s, 'POST', '/card_token/request', {
    service_id: s.serviceId,
    card_number: kartaRaqami.replace(/\D/g, ''),
    expire_date: muddat.replace(/\D/g, ''),
    temporary: 0,
  });
  if (!r.card_token) throw new ClickXato('Click karta tokenini qaytarmadi');
  return { token: r.card_token, telefon: r.phone_number };
}

export async function clickTokenTasdiqla(s: ClickSozlama, token: string, smsKod: string): Promise<{ karta?: string }> {
  const r = await sorov<ClickJavob & { card_number?: string }>(s, 'POST', '/card_token/verify', {
    service_id: s.serviceId,
    card_token: token,
    // ⚠ Tekshirilishi kerak: Click sms_code'ni son kutadi deb yozilgan; kod 0 bilan
    // boshlansa son ko'rinishida yo'qoladi. Shuning uchun boshida 0 bo'lsa satr yuboriladi.
    sms_code: /^0/.test(smsKod) ? smsKod.replace(/\D/g, '') : Number(smsKod.replace(/\D/g, '')),
  });
  return { karta: r.card_number };
}

/** payment_status: 2 = muvaffaqiyatli; 1/0 = jarayonda; manfiy = rad etildi. (tekshirilishi kerak) */
export const CLICK_TOLANGAN = 2;

export async function clickYech(
  s: ClickSozlama,
  token: string,
  somSumma: number,
  tolovId: string
): Promise<{ paymentId: string; holat: number }> {
  const r = await sorov<ClickJavob & { payment_id: number | string; payment_status: number }>(
    s,
    'POST',
    '/card_token/payment',
    { service_id: s.serviceId, card_token: token, amount: somSumma, transaction_parameter: tolovId }
  );
  // payment_id yo'q bo'lsa "undefined" satri saqlanmasin — ref yo'q = holat noma'lum.
  if (r.payment_id === undefined || r.payment_id === null || r.payment_id === '') {
    throw new Error("Click payment_id qaytarmadi — natija noma'lum");
  }
  return { paymentId: String(r.payment_id), holat: Number(r.payment_status) };
}

export async function clickTolovHolati(s: ClickSozlama, paymentId: string): Promise<number> {
  const r = await sorov<ClickJavob & { payment_status: number }>(
    s,
    'GET',
    `/payment/status/${s.serviceId}/${encodeURIComponent(paymentId)}`
  );
  return Number(r.payment_status);
}

export async function clickTokenOchir(s: ClickSozlama, token: string): Promise<void> {
  await sorov(s, 'DELETE', `/card_token/${s.serviceId}/${encodeURIComponent(token)}`);
}
