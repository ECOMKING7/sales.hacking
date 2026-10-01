/**
 * OAuth popup ↔ asosiy oyna aloqasi.
 *
 * NEGA BroadcastChannel, `window.opener` emas: facebook.com COOP
 * sarlavhasi popup va ochgan oyna orasidagi bog'ni uzadi — qaytib
 * kelganda `window.opener` null bo'ladi va `postMessage` yetib bormaydi.
 * BroadcastChannel esa bir xil origin'dagi hamma oynaga yetadi.
 */
const NOM = 'mcq-oauth';

export type OauthXabar = { tur: 'fb' | 'amocrm'; holat: string };

export function oauthXabarYubor(x: OauthXabar): void {
  try {
    const k = new BroadcastChannel(NOM);
    k.postMessage(x);
    k.close();
  } catch {
    /* eski brauzer — asosiy oyna qo'lda yangilanadi */
  }
}

/** Obuna; qaytgan funksiya obunani bekor qiladi. */
export function oauthXabargaObuna(fn: (x: OauthXabar) => void): () => void {
  try {
    const k = new BroadcastChannel(NOM);
    k.onmessage = (e) => fn(e.data as OauthXabar);
    return () => k.close();
  } catch {
    return () => undefined;
  }
}
