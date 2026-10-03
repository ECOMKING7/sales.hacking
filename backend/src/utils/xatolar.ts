/**
 * Xatolarni bir joyga yig'ish (Sentry).
 *
 * NEGA KERAK: Vercel log'i bepul tarifda 1 SOAT saqlanadi. Ya'ni kechasi
 * soat 2 da sinxron yiqilsa, ertalab 9 da sabab yo'q — faqat natija
 * ("raqamlar noto'g'ri") qoladi. Import paytidagi "14 xato" ni ham
 * ekranda ko'rgan raqam sifatida emas, xato matni bilan ko'rish kerak edi.
 *
 * ATAMA — Sentry: xatolarni yig'adigan tashqi xizmat. Server xato
 * bersa, xato matni + qaysi fayl + qaysi qator + qancha marta takrorlangani
 * o'sha yerga tushadi va saqlanib qoladi. Bu ICHKI asbob — loyiha
 * egalari uchun. Mijoz uni ko'rmaydi va u haqda bilmaydi ham.
 *
 * ATAMA — DSN: Sentry bergan manzil (link). Kod xatoni qayerga
 * yuborishini shundan biladi. Bu PAROL EMAS — u faqat "yozish"
 * huquqiga ega, o'qish uchun Sentry akkauntiga kirish kerak. Baribir
 * .env da turadi.
 *
 * QOIDA (§4.2): token hech qachon tashqariga chiqmaydi. Shuning uchun
 * har bir xato yuborilishidan OLDIN `maskla()` dan o'tadi — matn
 * ichidagi Bearer, secret=, webhook kodi yulduzchaga almashadi.
 *
 * SENTRY_DSN qo'yilmagan bo'lsa — hammasi console.error bo'lib qoladi.
 * Ya'ni bu fayl hech qachon ilovani yiqitmaydi.
 */

/** Sentry moduli — faqat DSN bo'lsa yuklanadi. */
type SentryModule = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown, hint?: Record<string, unknown>) => void;
  flush: (timeout?: number) => Promise<boolean>;
};

let sentry: SentryModule | null = null;
let urinildi = false;

/**
 * Maxfiy qismlarni yulduzchaga almashtiradi.
 *
 * Toza funksiya — testdan o'tadi, bazaga ham tarmoqqa ham tegmaydi.
 */
export function maskla(matn: string): string {
  if (!matn) return matn;
  return (
    matn
      // Authorization: Bearer <token>
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer ***')
      // ?secret=... &token=... "access_token": "..."
      .replace(
        /\b(secret|token|api_key|apikey|password|access_token|refresh_token|client_secret|code|card_token|card_number|sms_code|karta|muddat|kod)\b("?\s*[=:]\s*"?)([^&\s",}]+)/gi,
        '$1$2***'
      )
      // Bitrix24 webhook: https://xxx.bitrix24.ru/rest/1/<kod>/
      .replace(/(\/rest\/\d+\/)[A-Za-z0-9]+/g, '$1***')
      // JWT (eyJ... bilan boshlanadi, uch qismli)
      .replace(/\beyJ[A-Za-z0-9._\-]{20,}/g, 'eyJ***')
      // Karta raqami (PAN): 16 raqam, bo'sh joy/chiziq bilan ham. Faqat Luhn'dan
      // o'tganlari — aks holda Meta Lead ID kabi uzun ID'lar ham yo'qolib, log
      // diagnostikaga yaramay qolardi.
      .replace(/\b(?:\d[ -]?){15}\d\b/g, (m) => (luhn(m) ? `${m.replace(/\D/g, '').slice(0, 4)}********${m.replace(/\D/g, '').slice(-4)}` : m))
  );
}

/** Luhn tekshiruvi — karta raqamini tasodifiy uzun sondan ajratadi. */
export function luhn(raqam: string): boolean {
  const r = raqam.replace(/\D/g, '');
  if (r.length < 13 || r.length > 19) return false;
  let jami = 0;
  for (let i = 0; i < r.length; i++) {
    let d = Number(r[r.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    jami += d;
  }
  return jami % 10 === 0;
}

/** Sentry ni bir marta yoqadi. DSN yo'q bo'lsa — null qaytaradi. */
function sentryYoq(): SentryModule | null {
  if (urinildi) return sentry;
  urinildi = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;

  try {
    // require — Sentry o'rnatilmagan bo'lsa ham kod ishlashi uchun.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@sentry/node') as SentryModule;
    mod.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      // Tracing (tezlik o'lchash) o'chirilgan — bizga xato kerak, tezlik emas.
      tracesSampleRate: 0,
      // PII: IP, cookie, so'rov tanasi YUBORILMAYDI.
      sendDefaultPii: false,
      // Oxirgi to'siq: yuborilayotgan hamma matn maskadan o'tadi.
      // So'rov tanasi umuman ketmaydi (karta raqami, SMS kod bo'lishi mumkin).
      beforeSend: (event: unknown) => {
        const e = event as { request?: { data?: unknown } };
        if (e?.request) delete e.request.data;
        return tozala(event);
      },
    });
    sentry = mod;
    return sentry;
  } catch (err) {
    console.error('Sentry yoqilmadi (davom etamiz):', (err as Error).message);
    return null;
  }
}

/**
 * Yuborilayotgan hodisaning HAMMA matnini maskadan o'tkazadi va
 * xavfli sarlavhalarni butunlay olib tashlaydi.
 */
export function tozala<T>(event: T): T {
  const korilgan = new WeakSet<object>();

  const yur = (qiymat: unknown): unknown => {
    if (typeof qiymat === 'string') return maskla(qiymat);
    if (!qiymat || typeof qiymat !== 'object') return qiymat;
    if (korilgan.has(qiymat as object)) return qiymat;
    korilgan.add(qiymat as object);

    if (Array.isArray(qiymat)) {
      for (let i = 0; i < qiymat.length; i += 1) qiymat[i] = yur(qiymat[i]);
      return qiymat;
    }

    const obj = qiymat as Record<string, unknown>;
    for (const kalit of Object.keys(obj)) {
      if (/^(authorization|cookie|x-webhook-secret|set-cookie)$/i.test(kalit)) {
        obj[kalit] = '***';
        continue;
      }
      obj[kalit] = yur(obj[kalit]);
    }
    return obj;
  };

  return yur(event) as T;
}

export interface XatoKonteksti {
  /** Qayerda bo'ldi: 'sync', 'amocrm-import', 'webhook', 'fx' ... */
  joy: string;
  /** Qaysi mijoz — Sentry da filtrlash uchun. */
  workspaceId?: string | null;
  /** Qo'shimcha: sahifa raqami, lid id si va h.k. Token BO'LMASIN. */
  qoshimcha?: Record<string, unknown>;
}

/**
 * Xatoni log'ga yozadi va (DSN bo'lsa) Sentry ga yuboradi.
 *
 * Hech qachon otmaydi (throw qilmaydi) — xato haqida xabar berish
 * asosiy ishni to'xtatmasligi kerak.
 */
export function xatoQayd(err: unknown, kontekst: XatoKonteksti): void {
  const xabar = maskla(err instanceof Error ? err.message : String(err));
  const ws = kontekst.workspaceId ? ` ws=${kontekst.workspaceId}` : '';
  console.error(`[${kontekst.joy}]${ws} ${xabar}`);

  const s = sentryYoq();
  if (!s) return;

  try {
    s.captureException(err, {
      tags: { joy: kontekst.joy, workspace: kontekst.workspaceId ?? 'yoq' },
      extra: tozala({ ...(kontekst.qoshimcha ?? {}) }),
    });
  } catch (e) {
    console.error('Sentry ga yuborilmadi:', (e as Error).message);
  }
}

/**
 * Serverless uchun MAJBURIY: funksiya javob qaytargach darhol o'ladi,
 * navbatdagi xato yuborilmay qolishi mumkin. Shuning uchun javobdan
 * oldin kutib turamiz.
 *
 * Doimiy serverda bu deyarli darhol qaytadi.
 */
export async function xatolarniYubor(kutish = 2000): Promise<void> {
  const s = sentryYoq();
  if (!s) return;
  try {
    await s.flush(kutish);
  } catch {
    // jim — yuborilmasa ham ish davom etadi
  }
}
