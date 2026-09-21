/* ═══════════════════════════════════════════════════════════════════════
   LEAD ADS TOKENI VA QAYTA YECHISH

   Uchta endpoint:
     GET  /api/workspace/lead-ads        — holat (token bormi, nechta lid yechildi)
     POST /api/workspace/lead-ads/token  — tokenni saqlash yoki o'chirish
     POST /api/workspace/lead-ads/yech   — mavjud lidlarni qayta yechish

   ⚠ TOKEN hech qachon qaytarilmaydi va log'ga tushmaydi (§4.1, §4.2).
   Faqat "bor/yo'q", uzunligi va prefiksi ko'rsatiladi — noto'g'ri
   qiymat qo'yilganini shu bilan aniqlash mumkin, qiymatni ko'rsatmasdan.
   ═══════════════════════════════════════════════════════════════════════ */

import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { encrypt } from '../utils/encryption';
import { xatoQayd } from '../utils/xatolar';
import { lidReklamasiniTop, tokenniOl } from '../services/metaLeadAds';
import { matchLeadToAd } from '../services/leadMatcher';
import { processLeadAttribution } from '../services/attributionEngine';

export async function status(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const ws = await pool.query<{ fb_lead_token: string | null }>(
      `SELECT fb_lead_token FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    const kesh = await pool.query<{ holat: string; soni: string; reklamali: string }>(
      `SELECT holat,
              COUNT(*)                                   AS soni,
              COUNT(*) FILTER (WHERE fb_ad_id IS NOT NULL) AS reklamali
         FROM fb_lead_ads WHERE workspace_id = $1
        GROUP BY holat`,
      [workspaceId]
    );
    const lidlar = await pool.query<{ jami: string; leadidli: string; boglangan: string }>(
      `SELECT COUNT(*)                                          AS jami,
              COUNT(*) FILTER (WHERE fb_lead_id IS NOT NULL)    AS leadidli,
              COUNT(*) FILTER (WHERE match_method = 'lead_id')  AS boglangan
         FROM leads WHERE workspace_id = $1 AND is_demo = false`,
      [workspaceId]
    );
    const oxirgiXato = await pool.query<{ xato: string | null }>(
      `SELECT xato FROM fb_lead_ads
        WHERE workspace_id = $1 AND holat = 'error' AND xato IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [workspaceId]
    );

    const son = (v: unknown) => Number(v) || 0;
    const q = (h: string, f: 'soni' | 'reklamali') =>
      son(kesh.rows.find((r) => r.holat === h)?.[f]);

    res.json({
      tokenBor: Boolean(ws.rows[0]?.fb_lead_token),
      lidlar: {
        jami: son(lidlar.rows[0]?.jami),
        leadIdBor: son(lidlar.rows[0]?.leadidli),
        reklamagaBoglangan: son(lidlar.rows[0]?.boglangan),
      },
      yechilgan: { ok: q('ok', 'soni'), reklamaliOk: q('ok', 'reklamali'), xato: q('error', 'soni') },
      oxirgiXato: oxirgiXato.rows[0]?.xato ?? null,
    });
  } catch (err) {
    xatoQayd(err, { joy: 'lead-ads-status', workspaceId });
    res.status(500).json({ error: "Holat o'qilmadi" });
  }
}

const tokenSchema = z.object({
  /** '' — tokenni o'chirish. Aks holda System User tokeni. */
  token: z.string().max(1000),
});

export async function saveToken(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const xom = parsed.data.token.trim();

  /* Nusxalashda eng ko'p uchraydigan xato — tokenni to'liq olmaslik
     yoki noto'g'ri qiymatni qo'yish. Shakl tekshiruvi buni saqlashdan
     OLDIN ushlaydi, aks holda xato faqat birinchi lidda ko'rinardi. */
  if (xom !== '' && !/^EAA[A-Za-z0-9_-]{50,}$/.test(xom)) {
    res.status(400).json({
      error:
        "Token shakli noto'g'ri. System User tokeni 'EAA' bilan boshlanadi va odatda 150+ belgidan iborat. Qiymatni to'liq nusxalaganingizni tekshiring.",
    });
    return;
  }

  try {
    await pool.query(
      `UPDATE workspaces
          SET fb_lead_token = CASE WHEN $1::text = '' THEN NULL ELSE $1::text END,
              updated_at = now()
        WHERE id = $2`,
      [xom === '' ? '' : encrypt(xom), workspaceId]
    );

    if (xom === '') {
      res.json({ success: true, tokenBor: false });
      return;
    }

    // Saqlangach darhol sinab ko'ramiz — "saqlandi" deyish va keyin
    // ishlamasligi eng yomon holat.
    let sinov: string | null = null;
    try {
      await tokenniOl(workspaceId);
      const bitta = await pool.query<{ fb_lead_id: string }>(
        `SELECT fb_lead_id FROM leads
          WHERE workspace_id = $1 AND fb_lead_id IS NOT NULL
          ORDER BY created_at DESC LIMIT 1`,
        [workspaceId]
      );
      if (bitta.rows[0]) {
        const n = await lidReklamasiniTop(workspaceId, bitta.rows[0].fb_lead_id, {
          qaytaUrin: true,
        });
        sinov = n.xato ? `Sinov muvaffaqiyatsiz: ${n.xato}` : n.adId
          ? `Sinov OK — reklama topildi (ad_id ${n.adId})`
          : "Sinov OK, lekin bu lidda reklama yo'q (organik bo'lishi mumkin)";
      } else {
        sinov = "Sinash uchun Lead ID'li lid topilmadi";
      }
    } catch (e) {
      sinov = `Sinov bajarilmadi: ${(e as Error).message}`;
    }

    res.json({ success: true, tokenBor: true, sinov });
  } catch (err) {
    xatoQayd(err, { joy: 'lead-ads-token', workspaceId });
    res.status(500).json({ error: 'Token saqlanmadi' });
  }
}

/**
 * Mavjud lidlarni qayta yechish.
 *
 * ⚠ Bu YOZADI: `leads.last_click_ad_id`, `match_method` va touchpoint.
 * Lekin CRM'ga emas — faqat bizning bazaga. CRM tegilmaydi (§4.3).
 *
 * `?limit=` bilan bo'laklab ishlatiladi: Vercel funksiyasi 300 soniyada
 * uziladi va uzilish jim o'tadi.
 */
export async function yech(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const xom = Number(req.query.limit);
  const limit = Number.isFinite(xom) ? Math.min(Math.max(Math.trunc(xom), 1), 200) : 50;
  const qaytaUrin = req.query.qayta === '1';

  try {
    const { rows } = await pool.query<{ id: string; fb_lead_id: string }>(
      `SELECT id, fb_lead_id
         FROM leads
        WHERE workspace_id = $1
          AND fb_lead_id IS NOT NULL
          AND is_demo = false
          AND match_method IS DISTINCT FROM 'lead_id'
        ORDER BY created_at DESC
        LIMIT $2`,
      [workspaceId, limit]
    );

    let yechildi = 0;
    let boglandi = 0;
    let reklamasiz = 0;
    const xatolar: string[] = [];

    for (const lid of rows) {
      const n = await lidReklamasiniTop(workspaceId, lid.fb_lead_id, { qaytaUrin });
      if (n.xato) {
        if (xatolar.length < 5) xatolar.push(n.xato);
        continue;
      }
      yechildi += 1;
      if (!n.adId) {
        reklamasiz += 1;
        continue;
      }

      /* Reklama bizda bormi — atribusiya dvigatelini bekorga
         chaqirmaslik uchun oldindan tekshiramiz. */
      const match = await matchLeadToAd(workspaceId, { fbAdId: n.adId }, 'utm_term');
      if (!match.adId) {
        reklamasiz += 1;
        continue;
      }

      /* Yozishni O'ZIMIZ qilmaymiz. `processLeadAttribution` lidni
         qayta hisoblaydi: u `fb_lead_ads` keshidan reklamani topadi,
         touchpoint yaratadi, `match_method` ni yozadi va reklama
         metrikalarini mutlaq qayta hisoblaydi.

         ⚠ Argument tartibi: (leadId, workspaceId). Ikkalasi ham
         `string`, shuning uchun teskari uzatilsa TypeScript ushlamaydi
         — bir marta shunday bo'lgan va 500 xato bergan. */
      const natija = await processLeadAttribution(lid.id, workspaceId);
      if (natija.lastAdId) boglandi += 1;
      else reklamasiz += 1;
    }

    res.json({
      korildi: rows.length,
      yechildi,
      reklamagaBoglandi: boglandi,
      reklamasiz,
      xatolar,
      izoh:
        rows.length === limit
          ? `Yana bo'lishi mumkin — ${limit} tasi ko'rildi. Qayta chaqiring.`
          : 'Hammasi ko\'rib chiqildi.',
    });
  } catch (err) {
    xatoQayd(err, { joy: 'lead-ads-yech', workspaceId });
    res.status(500).json({ error: 'Qayta yechish bajarilmadi' });
  }
}
