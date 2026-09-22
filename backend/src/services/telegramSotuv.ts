/* ═══════════════════════════════════════════════════════════════════════
   2-ISH: SOTUV XABARI — darhol

   "Sotuv bo'ldi ga o'tkazilsa srazu habar kelishi kerak: bu reklama
   guruhidan, bu kampaniyadan, bu videodan $... summali sotuv bo'ldi."

   ─── QACHON CHAQIRILADI ─────────────────────────────────────────────
   `webhookController.handleLeadStatus` da, ATRIBUSIYADAN KEYIN.
   Tartib muhim: `processLeadAttribution` `last_click_ad_id` ni
   yozadi. Undan oldin chaqirsak reklama nomi hali bo'sh bo'ladi va
   har sotuv "reklama aniqlanmadi" deb ketadi.

   ─── TAKROR ─────────────────────────────────────────────────────────
   amoCRM hodisani qayta yuboradi. `telegram_sotuvlar` yozuvi AVVAL
   band qilinadi (INSERT ... ON CONFLICT DO NOTHING), keyin xabar
   ketadi. Ya'ni ikkinchi hodisa jim o'tadi.

   ⚠ Natija: Telegram yiqilsa xabar YO'QOLADI (yozuv allaqachon band).
   Bu ataylab: takroriy "sotuv" xabari — ishonchni yo'qotadi,
   yo'qolgan xabar — dashboardda ko'rinadi. Ikkovidan kamrog'i tanlandi.

   ─── FAIL-SOFT ──────────────────────────────────────────────────────
   Bu funksiya HECH QACHON throw qilmaydi. Sotuvning bazaga yozilishi
   va atribusiyasi telegramdan muhimroq.
   ═══════════════════════════════════════════════════════════════════════ */

import { pool } from '../db/pool';
import { xatoQayd } from '../utils/xatolar';
import { botTokenBor, chatgaYubor } from './telegram';
import { sotuvMatni } from './telegramMatn';

interface SotuvQator {
  crm_lead_id: string | null;
  revenue: string;
  kun: string | null;
  match_method: string | null;
  reklama: string | null;
  guruh: string | null;
  kampaniya: string | null;
  akkaunt: string;
  valyuta: string | null;
}

/**
 * @param leadRowId `leads.id` (UUID), amoCRM lid raqami EMAS.
 *
 * ⚠ Bu farq bir marta 500 xatosiga olib kelgan: ikkala argument ham
 * `string` va TypeScript ularni ajratmaydi.
 */
export async function sotuvXabariniYubor(
  workspaceId: string,
  leadRowId: string
): Promise<void> {
  try {
    if (!botTokenBor()) return;

    const chatlar = await pool.query<{
      id: string;
      chat_id: string;
      message_thread_id: string | null;
    }>(
      `SELECT id, chat_id, message_thread_id
         FROM telegram_chats
        WHERE workspace_id = $1 AND faol = TRUE AND sotuv_xabari = TRUE`,
      [workspaceId]
    );
    if (chatlar.rows.length === 0) return;

    const { rows } = await pool.query<SotuvQator>(
      `SELECT l.crm_lead_id,
              l.revenue,
              l.match_method,
              CASE
                WHEN l.won_at IS NOT NULL AND l.crm_created_at IS NOT NULL
                THEN ROUND(EXTRACT(EPOCH FROM (l.won_at - l.crm_created_at)) / 86400)::text
                ELSE NULL
              END AS kun,
              a.name  AS reklama,
              s.name  AS guruh,
              c.name  AS kampaniya,
              w.name  AS akkaunt,
              w.currency AS valyuta
         FROM leads l
         JOIN workspaces w ON w.id = l.workspace_id
         LEFT JOIN ads       a ON a.id = l.last_click_ad_id
         LEFT JOIN adsets    s ON s.id = a.adset_id
         LEFT JOIN campaigns c ON c.id = a.campaign_id
        WHERE l.id = $1 AND l.workspace_id = $2`,
      [leadRowId, workspaceId]
    );

    const r = rows[0];
    if (!r) return;

    const matn = sotuvMatni({
      akkaunt: r.akkaunt,
      summa: Number(r.revenue ?? 0),
      valyuta: r.valyuta,
      kampaniya: r.kampaniya,
      guruh: r.guruh,
      reklama: r.reklama,
      crmLeadId: r.crm_lead_id,
      dealTimeKun: r.kun === null ? null : Number(r.kun),
      moslikUsuli: r.match_method,
    });

    for (const chat of chatlar.rows) {
      try {
        // Band qilish — yuborishdan OLDIN.
        const band = await pool.query(
          `INSERT INTO telegram_sotuvlar (chat_row_id, lead_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [chat.id, leadRowId]
        );
        if (!band.rowCount) continue; // allaqachon yuborilgan

        await chatgaYubor(chat.id, chat.chat_id, matn, chat.message_thread_id);
      } catch (err) {
        xatoQayd(err, {
          joy: 'telegram-sotuv-chat',
          workspaceId,
          qoshimcha: { chatRow: chat.id },
        });
      }
    }
  } catch (err) {
    xatoQayd(err, { joy: 'telegram-sotuv', workspaceId, qoshimcha: { leadRowId } });
  }
}
