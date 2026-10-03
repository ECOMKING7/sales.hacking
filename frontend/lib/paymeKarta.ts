/**
 * Payme Subscribe API — BRAUZER tomoni (cards.create / get_verify_code / verify).
 *
 * Karta raqami TO'G'RIDAN-TO'G'RI Payme'ga ketadi, bizning serverga
 * kelmaydi. Serverga faqat tasdiqlangan TOKEN yuboriladi.
 * X-Auth: faqat kassa ID (ochiq ma'lumot, kalit emas).
 *
 * Payme talabi: karta inputlarida `name` atributi bo'lmasin, formada `action` bo'lmasin.
 */
export interface PaymeSozlama {
  merchantId: string;
  test: boolean;
}

export class PaymeBrauzerXato extends Error {}

async function rpc<T>(s: PaymeSozlama, method: string, params: object): Promise<T> {
  const url = s.test ? 'https://checkout.test.paycom.uz/api' : 'https://checkout.paycom.uz/api';
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth': s.merchantId },
      body: JSON.stringify({ id: Date.now(), method, params }),
    });
  } catch {
    throw new PaymeBrauzerXato("Payme bilan aloqa yo'q — internetni tekshiring");
  }
  const data = await res.json().catch(() => null);
  if (!data) throw new PaymeBrauzerXato('Payme javobi tushunarsiz');
  if (data.error) {
    const m = data.error.message;
    const matn = typeof m === 'string' ? m : m?.uz || m?.ru || m?.en || 'Payme xatosi';
    throw new PaymeBrauzerXato(matn);
  }
  return data.result as T;
}

/** 1-qadam: token + SMS yuborish. */
export async function paymeKartaBoshla(
  s: PaymeSozlama,
  raqam: string,
  muddatMMYY: string
): Promise<{ token: string; telefon: string | null; kutish: number }> {
  const c = await rpc<{ card: { token: string } }>(s, 'cards.create', {
    card: { number: raqam.replace(/\D/g, ''), expire: muddatMMYY.replace(/\D/g, '') },
    save: true,
  });
  const v = await rpc<{ sent: boolean; phone?: string; wait?: number }>(s, 'cards.get_verify_code', {
    token: c.card.token,
  });
  return { token: c.card.token, telefon: v.phone ?? null, kutish: v.wait ?? 60000 };
}

/** 2-qadam: SMS kod bilan tasdiqlash. */
export async function paymeKartaTasdiqla(s: PaymeSozlama, token: string, kod: string): Promise<void> {
  const r = await rpc<{ card: { verify?: boolean } }>(s, 'cards.verify', { token, code: kod.replace(/\D/g, '') });
  if (!r.card?.verify) throw new PaymeBrauzerXato('Karta tasdiqlanmadi');
}
