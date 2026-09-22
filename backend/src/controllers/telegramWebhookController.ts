/* ═══════════════════════════════════════════════════════════════════════
   TELEGRAM WEBHOOK — bot qabul qiladigan buyruqlar

   Asosiy vazifa: chatni workspace'ga bog'lash. Chat uch xil bo'ladi va
   UCHALASI HAM ishlashi kerak — shaxsiy, guruh, kanal.

   ─── TELEGRAM'NING IKKI TUZOG'I ─────────────────────────────────────

   1. KANAL boshqa turdagi yangilanish yuboradi.
      Guruh/shaxsiy chat  → `update.message`
      Kanal               → `update.channel_post`
      Faqat `message` ni o'qisak kanal JIM ishlamaydi: xato yo'q,
      javob yo'q, sabab ko'rinmaydi.

   2. GURUHDA privacy mode (standart YOQILGAN) buyruqni filtrlaydi.
      Telegram hujjati: bot `/buyruq@bot_nomi` ni har doim oladi,
      oddiy `/buyruq` ni esa FAQAT o'zi oxirgi yozgan bot bo'lsa.
      Shuning uchun foydalanuvchiga ko'rsatiladigan buyruq har doim
      `@bot_nomi` bilan bo'lishi kerak.

   Ikkalasi ham hujjatdan tekshirildi (core.telegram.org/bots/features,
   .../bots/api#update), taxmin emas.

   ─── HIMOYA ────────────────────────────────────────────────────────
   Telegram har so'rovda `X-Telegram-Bot-Api-Secret-Token` qaytaradi
   (biz `setWebhook` da berganimiz). Usiz har kim soxta "yangilanish"
   yasab, o'z chat_id sini begona akkauntga bog'lashi mumkin bo'lardi.

   ⚠ JAVOB HAR DOIM 200. Telegram 2xx bo'lmasa qayta yuboradi va ko'p
   marta xato bo'lsa webhook'ni umuman o'chirib qo'yadi.
   ═══════════════════════════════════════════════════════════════════════ */

import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { botNomi, xabarYubor } from '../services/telegram';
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
  message?: { text?: string; chat?: TgChat };
  /** KANAL. `message` emas — 1-tuzoqqa qarang. */
  channel_post?: { text?: string; chat?: TgChat };
  my_chat_member?: {
    chat?: TgChat;
    new_chat_member?: { status?: string };
  };
}

function chatNomi(c: TgChat): string {
  return c.title ?? c.username ?? c.first_name ?? `chat ${String(c.id ?? '')}`;
}

/** Foydalanuvchiga ko'rsatiladigan buyruq — HAR DOIM `@bot_nomi` bilan. */
async function ulashBuyrugi(kod = 'KOD'): Promise<string> {
  const nom = await botNomi();
  return nom ? `/ulash@${nom} ${kod}` : `/ulash ${kod}`;
}

async function yordam(): Promise<string> {
  const b = await ulashBuyrugi();
  return (
    'Buyruqlar:\n' +
    `<code>${b}</code> — shu chatni akkauntga bog'lash\n` +
    '<code>/holat</code> — bog‘langanmi, tekshirish\n' +
    '<code>/ochir</code> — bog‘lanishni uzish\n\n' +
    'KOD ni platformadagi Sozlamalar → Telegram bo‘limidan olasiz.'
  );
}

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

    if (u?.my_chat_member) {
      await azolikOzgardi(u);
      return;
    }

    // Kanal `channel_post`, qolgani `message`. Ikkalasi bir xil ishlanadi.
    const post = u?.message ?? u?.channel_post;
    const chat = post?.chat;
    const matn = (post?.text ?? '').trim();
    if (!chat?.id || !matn) return;

    const chatId = String(chat.id);

    // `/start KOD`, `/ulash KOD`, `/ulash@bot KOD` — hammasi bir xil.
    const [xomBuyruq, ...qolgan] = matn.split(/\s+/);
    const buyruq = xomBuyruq.toLowerCase().split('@')[0];
    const arg = (qolgan[0] ?? '').trim().toUpperCase();

    if (buyruq === '/start' || buyruq === '/ulash') {
      if (!arg) {
        await xabarYubor(chatId, await yordam());
        return;
      }
      await ulash(chatId, chat, arg);
      return;
    }

    if (buyruq === '/holat') {
      await holat(chatId);
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
      await xabarYubor(chatId, await yordam());
    }
  } catch (err) {
    xatoQayd(err, { joy: 'telegram-webhook' });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   BOT GURUHGA/KANALGA QO'SHILDI YOKI CHIQARILDI

   Nega kerak: foydalanuvchi botni guruhga qo'shadi va keyin nima
   qilishni bilmaydi. Bot o'zi yo'riqnomani yozsa — qadam yo'qolmaydi.

   Chiqarilganda `faol = FALSE`: aks holda har hisobotda 403 olib,
   xatoni bazaga yozib yuraverardik.
   ═══════════════════════════════════════════════════════════════════════ */
async function azolikOzgardi(u: TgUpdate): Promise<void> {
  const chat = u.my_chat_member?.chat;
  const holati = u.my_chat_member?.new_chat_member?.status ?? '';
  if (!chat?.id) return;
  const chatId = String(chat.id);

  if (holati === 'left' || holati === 'kicked') {
    await pool.query(
      `UPDATE telegram_chats
          SET faol = FALSE,
              oxirgi_xato = 'Bot chatdan chiqarildi'
        WHERE chat_id = $1`,
      [chatId]
    );
    return;
  }

  if (holati !== 'member' && holati !== 'administrator') return;

  // Allaqachon bog'langan bo'lsa — qayta yo'riqnoma bermaymiz, faqat
  // tiklaymiz (guruh supergruppaga aylanganda ham shu yo'l).
  const bor = await pool.query(
    `UPDATE telegram_chats
        SET faol = TRUE, oxirgi_xato = NULL, nom = $2, tur = $3
      WHERE chat_id = $1
      RETURNING id`,
    [chatId, chatNomi(chat), chat.type ?? null]
  );
  if (bor.rowCount) {
    await xabarYubor(chatId, '✅ Bot qaytdi — xabarlar davom etadi.');
    return;
  }

  const kanalmi = chat.type === 'channel';
  await xabarYubor(
    chatId,
    `👋 Salom! Bu chatni akkauntingizga bog‘lash uchun:\n\n` +
      '1. Platformada <b>Sozlamalar → Telegram → "Kod olish"</b>\n' +
      `2. Kodni shu yerga yozing:\n<code>${await ulashBuyrugi()}</code>\n\n` +
      (kanalmi
        ? '⚠️ Kanal uchun bot <b>administrator</b> bo‘lishi va "Post yuborish" ' +
          'huquqiga ega bo‘lishi kerak — aks holda hisobot yuborilmaydi.'
        : '⚠️ Buyruqni <b>@bot nomi bilan</b> yozing — Telegram guruhda ' +
          'oddiy buyruqni botga yetkazmasligi mumkin.')
  );
}

async function holat(chatId: string): Promise<void> {
  const { rows } = await pool.query<{
    nom: string;
    sotuv_xabari: boolean;
    faol: boolean;
    hisobot_vaqti: string | null;
  }>(
    `SELECT w.name AS nom, t.sotuv_xabari, t.faol, t.hisobot_vaqti
       FROM telegram_chats t
       JOIN workspaces w ON w.id = t.workspace_id
      WHERE t.chat_id = $1`,
    [chatId]
  );

  if (!rows.length) {
    await xabarYubor(chatId, `Bu chat hech qaysi akkauntga bog‘lanmagan.\n\n${await yordam()}`);
    return;
  }

  const q = rows
    .map((r) => {
      const qism = [r.faol ? 'faol' : "to'xtatilgan"];
      if (r.sotuv_xabari) qism.push('sotuv xabari');
      qism.push(
        r.hisobot_vaqti ? `hisobot ${r.hisobot_vaqti.slice(0, 5)}` : "hisobot o'chiq"
      );
      return `• <b>${r.nom}</b> — ${qism.join(' · ')}`;
    })
    .join('\n');

  await xabarYubor(chatId, `Bog‘langan akkauntlar:\n${q}`);
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

  await pool.query(
    `INSERT INTO telegram_chats
       (workspace_id, chat_id, nom, tur, metrikalar, oxirgi_hisobot)
     VALUES ($1, $2, $3, $4, $5::text[], (now() AT TIME ZONE 'Asia/Tashkent')::date)
     ON CONFLICT (workspace_id, chat_id) DO UPDATE
       SET nom = EXCLUDED.nom,
           tur = EXCLUDED.tur,
           faol = TRUE,
           oxirgi_xato = NULL`,
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
}
