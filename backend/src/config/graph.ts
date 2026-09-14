/* ═══════════════════════════════════════════════════════════════
   Facebook Graph / Marketing API versiyasi — yagona manba.

   Meta har versiyani ~2 yildan keyin o'chiradi. Versiya o'tib ketsa
   chaqiruvlar jimgina eng eski tirik versiyaga ko'chiriladi yoki
   xato qaytaradi — ikkalasi ham xavfli.

   Versiyani kod tegmasdan almashtirish uchun .env da:
     FB_GRAPH_VERSION=v25.0

   Amaldagi muddatlar (2026-09 holatiga):
     v19.0 — 2026-05-21 da TUGAGAN  ← eski qiymat edi
     v20.0 — 2026-09-24 gacha
     v23.0 — 2027-10-08 gacha
     v24.0 — 2028-02-18 gacha   ← standart
     v25.0 — 2028-07-29 gacha
     v26.0 — eng yangisi (2026-07-29 chiqqan)
   ═══════════════════════════════════════════════════════════════ */

export const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? 'v24.0';

/** graph.facebook.com — ma'lumot chaqiruvlari */
export const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** www.facebook.com — OAuth ruxsat oynasi */
export const OAUTH_DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
