import axios from 'axios';

/* ─────────────────────────────────────────────────────────────
   Payme Subscribe API — SERVER tomoni.
   Hujjat: https://developer.help.paycom.uz/protokol-subscribe-api/

   Karta raqami BIZNING serverimizga UMUMAN kelmaydi: cards.create /
   get_verify_code / verify brauzerdan to'g'ridan-to'g'ri Payme'ga
   (X-Auth: <kassa id>) yuboriladi. Bizga faqat TOKEN keladi.

   Server chaqiruvlari: X-Auth: <kassa id>:<kalit>
     cards.check, cards.remove, receipts.create, receipts.pay, receipts.check

   Env: PAYME_MERCHANT_ID (kassa id), PAYME_KEY (kalit), PAYME_TEST=true
   ⚠ Subscribe API kassada ALOHIDA yoqiladi — Payme menejeridan so'raladi.
   ───────────────────────────────────────────────────────────── */

export interface PaymeSozlama {
  id: string;
  kalit: string;
  url: string;
  test: boolean;
}

export function paymeSozlama(env: NodeJS.ProcessEnv = process.env): PaymeSozlama | null {
  const id = (env.PAYME_MERCHANT_ID ?? '').trim();
  const kalit = (env.PAYME_KEY ?? '').trim();
  if (!id || !kalit) return null;
  const test = env.PAYME_TEST === 'true';
  return {
    id,
    kalit,
    test,
    url: test ? 'https://checkout.test.paycom.uz/api' : 'https://checkout.paycom.uz/api',
  };
}

export class PaymeXato extends Error {
  constructor(
    message: string,
    public kod?: number
  ) {
    super(message);
    this.name = 'PaymeXato';
  }
}

/** Payme xato xabari string yoki {ru, uz, en} bo'lishi mumkin. */
function xatoMatni(m: unknown): string {
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object') {
    const o = m as Record<string, string>;
    return o.uz || o.ru || o.en || 'Payme xatosi';
  }
  return 'Payme xatosi';
}

let soroqId = 1;

async function rpc<T>(s: PaymeSozlama, method: string, params: object): Promise<T> {
  const { data } = await axios.post(
    s.url,
    { id: soroqId++, method, params },
    {
      headers: { 'X-Auth': `${s.id}:${s.kalit}`, 'Content-Type': 'application/json' },
      timeout: 20_000,
    }
  );
  if (data?.error) throw new PaymeXato(xatoMatni(data.error.message), data.error.code);
  return data.result as T;
}

export interface PaymeKarta {
  number?: string;
  expire?: string;
  token: string;
  recurrent?: boolean;
  verify?: boolean;
}

/** Token haqiqiymi, SMS bilan tasdiqlanganmi va qayta yechishga yaroqlimi. */
export async function paymeKartaTekshir(s: PaymeSozlama, token: string): Promise<PaymeKarta> {
  const r = await rpc<{ card: PaymeKarta }>(s, 'cards.check', { token });
  return r.card;
}

export async function paymeKartaOchir(s: PaymeSozlama, token: string): Promise<void> {
  await rpc(s, 'cards.remove', { token });
}

/** Chek holatlari: 4 = to'langan; 50 = bekor qilingan. Qolganlari — jarayonda. */
export const PAYME_TOLANGAN = 4;
export const PAYME_BEKOR = 50;

/**
 * Fiskal ma'lumot (IKPU/MXIK kodi). O'zbekistonda onlayn to'lov cheki
 * fiskallashtirilishi talab qilinadi — kodlar env'dan, qotirilmaydi.
 * ⚠ Tekshirilishi kerak: aniq IKPU va package_code ni soliq maslahatchisi
 *   yoki Payme menejeri bilan tasdiqlang. Env bo'sh bo'lsa detail yuborilmaydi.
 */
function fiskalDetail(somSumma: number, nom: string, env: NodeJS.ProcessEnv) {
  const code = (env.BILLING_IKPU_KOD ?? '').trim();
  const packageCode = (env.BILLING_PACKAGE_KOD ?? '').trim();
  if (!code || !packageCode) return undefined;
  const vat = Number(env.BILLING_QQS_FOIZ ?? '0');
  return {
    receipt_type: 0,
    items: [
      {
        title: nom,
        price: Math.round(somSumma * 100),
        count: 1,
        code,
        package_code: packageCode,
        vat_percent: Number.isFinite(vat) ? vat : 0,
      },
    ],
  };
}

export async function paymeChekYarat(
  s: PaymeSozlama,
  p: { somSumma: number; tolovId: string; tavsif: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const detail = fiskalDetail(p.somSumma, p.tavsif, env);
  const r = await rpc<{ receipt: { _id: string } }>(s, 'receipts.create', {
    amount: Math.round(p.somSumma * 100),
    // ⚠ "order_id" kassa sozlamasidagi hisob maydoni nomi bilan bir xil bo'lishi
    // kerak (Payme kabinet → Kassa → Hisob maydonlari). Boshqacha bo'lsa — env.
    account: { [(env.PAYME_ACCOUNT_FIELD ?? 'order_id').trim()]: p.tolovId },
    description: p.tavsif,
    ...(detail ? { detail } : {}),
  });
  return r.receipt._id;
}

export async function paymeChekTola(s: PaymeSozlama, chekId: string, token: string): Promise<number> {
  const r = await rpc<{ receipt: { state: number } }>(s, 'receipts.pay', { id: chekId, token });
  return r.receipt.state;
}

export async function paymeChekHolati(s: PaymeSozlama, chekId: string): Promise<number> {
  const r = await rpc<{ state: number }>(s, 'receipts.check', { id: chekId });
  return r.state;
}
