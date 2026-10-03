import axios from 'axios';

/* ─────────────────────────────────────────────────────────────
   Email yuborish — Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email).

   Env: RESEND_API_KEY, EMAIL_FROM ("McQueen AI <billing@mcqueen.uz>")
   ⚠ EMAIL_FROM domeni (mcqueen.uz) Resend'da tasdiqlangan bo'lishi shart
     (DNS: SPF + DKIM yozuvlari) — aks holda xatlar rad etiladi yoki spamga tushadi.

   FAIL-SOFT EMAS: chaqiruvchi natijaga qarab "yuborildi" deb belgilaydi.
   Kalit yo'q bo'lsa `false` qaytadi — cron keyingi safar qayta urinadi.
   ───────────────────────────────────────────────────────────── */

export interface Xat {
  kimga: string;
  mavzu: string;
  html: string;
  matn: string;
}

export function emailSozlanganmi(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean((env.RESEND_API_KEY ?? '').trim() && (env.EMAIL_FROM ?? '').trim());
}

/** `takrorKaliti` — Resend Idempotency-Key: javob kechiksa ham xat ikki marta ketmaydi. */
export async function emailYubor(x: Xat, takrorKaliti?: string): Promise<boolean> {
  const kalit = (process.env.RESEND_API_KEY ?? '').trim();
  const from = (process.env.EMAIL_FROM ?? '').trim();
  if (!kalit || !from) {
    console.warn('email: RESEND_API_KEY yoki EMAIL_FROM sozlanmagan — xat yuborilmadi');
    return false;
  }
  try {
    await axios.post(
      'https://api.resend.com/emails',
      { from, to: [x.kimga], subject: x.mavzu, html: x.html, text: x.matn },
      {
        headers: { Authorization: `Bearer ${kalit}`, ...(takrorKaliti ? { 'Idempotency-Key': takrorKaliti } : {}) },
        timeout: 15_000,
      }
    );
    return true;
  } catch (err) {
    console.warn('email yuborilmadi:', (err as Error).message);
    return false;
  }
}
