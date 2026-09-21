/* ═══════════════════════════════════════════════════════════════════════
   WEBHOOK'NI TA'MINLASH — "lid tushganda bizga xabar kelsinmi?"

   NEGA BU FAYL BOR. amoCRM'da integratsiyani o'rnatish (OAuth) va
   webhook obunasi — IKKI BOSHQA NARSA:

     OAuth   → biz CRM'dan TORTIB OLAMIZ (import ishlaydi)
     Webhook → CRM bizga TURTADI (yangi lid, etap o'zgarishi)

   Bu farq bir marta 3 oyni yedi. Integratsiya o'rnatilgan edi, import
   15 659 lid tortgan edi, va hamma "ulangan" deb o'ylardi. Lekin
   webhook hech qachon ro'yxatdan o'tmagan — ya'ni yangi lid kelganda
   bizga hech narsa kelmagan. CAPI ishlamagan, touchpoint yozilmagan,
   atribusiya 0% turgan. Hech qayerda xato chiqmagan.

   Shuning uchun bu endi QO'LDA emas: ulanish oqimining bir qismi.

   ⚠ BU FUNKSIYA CRM GA YOZADI (§4.3). Qat'iy chegaralar:

     1. AVVAL O'QIYDI. Bizning webhook allaqachon bo'lsa — hech narsa
        yozmaydi (idempotent).
     2. FAQAT O'ZIMIZNIKINI qo'shadi. Boshqa integratsiyalarning
        webhook'lariga tegmaydi.
     3. HECH NARSANI O'CHIRMAYDI. `DELETE` bu faylda umuman yo'q.
     4. Bitta yozuvga ham ta'sir qilmaydi: webhook obunasi lid,
        kontakt yoki bitimni o'zgartirmaydi.
     5. Orqaga qaytarish: mijoz amoCRM'da "Veb-kancalar" oynasidan
        o'chirishi mumkin, yoki biz `listWebhooks` da ko'rsatamiz.

   Ya'ni eng yomon holat — mijozning CRM'ida bitta ortiqcha webhook
   qatori paydo bo'lishi. Ma'lumot yo'qolmaydi, buzilmaydi.
   ═══════════════════════════════════════════════════════════════════════ */

import { pool } from '../db/pool';
import { amoGetPath, amoPost } from './amocrmService';
import { bizniki, hostAjrat } from './webhookIdentity';

/**
 * Obuna bo'ladigan hodisalar.
 *
 * `add_lead`     — yangi lid. Atribusiya zanjirining boshi.
 * `status_lead`  — etap o'zgardi. Sotuv shu yerdan bilinadi.
 * `add_contact`  — kontakt. Telefon/email hash'i shu yerdan to'ladi.
 *
 * ⚠ Obuna bo'lmagan hodisa UMUMAN kelmaydi — "keyin qo'shamiz" degan
 * narsa yo'q, qayta ro'yxatdan o'tkazish kerak bo'ladi.
 */
export const HODISALAR = ['add_lead', 'status_lead', 'add_contact'] as const;

export interface TaminNatija {
  /** 'bor' — allaqachon bor edi · 'qoshildi' — biz qo'shdik · 'xato' */
  holat: 'bor' | 'qoshildi' | 'xato';
  manzil: string | null;
  hodisalar: string[];
  /** Boshqa integratsiyalarning webhook'lari — mijoz bilishi uchun. */
  begona: Array<{ host: string; hodisalar: string[] }>;
  xabar: string;
}

interface AmoWebhook {
  id?: number;
  destination?: string;
  settings?: string[];
  disabled?: boolean;
}

/** `?secret=` ni maskalab qaytaradi (§4.2). */
function maskla(url: string): string {
  return url.replace(/([?&](secret|token)=)[^&]+/gi, '$1***');
}

/**
 * Bizning webhook borligiga ishonch hosil qiladi.
 *
 * @param apiBase bizning API'ning tashqi manzili (`https://...`)
 */
export async function webhookniTaminla(
  workspaceId: string,
  apiBase: string
): Promise<TaminNatija> {
  const bos = { holat: 'xato' as const, manzil: null, hodisalar: [], begona: [] };

  const { rows } = await pool.query<{ amocrm_webhook_secret: string | null }>(
    `SELECT amocrm_webhook_secret FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const secret = rows[0]?.amocrm_webhook_secret;
  if (!secret) {
    return { ...bos, xabar: "Webhook siri yo'q — avval amoCRM'ni ulang." };
  }

  const bizningHost = hostAjrat(apiBase);
  if (!bizningHost) {
    return { ...bos, xabar: `API manzili aniqlanmadi (${apiBase}).` };
  }

  const manzil = `${apiBase.replace(/\/$/, '')}/api/webhooks/amocrm?secret=${secret}`;

  /* ── 1. O'QISH ────────────────────────────────────────────────────
     Yozishdan oldin har doim. Ikki marta qo'shish mijozga ikki
     marta xabar yuborilishi demak. */
  let xom: AmoWebhook[] = [];
  try {
    const javob = await amoGetPath<{ _embedded?: { webhooks?: AmoWebhook[] } }>(
      workspaceId,
      '/api/v4/webhooks'
    );
    xom = javob?._embedded?.webhooks ?? [];
  } catch (err) {
    return { ...bos, xabar: `Webhook ro'yxati o'qilmadi: ${(err as Error).message}` };
  }

  const begona = xom
    .filter((w) => w.destination && !bizniki(w.destination, bizningHost) && !w.disabled)
    .map((w) => {
      let host = '(nomalum)';
      try {
        host = new URL(w.destination as string).hostname;
      } catch {
        /* URL emas — hostsiz ko'rsatamiz */
      }
      return { host, hodisalar: w.settings ?? [] };
    });

  const bizniki_lar = xom.filter(
    (w) => w.destination && bizniki(w.destination, bizningHost) && !w.disabled
  );

  const yetishmayotgan = HODISALAR.filter(
    (h) => !bizniki_lar.some((w) => (w.settings ?? []).includes(h))
  );

  if (bizniki_lar.length > 0 && yetishmayotgan.length === 0) {
    return {
      holat: 'bor',
      manzil: maskla(bizniki_lar[0].destination as string),
      hodisalar: bizniki_lar[0].settings ?? [],
      begona,
      xabar: 'Webhook allaqachon ro\'yxatda va kerakli hodisalarga obuna.',
    };
  }

  /* ── 2. YOZISH ────────────────────────────────────────────────────
     Faqat shu yerda va faqat bitta narsa: o'z manzilimiz.

     amoCRM `POST /api/v4/webhooks` da bir xil manzil qayta yuborilsa
     uni YANGILAYDI, dublikat yaratmaydi — shuning uchun yetishmayotgan
     hodisa bo'lsa ham xuddi shu chaqiruv to'g'rilaydi. */
  try {
    await amoPost(workspaceId, '/api/v4/webhooks', [
      { destination: manzil, settings: [...HODISALAR] },
    ]);
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string };
    const sabab =
      e.response?.status === 403
        ? "amoCRM ruxsat bermadi (403) — integratsiyaga webhook huquqi kerak"
        : (e.message ?? 'nomalum xato');
    return { ...bos, begona, xabar: `Webhook qo'shilmadi: ${sabab}` };
  }

  return {
    holat: 'qoshildi',
    manzil: maskla(manzil),
    hodisalar: [...HODISALAR],
    begona,
    xabar:
      bizniki_lar.length > 0
        ? `Webhook yangilandi — yetishmayotgan hodisalar qo'shildi: ${yetishmayotgan.join(', ')}`
        : 'Webhook ro\'yxatdan o\'tkazildi. Endi yangi lid tushganda darhol xabar keladi.',
  };
}
