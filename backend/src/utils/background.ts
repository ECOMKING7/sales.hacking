/**
 * Javob yuborilgandan KEYIN ham ishni tugatish.
 *
 * Muammo: serverless muhitda javob ketishi bilan funksiya o'ldiriladi.
 * Ya'ni "200 qaytar, keyin async qayta ishla" naqshi Vercel'da lidni yo'qotadi.
 *
 * Yechim: Vercel'da `waitUntil` funksiyani tirik ushlab turadi.
 * Doimiy serverda (Railway, lokal) u kerak emas — oddiy fire-and-forget yetadi.
 */

type WaitUntil = (promise: Promise<unknown>) => void;

let waitUntilFn: WaitUntil | null = null;

// @vercel/functions faqat Vercel'da mavjud bo'lishi mumkin — import xatosi
// butun modulni yiqitmasligi uchun himoyalangan require.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@vercel/functions') as { waitUntil?: WaitUntil };
  if (typeof mod.waitUntil === 'function') {
    waitUntilFn = mod.waitUntil;
  }
} catch {
  /* Vercel'da emasmiz — muammo yo'q */
}

/**
 * Ishni fonda tugatish. Xato hech qachon tashqariga chiqmaydi — faqat log.
 * @param work bajarilayotgan promise
 * @param label log uchun nom
 */
export function runInBackground(work: Promise<unknown>, label: string): Promise<void> {
  const guarded = work.then(
    () => undefined,
    (err: unknown) => {
      console.error(`[background] ${label} xatoga uchradi:`, err);
    }
  );

  if (waitUntilFn && process.env.VERCEL) {
    try {
      waitUntilFn(guarded);
    } catch (err) {
      console.error('[background] waitUntil chaqirib bo\'lmadi:', err);
    }
  }

  return guarded;
}

/**
 * Ishni berilgan vaqtgacha kutadi. Ulgursa — tugagan holda qaytadi.
 * Ulgurmasa — qolganini fonga topshiradi va baribir qaytadi.
 *
 * Webhook uchun kerak: amoCRM 2xx ni tez kutadi, lekin biz ishni
 * yo'qotib qo'yishimiz ham mumkin emas.
 */
export async function awaitWithDeadline(
  work: Promise<unknown>,
  ms: number,
  label: string
): Promise<{ finished: boolean }> {
  let timer: NodeJS.Timeout | undefined;
  const guarded = runInBackground(work, label);

  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });

  const result = await Promise.race([guarded.then(() => 'done' as const), timeout]);
  if (timer) clearTimeout(timer);

  return { finished: result === 'done' };
}
