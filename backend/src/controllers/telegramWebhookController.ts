/* ═══════════════════════════════════════════════════════════════════════
   TELEGRAM WEBHOOK — bot qabul qiladigan buyruqlar

   Faqat bitta jiddiy vazifa: chatni workspace'ga bog'lash.

   ⚠ HIMOYA. Telegram har so'rovda `X-Telegram-Bot-Api-Secret-Token`
   sarlavhasini qaytaradi (biz `setWebhook` da bergan qiymat). Usiz
   har kim soxta "yangilanish" yasab, o'z chat_id sini bog'lash
   so'rovini yuborishi mumkin bo'lardi.

   Sir bot tokenidan hisoblanadi (telegramController.webhookSiri) —
   ya'ni sozlanadigan yana bitta narsa emas.

   ⚠ JAVOB HAR DOIM 200. Telegram 2xx bo'lmasa qayta yuboradi va
   ko'p marta xato bo'lsa webhook'ni umuman o'chirib qo'yadi. Xato
   bo'lsa ham 200 qaytaramiz, sababni logga yozamiz.
   ═══════════════════════════════════════════════════════════════════════ */

import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { xabarYubor } from '../services/telegram';
import { STANDART_METRIKALAR } from '../services/telegramMatn';
import { xatoQayd } from '../utils/xatolar';
import { webhookSiri } from './telegramController';

interface TgChat {
  id?: number | string;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
}
interface TgUpdate {
  message?: {
    text?: string;
    chat?: TgChat;
  };
}

function chatNomi(c: TgChat): string {
  return (
    c.title ??
    c.username ??
    c.first_name ??
    `chat ${String(c.id ?? '')}`
  );
}

const YORDAM =
  'Buyruqlar:\n' +
  '<code>/ulash KOD</code> — shu chatni hisobotga bog‘lash\n' +
  '<code>/holat</code> — bog‘langanmi, tekshirish\n' +
  '<code>/ochir</code> — bog‘lanishni uzish\n\n' +
  'KOD ni platformadagi Sozlamalar → Telegram bo‘limidan olasiz.';

export async function telegramWebhook(req: Request, res: Response): Promise<void> {
  // Telegram javobni kutmasin.
  res.status(200).json({ ok: true });

  try {
    const sir = webhookSiri();
    const kelgan = req.header('x-telegram-bot-api-secret-token') ?? '';
    if (!sir || kelgan !== sir) {
      console.warn('telegram webhook: sir mos kelmadi');
      return;
    }

    const u = req.body as TgUpdate;
    const chat = u?.message?.chat;
    const matn = (u?.message?.text ?? '').trim();
    if (!chat?.id || !matn) return;

    const chatId = String(chat.id);

    // `/start KOD`, `/ulash KOD`, `/start@bot KOD` — hammasi bir xil.
    const [xomBuyruq, ...qolgan] = matn.split(/\s+/);
    const buyruq = xomBuyruq.toLowerCase().split('@')[0];
    const arg = (qolgan[0] ?? '').trim().toUpperCase();

    if (buyruq === '/start' || buyruq === '/ulash') {
      if (!arg) {
        await xabarYubor(chatId, YORDAM);
        return;
      }
      await ulash(chatId, chat, arg);
      return;
    }

    if (buyruq === '/holat') {
      const { rows } = await pool.query<{ nom: string; sotuv_xabari: boolean; faol: boolean }>(
        `SELECT w.name AS nom, t.sotuv_xabari, t.faol
           FROM telegram_chats t
           JOIN workspaces w ON w.id = t.workspace_id
          WHERE t.chat_id = $1`,
        [chatId]
      );
      if (!rows.length) {
        await xabarYubor(chatId, `Bu chat hech qaysi akkauntga bog‘lanmagan.\n\n${YORDAM}`);
        return;
      }
      const q = rows
        .map(
          (r) =>
            `• <b>${r.nom}</b> — ${r.faol ? 'faol' : "to'xtatilgan"}` +
            `${r.sotuv_xabari ? ', sotuv xabari yoqilgan' : ''}`
        )
        .join('\n');
      await xabarYubor(chatId, `Bog‘langan akkauntlar:\n${q}`);
      return;
    }

    if (buyruq === '/ochir') {
      const r = await pool.query(`DELETE FROM telegram_chats WHERE chat_id = $1`, [chatId]);
      await xabarYubor(
        chatId,
        r.rowCount
          ? `Bog‘lanish uzildi (${r.rowCount} ta). Endi bu chatga xabar kelmaydi.`
          : 'Bu chat bog‘lanmagan edi.'
      );
      return;
    }

    if (buyruq.startsWith('/')) {
      await xabarYubor(chatId, YORDAM);
    }
  } catch (err) {
    xatoQayd(err, { joy: 'telegram-webhook' });
  }
}

/**
 * Kodni tekshiradi va chatni bog'laydi.
 *
 * ⚠ KOD BIR MARTALIK. `UPDATE ... WHERE ishlatilgan IS NULL RETURNING`
 * — bitta so'rovda tekshirish va band qilish. Ikki qadamga bo'lsak
 * (avval SELECT, keyin UPDATE) bir vaqtda kelgan ikki xabar bitta
 * kodni ikki marta ishlatishi mumkin edi.
 */
async function ulash(chatId: string, chat: TgChat, kod: string): Promise<void> {
  const { rows } = await pool.query<{ workspace_id: string }>(
    `UPDATE telegram_kodlar
        SET ishlatilgan = now()
      WHERE kod = $1 AND ishlatilgan IS NULL AND amal_qiladi > now()
      RETURNING workspace_id`,
    [kod]
  );

  if (!rows[0]) {
    await xabarYubor(
      chatId,
      'Kod yaroqsiz yoki muddati o‘tgan (15 daqiqa).\n' +
        'Sozlamalar → Telegram bo‘limidan yangi kod oling.'
    );
    return;
  }

  const workspaceId = rows[0].workspace_id;

  const saqlandi = await pool.query<{ id: string }>(
    `INSERT INTO telegram_chats
       (workspace_id, chat_id, nom, tur, metrikalar, oxirgi_hisobot)
     VALUES ($1, $2, $3, $4, $5::text[], (now() AT TIME ZONE 'Asia/Tashkent')::date)
     ON CONFLICT (workspace_id, chat_id) DO UPDATE
       SET nom = EXCLUDED.nom,
           tur = EXCLUDED.tur,
           faol = TRUE,
           oxirgi_xato = NULL
     RETURNING id`,
    [workspaceId, chatId, chatNomi(chat), chat.type ?? null, STANDART_METRIKALAR]
  );

  const { rows: w } = await pool.query<{ name: string }>(
    `SELECT name FROM workspaces WHERE id = $1`,
    [workspaceId]
  );

  await xabarYubor(
    chatId,
    `✅ Ulandi: <b>${w[0]?.name ?? 'akkaunt'}</b>\n\n` +
      'Sotuv bo‘lganda darhol xabar keladi.\n' +
      'Rejali hisobot hozircha <b>o‘chirilgan</b> — vaqtini Sozlamalar → ' +
      'Telegram bo‘limida tanlang.\n\n' +
      `<i>Chat id: ${chatId}</i>`
  );

  void saqlandi;
}
