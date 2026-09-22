/* ═══════════════════════════════════════════════════════════════════════
   TELEGRAM TRANSPORTI — faqat "xabarni yetkazish"

   Bu faylda hisobot mantig'i YO'Q. U `telegramHisobot.ts` da. Bu yerda
   faqat: Telegram API'ga so'rov, xato turlarini ajratish, token'ni
   maskalash.

   ⚠ TOKEN. Bitta platforma boti — `TELEGRAM_BOT_TOKEN`, faqat .env da
   (§4.1). Bazaga tushmaydi, javobda qaytmaydi, logga chiqmaydi.

   ⚠ FAIL-SOFT. Telegram ishlamasa sotuv qayta ishlash oqimi TO'XTAMAYDI.
   Xabar yuborilmasligi noqulaylik; lid atribusiyasining uzilishi — pul.
   Shuning uchun bu yerdagi hech bir funksiya `throw` qilmaydi.
   ═══════════════════════════════════════════════════════════════════════ */

import { pool } from '../db/pool';

const BAZA = 'https://api.telegram.org';

/** Telegram javobi 5s ichida kelmasa — uzamiz. Cron vaqti cheklangan. */
const TIMEOUT_MS = 8000;

export interface YuborishNatija {
  ok: boolean;
  /** Telegram bergan sabab (maskalangan). */
  xato: string | null;
  /**
   * TRUE bo'lsa chat endi yaroqsiz: bot bloklangan, guruhdan
   * chiqarilgan yoki chat o'chirilgan. Chaqiruvchi `faol = FALSE` qiladi.
   */
  ochirilsin: boolean;
}

export function botTokenBor(): boolean {
  return Boolean((process.env.TELEGRAM_BOT_TOKEN ?? '').trim());
}

function token(): string {
  const t = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN sozlanmagan');
  return t;
}

/**
 * Har qanday matndan bot tokenini olib tashlaydi (§4.2).
 *
 * Telegram xatolari ko'pincha so'rov URL'ini o'z ichiga oladi, URL'da
 * esa token bor: `/bot123456:AAH.../sendMessage`.
 */
export function maskla(matn: string): string {
  return String(matn)
    .replace(/\/bot\d{5,}:[A-Za-z0-9_-]+/g, '/bot***')
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{30,}\b/g, '***');
}

interface TgJavob<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

async function chaqir<T>(metod: string, body: unknown): Promise<TgJavob<T>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BAZA}/bot${token()}/${metod}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return (await r.json()) as TgJavob<T>;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Bitta xabar yuboradi.
 *
 * `parse_mode: HTML` — Markdown emas. Sabab: reklama nomlarida `_`,
 * `*`, `[` belgilari bo'ladi va MarkdownV2 ularning har birini
 * ekranlashni talab qiladi; bitta o'tkazib yuborilgani butun xabarni
 * yiqitadi. HTML'da faqat `& < >` ekranlanadi (telegramMatn.esc).
 *
 * ⚠ 429 (rate limit). Telegram `retry_after` beradi. BIR MARTA kutamiz
 * va qayta urinamiz; ikkinchi 429 da voz kechamiz — cron'ning umumiy
 * vaqti cheklangan (Vercel 300s) va navbatdagi chatlar kutib qolmasin.
 */
export async function xabarYubor(chatId: string, matn: string): Promise<YuborishNatija> {
  if (!botTokenBor()) {
    return { ok: false, xato: 'TELEGRAM_BOT_TOKEN sozlanmagan', ochirilsin: false };
  }

  const gavda = {
    chat_id: chatId,
    text: matn,
    parse_mode: 'HTML',
    // Havola oldindan ko'rinishi hisobotni cho'zib yuboradi.
    disable_web_page_preview: true,
  };

  for (let urinish = 0; urinish < 2; urinish++) {
    try {
      const j = await chaqir<unknown>('sendMessage', gavda);
      if (j.ok) return { ok: true, xato: null, ochirilsin: false };

      const kod = j.error_code ?? 0;
      const sabab = maskla(j.description ?? 'nomalum xato');

      if (kod === 429 && urinish === 0) {
        const kut = Math.min(j.parameters?.retry_after ?? 1, 5);
        await new Promise((r) => setTimeout(r, kut * 1000));
        continue;
      }

      /* 403 — bot bloklangan / guruhdan chiqarilgan.
         400 + "chat not found" — chat o'chirilgan yoki id noto'g'ri.
         Ikkalasi ham qayta urinish bilan tuzalmaydi. */
      const ochirilsin =
        kod === 403 || (kod === 400 && /chat not found|group chat was upgraded/i.test(sabab));

      return { ok: false, xato: `${kod}: ${sabab}`, ochirilsin };
    } catch (err) {
      const m = maskla((err as Error).message ?? 'tarmoq xatosi');
      // AbortError — timeout. Qayta urinmaymiz: sekin Telegram butun
      // cron'ni yeb qo'yishi mumkin.
      return { ok: false, xato: m, ochirilsin: false };
    }
  }

  return { ok: false, xato: '429: rate limit', ochirilsin: false };
}

/**
 * Chatga yuboradi va natijani `telegram_chats` ga yozadi.
 *
 * Nega natija bazaga yoziladi: "nega xabar kelmayapti?" savoliga
 * javob ekranda turishi kerak. Aks holda sabab Vercel logida qoladi
 * va u yerda 1 soat yashaydi.
 */
export async function chatgaYubor(
  chatRowId: string,
  chatId: string,
  matn: string
): Promise<YuborishNatija> {
  const n = await xabarYubor(chatId, matn);

  if (n.ok) {
    await pool.query(
      `UPDATE telegram_chats
          SET oxirgi_yuborildi = now(), oxirgi_xato = NULL
        WHERE id = $1`,
      [chatRowId]
    );
  } else {
    await pool.query(
      `UPDATE telegram_chats
          SET oxirgi_xato = $2,
              faol = CASE WHEN $3 THEN FALSE ELSE faol END
        WHERE id = $1`,
      [chatRowId, n.xato, n.ochirilsin]
    );
  }

  return n;
}

/**
 * Bot username — ulanish havolasi (`t.me/<username>?start=<kod>`) va
 * guruh buyrug'i (`/ulash@<username> KOD`) uchun.
 *
 * Keshlanadi: bot nomi o'zgarmaydi, lekin `my_chat_member` oqimida
 * har qo'shilishda `getMe` chaqirish bekorga kutish.
 */
let NOM_KESH: string | null = null;

export async function botNomi(): Promise<string | null> {
  if (!botTokenBor()) return null;
  if (NOM_KESH) return NOM_KESH;
  try {
    const j = await chaqir<{ username?: string }>('getMe', {});
    NOM_KESH = j.ok ? (j.result?.username ?? null) : null;
    return NOM_KESH;
  } catch {
    return null;
  }
}

/**
 * Telegram'ga "yangilanishlarni shu manzilga yubor" deydi.
 *
 * ⚠ BU BOT DARAJASIDAGI AMAL, workspace darajasida emas: bitta bot —
 * bitta webhook manzili. Manzil har doim BIZNIKI, shuning uchun uni
 * qayta-qayta chaqirish xavfsiz (idempotent) va boshqa mijozga zarar
 * yetkazmaydi.
 *
 * `secret_token` — Telegram har so'rovda `X-Telegram-Bot-Api-Secret-Token`
 * sarlavhasida qaytaradi. Bu bizning endpoint'ni soxta "yangilanish"
 * lardan himoya qiladi: usiz har kim chat bog'lash so'rovini yasab
 * yuborishi mumkin edi.
 */
export async function webhookOrnat(
  apiBase: string,
  sir: string
): Promise<{ ok: boolean; manzil: string; xato: string | null }> {
  const manzil = `${apiBase.replace(/\/$/, '')}/api/webhooks/telegram`;
  if (!botTokenBor()) {
    return { ok: false, manzil, xato: 'TELEGRAM_BOT_TOKEN sozlanmagan' };
  }
  try {
    const j = await chaqir<boolean>('setWebhook', {
      url: manzil,
      secret_token: sir,
      /**
       * ⚠ UCHALASI HAM KERAK — bittasi tushib qolsa jim buziladi:
       *
       *   message       — shaxsiy chat va guruh.
       *   channel_post  — KANAL. Kanalga yozilgan xabar `message`
       *                   emas, `channel_post` bo'lib keladi. Faqat
       *                   `message` ga obuna bo'lsak kanaldagi
       *                   `/ulash KOD` bizgacha umuman yetib kelmaydi
       *                   va hech qayerda xato chiqmaydi.
       *   my_chat_member — bot guruhga/kanalga qo'shilgani yoki
       *                   chiqarilgani. Shu orqali qo'shilishi bilan
       *                   yo'riqnomani o'zi yozadi, chiqarilganda esa
       *                   chat `faol = FALSE` bo'ladi.
       */
      allowed_updates: ['message', 'channel_post', 'my_chat_member'],
      drop_pending_updates: true,
    });
    return {
      ok: Boolean(j.ok),
      manzil,
      xato: j.ok ? null : maskla(j.description ?? 'nomalum xato'),
    };
  } catch (err) {
    return { ok: false, manzil, xato: maskla((err as Error).message) };
  }
}

/** Webhook qaysi turdagi yangilanishlarga obuna bo'lishi SHART. */
export const KERAKLI_TURLAR = ['message', 'channel_post', 'my_chat_member'] as const;

/**
 * Joriy webhook holati — "ulanganmi?" savoliga javob.
 *
 * ⚠ `turlar` ni ham qaytaramiz. Sabab: `allowed_updates` eski ro'yxat
 * bilan qolgan bo'lsa (masalan `['message']`), kanal JIM ishlamaydi —
 * xato yo'q, javob yo'q. Ekranda ko'rinib tursa "Botni ulash" ni
 * qayta bosish yetadi.
 */
export async function webhookHolati(): Promise<{
  manzil: string | null;
  kutilayotgan: number;
  oxirgiXato: string | null;
  turlar: string[];
  yetishmayotgan: string[];
}> {
  try {
    const j = await chaqir<{
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
      allowed_updates?: string[];
    }>('getWebhookInfo', {});

    /* Telegram `allowed_updates` ni FAQAT standartdan farq qilganda
       qaytaradi. Bo'sh kelsa — "hammasi" degani, ya'ni kamchilik yo'q. */
    const turlar = j.result?.allowed_updates ?? [];
    const yetishmayotgan =
      turlar.length === 0 ? [] : KERAKLI_TURLAR.filter((t) => !turlar.includes(t));

    return {
      manzil: j.result?.url || null,
      kutilayotgan: j.result?.pending_update_count ?? 0,
      oxirgiXato: j.result?.last_error_message
        ? maskla(j.result.last_error_message)
        : null,
      turlar,
      yetishmayotgan,
    };
  } catch {
    return {
      manzil: null,
      kutilayotgan: 0,
      oxirgiXato: null,
      turlar: [],
      yetishmayotgan: [],
    };
  }
}
