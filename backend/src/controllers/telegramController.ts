/* ═══════════════════════════════════════════════════════════════════════
   TELEGRAM — sozlamalar endpointlari (JWT bilan himoyalangan)

   ⚠ BOT TOKENI BU YERDAN O'TMAYDI (§4.1). U faqat `.env` da
   (`TELEGRAM_BOT_TOKEN`). Bu endpointlar tokenni na qabul qiladi,
   na qaytaradi — faqat "sozlangan / sozlanmagan".
   ═══════════════════════════════════════════════════════════════════════ */

import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import {
  botNomi,
  botTokenBor,
  chatgaYubor,
  webhookHolati,
  webhookOrnat,
} from '../services/telegram';
import {
  DAVRLAR,
  TAFSILOTLAR,
  chatHisoboti,
  type ChatQator,
} from '../services/telegramHisobot';
import { METRIKALAR, metrikalarniTozala } from '../services/telegramMatn';

/**
 * Telegram webhook'ining siri — bot tokenidan KELIB CHIQADI.
 *
 * Nega alohida env o'zgaruvchi emas: har qo'shimcha sozlama — bu
 * unutilishi mumkin bo'lgan yana bitta qadam, va unutilsa endpoint
 * himoyasiz qoladi. Tokenning SHA-256 xash'i tokenni oshkor qilmaydi
 * (teskari hisoblab bo'lmaydi), lekin har doim bir xil.
 */
export function webhookSiri(): string {
  const t = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!t) return '';
  return crypto.createHash('sha256').update(`tg-webhook:${t}`).digest('hex').slice(0, 40);
}

function apiBaseUrl(req: Request): string {
  const override = process.env.PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, '');
  const proto = (req.header('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0];
  const host = req.header('x-forwarded-host') ?? req.header('host') ?? '';
  return `${proto}://${host}`;
}

function ws(req: Request): string | null {
  return req.user?.workspaceId ?? null;
}

/* ───────────────────────── GET /api/workspace/telegram ───────────────── */

export async function status(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const chats = await pool.query(
    `SELECT id, chat_id, nom, tur, hisobot_vaqti, vaqt_zonasi, hisobot_davri,
            metrikalar, tafsilot, tafsilot_soni, sotuv_xabari, faol,
            oxirgi_xato, oxirgi_yuborildi, oxirgi_hisobot
       FROM telegram_chats
      WHERE workspace_id = $1
      ORDER BY created_at`,
    [workspaceId]
  );

  // Bot username va webhook holati tashqi so'rov talab qiladi. Bot
  // sozlanmagan bo'lsa umuman so'ramaymiz — kutish bekorga ketmasin.
  const [nomi, hook] = botTokenBor()
    ? await Promise.all([botNomi(), webhookHolati()])
    : [null, { manzil: null, kutilayotgan: 0, oxirgiXato: null }];

  res.json({
    botSozlangan: botTokenBor(),
    botNomi: nomi,
    webhook: hook,
    chatlar: chats.rows,
    // Katalog API'dan keladi: frontendda ikkinchi ro'yxat saqlansa
    // ikkisi bir kun ajralib qoladi.
    metrikalar: METRIKALAR.map((m) => ({ kalit: m.kalit, yorliq: m.yorliq, tur: m.tur })),
    davrlar: DAVRLAR,
    tafsilotlar: TAFSILOTLAR,
  });
}

/* ────────────────── POST /api/workspace/telegram/kod ─────────────────── */

const ALIFBO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O va 1/I yo'q
const KOD_DAQIQA = 15;

export async function kodYarat(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!botTokenBor()) {
    res.status(503).json({ error: "TELEGRAM_BOT_TOKEN sozlanmagan — bot yo'q" });
    return;
  }

  const bayt = crypto.randomBytes(10);
  const kod = Array.from(bayt, (b) => ALIFBO[b % ALIFBO.length]).join('');

  await pool.query(
    `INSERT INTO telegram_kodlar (kod, workspace_id, amal_qiladi)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [kod, workspaceId, String(KOD_DAQIQA)]
  );

  // Eskilarini tozalaymiz — jadval cheksiz o'smasin.
  await pool.query(
    `DELETE FROM telegram_kodlar
      WHERE workspace_id = $1 AND (amal_qiladi < now() - interval '1 day')`,
    [workspaceId]
  );

  const nomi = await botNomi();

  res.json({
    kod,
    daqiqa: KOD_DAQIQA,
    botNomi: nomi,
    havola: nomi ? `https://t.me/${nomi}?start=${kod}` : null,
    guruhUchun: `/ulash ${kod}`,
  });
}

/* ──────────── PATCH /api/workspace/telegram/chat/:id ─────────────────── */

const yangilashSchema = z.object({
  // null — hisobot o'chiriladi. 'HH:MM' yoki 'HH:MM:SS'.
  hisobot_vaqti: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Vaqt 'HH:MM' shaklida bo'lsin")
    .nullable()
    .optional(),
  vaqt_zonasi: z.string().trim().min(3).max(64).optional(),
  hisobot_davri: z.enum(DAVRLAR).optional(),
  metrikalar: z.array(z.string()).optional(),
  tafsilot: z.enum(TAFSILOTLAR).optional(),
  tafsilot_soni: z.number().int().min(1).max(20).optional(),
  sotuv_xabari: z.boolean().optional(),
  faol: z.boolean().optional(),
});

export async function chatYangila(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = yangilashSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const b = parsed.data;

  /* Vaqt zonasini BAZANING O'ZIDA tekshiramiz: noto'g'ri nom
     (`Asia/Toshkent`) keyinchalik cron so'rovini yiqitadi va sabab
     boshqa joyda ko'rinadi. */
  if (b.vaqt_zonasi) {
    try {
      await pool.query(`SELECT now() AT TIME ZONE $1`, [b.vaqt_zonasi]);
    } catch {
      res.status(400).json({ error: `Vaqt zonasi noma'lum: ${b.vaqt_zonasi}` });
      return;
    }
  }

  const { rows } = await pool.query(
    `UPDATE telegram_chats
        SET hisobot_vaqti = CASE WHEN $3::boolean THEN $4::time ELSE hisobot_vaqti END,
            vaqt_zonasi   = COALESCE($5::text, vaqt_zonasi),
            hisobot_davri = COALESCE($6::text, hisobot_davri),
            metrikalar    = COALESCE($7::text[], metrikalar),
            tafsilot      = COALESCE($8::text, tafsilot),
            tafsilot_soni = COALESCE($9::int, tafsilot_soni),
            sotuv_xabari  = COALESCE($10::boolean, sotuv_xabari),
            faol          = COALESCE($11::boolean, faol),
            -- Qayta yoqilganda eski xato qolmasin: u endi noto'g'ri.
            oxirgi_xato   = CASE WHEN $11::boolean IS TRUE THEN NULL ELSE oxirgi_xato END
      WHERE id = $1 AND workspace_id = $2
      RETURNING id, chat_id, nom, tur, hisobot_vaqti, vaqt_zonasi, hisobot_davri,
                metrikalar, tafsilot, tafsilot_soni, sotuv_xabari, faol,
                oxirgi_xato, oxirgi_yuborildi, oxirgi_hisobot`,
    [
      req.params.id,
      workspaceId,
      Object.prototype.hasOwnProperty.call(b, 'hisobot_vaqti'),
      b.hisobot_vaqti ?? null,
      b.vaqt_zonasi ?? null,
      b.hisobot_davri ?? null,
      b.metrikalar ? metrikalarniTozala(b.metrikalar) : null,
      b.tafsilot ?? null,
      b.tafsilot_soni ?? null,
      b.sotuv_xabari ?? null,
      b.faol ?? null,
    ]
  );

  if (!rows[0]) {
    res.status(404).json({ error: 'Chat topilmadi' });
    return;
  }
  res.json(rows[0]);
}

/* ───────────── DELETE /api/workspace/telegram/chat/:id ───────────────── */

export async function chatOchir(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const r = await pool.query(
    `DELETE FROM telegram_chats WHERE id = $1 AND workspace_id = $2`,
    [req.params.id, workspaceId]
  );
  res.json({ success: true, ochirildi: r.rowCount ?? 0 });
}

/* ────────── POST /api/workspace/telegram/chat/:id/sinov ──────────────── */

export async function sinov(req: Request, res: Response): Promise<void> {
  const workspaceId = ws(req);
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { rows } = await pool.query<ChatQator & { id: string; chat_id: string }>(
    `SELECT id, workspace_id, chat_id, nom, vaqt_zonasi, hisobot_davri,
            metrikalar, tafsilot, tafsilot_soni
       FROM telegram_chats
      WHERE id = $1 AND workspace_id = $2`,
    [req.params.id, workspaceId]
  );
  const chat = rows[0];
  if (!chat) {
    res.status(404).json({ error: 'Chat topilmadi' });
    return;
  }

  try {
    // Xuddi rejali hisobotning o'zi. Boshqa matn yuborilsa sinov
    // hech narsani isbotlamaydi.
    const matn = await chatHisoboti(chat);
    const n = await chatgaYubor(chat.id, chat.chat_id, matn);
    res.json({ success: n.ok, xato: n.xato });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/* ────────── POST /api/workspace/telegram/webhook ─────────────────────── */

/**
 * Telegram'ga "yangilanishlarni shu manzilga yubor" deydi.
 *
 * ⚠ Bu BOT darajasidagi amal: manzil hamma workspace uchun bitta va
 * har doim BIZNIKI. Shuning uchun kim chaqirsa ham natija bir xil
 * (idempotent) va boshqa mijozga zarar yetmaydi.
 */
export async function webhookniOrnat(req: Request, res: Response): Promise<void> {
  if (!ws(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const sir = webhookSiri();
  if (!sir) {
    res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN sozlanmagan' });
    return;
  }
  const n = await webhookOrnat(apiBaseUrl(req), sir);
  res.json(n);
}
