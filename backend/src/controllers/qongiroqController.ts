/* ═══════════════════════════════════════════════════════════════
   GET/POST /api/workspace/qongiroq-voronka

   Qo'ng'iroq voronkasi → call kampaniya xaritasi (046).

   §3.5: ID taxmin qilinmaydi. GET voronkalarni amoCRM API'dan,
   kampaniyalarni sync qilingan `campaigns` jadvalidan O'QIYDI va
   ko'rsatadi; odam tanlaydi; POST faqat shu ro'yxatlarda BOR ID'ni
   qabul qiladi.

   CRM'ga hech narsa YOZILMAYDI — faqat bizning `workspaces` jadvali.
   ═══════════════════════════════════════════════════════════════ */

import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { getPipelines } from '../services/amocrmService';
import {
  qongiroqSxemasiniTaminla,
  xaritaniTozala,
  type QongiroqXaritasi,
} from '../services/qongiroq';

interface Statistika {
  davr_kun: number;
  lidlar: number;
  reklamaga_boglangan: number;
  sotuvlar: number;
  daromad: number;
  capi_ok: number;
  capi_xato: number;
}

/** Oxirgi 30 kun: xarita haqiqatda ishlayaptimi — taxmin emas, fakt. */
async function statistika(workspaceId: string): Promise<Statistika> {
  const { rows } = await pool.query<{
    lidlar: string;
    boglangan: string;
    sotuvlar: string;
    daromad: string | null;
  }>(
    `SELECT COUNT(*)                                          AS lidlar,
            COUNT(*) FILTER (WHERE last_click_ad_id IS NOT NULL) AS boglangan,
            COUNT(*) FILTER (WHERE status = 'won')            AS sotuvlar,
            COALESCE(SUM(revenue) FILTER (WHERE status = 'won'), 0) AS daromad
       FROM leads
      WHERE workspace_id = $1 AND kanal = 'qongiroq'
        AND COALESCE(crm_created_at, created_at) >= now() - interval '30 days'`,
    [workspaceId]
  );
  let capiOk = 0;
  let capiXato = 0;
  try {
    const c = await pool.query<{ ok: string; xato: string }>(
      `SELECT COUNT(*) FILTER (WHERE e.status = 'ok')    AS ok,
              COUNT(*) FILTER (WHERE e.status = 'error') AS xato
         FROM capi_events e
         JOIN leads l ON l.id = e.lead_id
        WHERE e.workspace_id = $1 AND l.kanal = 'qongiroq'
          AND e.sent_at >= now() - interval '30 days'`,
      [workspaceId]
    );
    capiOk = Number(c.rows[0]?.ok ?? 0);
    capiXato = Number(c.rows[0]?.xato ?? 0);
  } catch {
    /* capi_events bo'lmasligi mumkin (CAPI hech yoqilmagan) — nol */
  }
  const r = rows[0];
  return {
    davr_kun: 30,
    lidlar: Number(r?.lidlar ?? 0),
    reklamaga_boglangan: Number(r?.boglangan ?? 0),
    sotuvlar: Number(r?.sotuvlar ?? 0),
    daromad: Number(r?.daromad ?? 0),
    capi_ok: capiOk,
    capi_xato: capiXato,
  };
}

export async function holat(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    if (!(await qongiroqSxemasiniTaminla())) {
      res.status(503).json({ error: "Baza sxemasi yangilanmadi (046). Migratsiyani yurgizing." });
      return;
    }

    const ws = await pool.query<{
      qongiroq_voronkalari: unknown;
      capi_event_call: string | null;
      amocrm_won_pairs: string[] | null;
      currency: string;
    }>(
      `SELECT qongiroq_voronkalari, capi_event_call, COALESCE(currency, 'UZS') AS currency,
              COALESCE(amocrm_won_pairs, '{}') AS amocrm_won_pairs
         FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    if (!ws.rows[0]) {
      res.status(404).json({ error: 'Workspace topilmadi' });
      return;
    }
    const xarita = xaritaniTozala(ws.rows[0].qongiroq_voronkalari);
    const wonPairs = ws.rows[0].amocrm_won_pairs ?? [];

    // Voronkalar — amoCRM'dan. Uzilsa sahifa yiqilmaydi, sababi ko'rinadi.
    let voronkalar: { id: string; nom: string }[] = [];
    let voronkaXato: string | null = null;
    try {
      const p = await getPipelines(workspaceId);
      voronkalar = p.map((v) => ({ id: String(v.id), nom: v.name }));
    } catch (err) {
      voronkaXato = (err as Error).message || "amoCRM voronkalarini o'qib bo'lmadi";
    }

    const kamp = await pool.query<{
      fb_campaign_id: string;
      name: string | null;
      status: string | null;
      spend: string;
    }>(
      `SELECT fb_campaign_id, name, status, spend
         FROM campaigns
        WHERE workspace_id = $1 AND fb_campaign_id IS NOT NULL
        ORDER BY spend DESC NULLS LAST, name
        LIMIT 300`,
      [workspaceId]
    );

    /* Har biriktirilgan voronka uchun: uning "sotildi" etapi won_pairs'da
       bormi. Yo'q bo'lsa qo'ng'iroq sotuvlari umuman sanalmaydi — yoki
       ular boshqa voronkada yopiladi. Ikkinchisi ham mumkin, shuning
       uchun bu xato emas, OGOHLANTIRISH. */
    const sotuvJuftligi: Record<string, boolean> = {};
    for (const voronka of Object.keys(xarita)) {
      sotuvJuftligi[voronka] = wonPairs.some((p) => p.startsWith(`${voronka}:`));
    }

    res.json({
      xarita,
      capiEventCall: ws.rows[0].capi_event_call ?? null,
      voronkalar,
      voronkaXato,
      kampaniyalar: kamp.rows.map((k) => ({
        id: k.fb_campaign_id,
        nom: k.name ?? k.fb_campaign_id,
        holat: k.status,
        xarajat: Number(k.spend ?? 0),
      })),
      sotuvJuftligi,
      statistika: await statistika(workspaceId),
      // Daromad CRM valyutasida (workspaces.currency) — formatMoney uchun.
      valyuta: ws.rows[0].currency,
    });
  } catch (err) {
    console.error("qongiroq-voronka holat xatosi:", (err as Error).message);
    res.status(500).json({ error: "Qo'ng'iroq sozlamasini o'qib bo'lmadi" });
  }
}

const raqamId = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,20}$/.test(v), 'ID faqat raqamdan iborat bo\'lishi kerak');

const saqlashSchema = z.object({
  /** { voronkaId: fbKampaniyaId }. Bo'sh obyekt — funksiyani o'chirish. */
  xarita: z.record(z.string(), raqamId).refine((x) => Object.keys(x).length <= 20, {
    message: "20 tadan ortiq voronka bo'lmasin",
  }),
  /** Meta hodisa nomi. null/bo'sh — oddiy Lead nomi. */
  capiEventCall: z
    .union([
      z
        .string()
        .trim()
        .max(50)
        .regex(/^$|^[A-Za-z][A-Za-z0-9_]*$/, "Hodisa nomi lotin harfi bilan boshlansin (harf, raqam, _)"),
      z.null(),
    ])
    .optional(),
});

export async function saqlash(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const parsed = saqlashSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const xarita: QongiroqXaritasi = {};
  for (const [k, v] of Object.entries(parsed.data.xarita)) {
    const voronka = String(k).trim();
    if (!/^\d{1,20}$/.test(voronka)) {
      res.status(400).json({ error: `Voronka ID noto'g'ri: ${voronka}` });
      return;
    }
    xarita[voronka] = v;
  }

  try {
    if (!(await qongiroqSxemasiniTaminla())) {
      res.status(503).json({ error: "Baza sxemasi yangilanmadi (046). Migratsiyani yurgizing." });
      return;
    }

    if (Object.keys(xarita).length > 0) {
      // §3.5: faqat amoCRM'da HAQIQATDA BOR voronka. amoCRM javob
      // bermasa — saqlamaymiz: tekshirilmagan ID yozilmaydi.
      let mavjud: Set<string>;
      try {
        mavjud = new Set((await getPipelines(workspaceId)).map((p) => String(p.id)));
      } catch (err) {
        res.status(502).json({
          error: `amoCRM voronkalarini tekshirib bo'lmadi, saqlanmadi: ${(err as Error).message}`,
        });
        return;
      }
      const yoqVoronka = Object.keys(xarita).filter((v) => !mavjud.has(v));
      if (yoqVoronka.length) {
        res.status(400).json({ error: `amoCRM'da bunday voronka yo'q: ${yoqVoronka.join(', ')}` });
        return;
      }

      // Kampaniya — sync qilingan jadvalda bo'lishi shart.
      const kamp = await pool.query<{ fb_campaign_id: string }>(
        `SELECT fb_campaign_id FROM campaigns
          WHERE workspace_id = $1 AND fb_campaign_id = ANY($2::text[])`,
        [workspaceId, [...new Set(Object.values(xarita))]]
      );
      const borKamp = new Set(kamp.rows.map((r) => r.fb_campaign_id));
      const yoqKamp = Object.values(xarita).filter((k) => !borKamp.has(k));
      if (yoqKamp.length) {
        res.status(400).json({
          error: `Bu kampaniya sync qilinmagan yoki boshqa akkauntniki: ${[...new Set(yoqKamp)].join(', ')}`,
        });
        return;
      }
    }

    const nom =
      parsed.data.capiEventCall === undefined
        ? undefined
        : parsed.data.capiEventCall
          ? parsed.data.capiEventCall
          : null;

    await pool.query(
      `UPDATE workspaces
          SET qongiroq_voronkalari = $2::jsonb,
              capi_event_call = CASE WHEN $3 THEN $4 ELSE capi_event_call END,
              updated_at = now()
        WHERE id = $1`,
      [workspaceId, JSON.stringify(xarita), nom !== undefined, nom ?? null]
    );

    res.json({ success: true, xarita, capiEventCall: nom ?? null });
  } catch (err) {
    console.error("qongiroq-voronka saqlash xatosi:", (err as Error).message);
    res.status(500).json({ error: 'Saqlanmadi' });
  }
}
