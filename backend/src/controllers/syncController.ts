import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { pool, poolStats } from '../db/pool';
import { enqueueSync } from '../jobs/syncJob';
import { DateRange } from '../services/facebookAdsService';
import { fbUsage } from '../services/fbRateLimit';
import { ensureFreshFxRates } from '../services/fxRates';
import { importChunk } from '../services/amocrmImport';
import { bolakniYukla } from '../services/kunlikInsights';
import { runInBackground } from '../utils/background';
import { xatoQayd, xatolarniYubor } from '../utils/xatolar';

const triggerSchema = z
  .object({
    datePreset: z.string().optional(),
    since: z.string().optional(),
    until: z.string().optional(),
  })
  .optional();

// ---- POST /api/sync/trigger (protected) ----
export async function trigger(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const workspaceId = req.user.workspaceId;

  // Validate FB is connected before doing any queue/sync work.
  // Token lives on the user row; ad account ID is on the workspace.
  const ws = await pool.query<{ fb_access_token: string | null; fb_ad_account_id: string | null }>(
    `SELECT u.fb_access_token, w.fb_ad_account_id
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
      WHERE w.id = $1`,
    [workspaceId]
  );
  const row = ws.rows[0];
  if (!row || !row.fb_access_token) {
    res.status(400).json({ error: 'Facebook is not connected' });
    return;
  }
  if (!row.fb_ad_account_id) {
    res.status(400).json({ error: 'No ad account selected' });
    return;
  }

  const parsed = triggerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const body = parsed.data ?? {};
  let range: DateRange | undefined;
  if (body.since && body.until) {
    range = { since: body.since, until: body.until };
  } else if (body.datePreset) {
    range = { datePreset: body.datePreset };
  }

  try {
    const { queued } = await enqueueSync(workspaceId, range);
    res.status(202).json({
      success: true,
      queued,
      message: queued ? 'Sync queued' : 'Sync ran inline (Redis unavailable)',
    });
  } catch (err) {
    console.error('sync trigger error:', err);
    res.status(500).json({ error: 'Failed to start sync' });
  }
}

// ---- GET /api/sync/status (protected) ----
export async function status(req: Request, res: Response): Promise<void> {
  if (!req.user?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  /**
   * `?tarix=N` — oxirgi N ta yurish.
   *
   * ⚠ NEGA KERAK: ilgari bu endpoint faqat OXIRGI yurishni qaytarardi.
   * Oxirgi yurish "success" bo'lsa hammasi joyida ko'rinadi — lekin u
   * 18 soat oldin bo'lgan bo'lishi mumkin. Cron to'xtaganini bitta
   * qatordan bilib bo'lmaydi: oraliqni ko'rish kerak.
   *
   * Aynan shu sodir bo'ldi: "lastSync: success" turgan holda cron
   * 18 soat ishlamagan va kunlik jadval ortda qolgan.
   */
  const xom = Number(req.query.tarix);
  const tarixSoni = Number.isFinite(xom) ? Math.min(Math.max(Math.trunc(xom), 1), 50) : 1;

  try {
    const { rows } = await pool.query<{
      id: string;
      status: string;
      message: string | null;
      synced_at: string;
    }>(
      `SELECT id, status, message, synced_at
         FROM sync_logs
        WHERE workspace_id = $1
        ORDER BY synced_at DESC
        LIMIT $2`,
      [req.user.workspaceId, tarixSoni]
    );

    if (tarixSoni === 1) {
      res.json({ lastSync: rows[0] ?? null });
      return;
    }

    /* Yurishlar orasidagi tanaffus — daqiqada. Kutilgan qadam 30 daqiqa;
       undan ancha katta oraliq cron o'tkazib yuborganini bildiradi. */
    const oraliqlar: number[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const a = new Date(rows[i].synced_at).getTime();
      const b = new Date(rows[i + 1].synced_at).getTime();
      oraliqlar.push(Math.round((a - b) / 60000));
    }

    const oxirgi = rows[0] ? new Date(rows[0].synced_at).getTime() : null;
    const yoshDaqiqa = oxirgi ? Math.round((Date.now() - oxirgi) / 60000) : null;

    res.json({
      lastSync: rows[0] ?? null,
      /** Oxirgi yurishdan beri o'tgan vaqt — "success" ni yoshi bilan o'qish uchun. */
      yosh_daqiqa: yoshDaqiqa,
      /** Yurishlar orasidagi tanaffuslar, daqiqada. Eng yangisidan boshlab. */
      oraliqlar,
      eng_uzun_tanaffus: oraliqlar.length ? Math.max(...oraliqlar) : null,
      xato_soni: rows.filter((r) => r.status !== 'success').length,
      tarix: rows,
    });
  } catch (err) {
    console.error('sync status error:', err);
    res.status(500).json({ error: 'Failed to load sync status' });
  }
}

/**
 * ---- POST /api/sync/cron ----
 * Tashqi rejalashtiruvchi uchun (cron-job.org, GitHub Actions, Vercel Cron).
 *
 * NEGA KERAK: serverless muhitda node-cron ishlamaydi — funksiya so'rovlar
 * orasida yashamaydi. Vercel'ning o'z cron'i esa Hobby tarifida kuniga 1 marta.
 * Shuning uchun tetik tashqaridan keladi.
 *
 * Himoya: JWT emas (cron xizmatida foydalanuvchi yo'q), balki CRON_SECRET.
 * Header: X-Cron-Secret, yoki ?secret= query parametri.
 *
 * CRON_SECRET o'rnatilmagan bo'lsa endpoint 503 qaytaradi — ochiq qolmaydi.
 */
export async function cronSync(req: Request, res: Response): Promise<void> {
  /**
   * ⚠ TRIM MAJBURIY. Sir ikki joyda qo'lda joylashtiriladi (bizda —
   * Vercel, tetikda — GitHub). Terminaldan nusxalaganda oxiriga
   * ko'rinmas bo'sh joy yoki qator tashlash tushishi juda oson, va
   * u ikki tomonda bir xil bo'lmaydi.
   *
   * Natija: qiymatlar KO'ZGA BIR XIL ko'rinadi, lekin solishtiruv
   * yiqiladi. Sababini topish uchun bir soat ketadi — bu aynan bizda
   * sodir bo'ldi, to'rt marta 401 oldik.
   *
   * Xavfsizlikka zarari yo'q: bo'sh joy sirning kuchiga hissa
   * qo'shmaydi, chunki u tasodifiy emas.
   */
  const secret = (process.env.CRON_SECRET ?? '').trim();
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET sozlanmagan — endpoint o\'chirilgan' });
    return;
  }

  const provided = (
    req.header('x-cron-secret') ||
    (typeof req.query.secret === 'string' ? req.query.secret : '') ||
    ''
  ).trim();

  // Vaqt bo'yicha doimiy solishtirish — uzunlik farqi ham sirni ochmasin.
  const a = Buffer.from(provided.padEnd(secret.length).slice(0, secret.length));
  const b = Buffer.from(secret);
  if (provided.length !== secret.length || !crypto.timingSafeEqual(a, b)) {
    // Diagnostika: QIYMAT emas, faqat UZUNLIK. Uzunliklar teng bo'lsa —
    // qiymatlar haqiqatan boshqa; teng bo'lmasa — noto'g'ri nusxalangan.
    console.warn(
      `cron: sir mos kelmadi (kutilgan uzunlik ${secret.length}, kelgan ${provided.length})`
    );
    res.status(401).json({ error: 'Invalid cron secret' });
    return;
  }

  /**
   * IKKI REJIM — chaqiruvchining kuta oladigan vaqtiga qarab.
   *
   * `?wait=1` — ish tugaguncha kutiladi, javobda to'liq natija.
   *   Kim uchun: GitHub Actions (curl --max-time 280), qo'lda tekshirish.
   *
   * Sukut — 202 darhol qaytadi, ish fonda tugaydi.
   *   Kim uchun: cron-job.org. Uning BEPUL tarifida timeout MAKSIMUM
   *   30 soniya, bizning sinxron esa 156 soniya (o'lchangan). Ya'ni
   *   u har safar "timeout" deb belgilardi — ish aslida tugagan bo'lsa ham.
   *   Har 30 daqiqada yolg'on qizil status — bu ogohlantirishni o'rgatib
   *   yuboradi: odam ularni o'qimay qo'yadi va HAQIQIY nosozlikni
   *   o'tkazib yuboradi. Shuning uchun javob tez qaytadi.
   *
   * Natija qayerda ko'rinadi: `sync_logs` jadvali, `GET /api/sync/status`
   * va xato bo'lsa Sentry. Javobning o'zi natija emas — faqat "qabul qilindi".
   */
  const kutish = req.query.wait === '1';

  if (kutish) {
    const natija = await hammaniSinxronla();
    res.status(200).json({ success: true, ...natija });
    return;
  }

  const boshlandi = Date.now();
  runInBackground(
    hammaniSinxronla().then(async (n) => {
      console.log(
        `cron: fon sinxroni tugadi — ${n.workspaces} akkaunt, ${n.failed} xato, ${n.durationMs}ms`
      );
      if (n.failed > 0) await xatolarniYubor(1500);
      return n;
    }),
    'sync-cron'
  );

  res.status(202).json({
    accepted: true,
    mode: 'background',
    note: "Natija sync_logs va GET /api/sync/status da. To'liq javob uchun ?wait=1",
    queuedInMs: Date.now() - boshlandi,
  });
}

/**
 * Hamma faol akkauntni ketma-ket sinxronlaydi.
 *
 * ⚠ MASSHTAB CHEGARASI: ketma-ket ishlaydi. 1 akkaunt ≈ 156s (o'lchangan),
 * Vercel funksiyasining chegarasi 300s. Ya'ni IKKINCHI akkaunt qo'shilishi
 * bilan funksiya yarmida uziladi — jim, xatosiz, hech kim bilmaydi.
 * Qarorlar jurnalida ochiq muammo sifatida yozilgan; ikkinchi mijozdan
 * oldin navbat yoki vaqt byudjeti kerak.
 */
async function hammaniSinxronla(): Promise<{
  workspaces: number;
  failed: number;
  durationMs: number;
  pool: ReturnType<typeof poolStats>;
  fbUsage: ReturnType<typeof fbUsage>;
  results: Array<{ workspaceId: string; ok: boolean; error?: string }>;
}> {
  const startedAt = Date.now();
  const results: Array<{ workspaceId: string; ok: boolean; error?: string }> = [];

  // Serverless'da ichki cron yo'q, shuning uchun kurs ham shu tetikdan
  // yangilanadi. Kurs yangi bo'lsa tashqi so'rov yuborilmaydi.
  try {
    await ensureFreshFxRates();
  } catch (err) {
    // Kurs yangilanmasa sinxron baribir davom etadi — ROAS bloklanadi,
    // lekin xarajat va lid raqamlari to'g'ri qoladi.
    xatoQayd(err, { joy: 'sync-cron', qoshimcha: { bosqich: 'fx' } });
  }

  const { rows } = await pool.query<{ id: string }>(
    `SELECT w.id
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
      WHERE u.fb_access_token IS NOT NULL
        AND w.fb_ad_account_id IS NOT NULL`
  );

  for (const ws of rows) {
    // Bitta workspace'dagi xato qolganlarini to'xtatmaydi.
    try {
      await enqueueSync(ws.id);
      results.push({ workspaceId: ws.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      xatoQayd(err, { joy: 'sync-cron', workspaceId: ws.id });
      results.push({ workspaceId: ws.id, ok: false, error: message });
    }
  }

  return {
    workspaces: results.length,
    failed: results.filter((r) => !r.ok).length,
    durationMs: Date.now() - startedAt,
    pool: poolStats(),
    // Facebook aniq chaqiruvlar sonini bermaydi — limitning necha foizi
    // ishlatilganini beradi. Bloklangan bo'lsa regainMinutes to'ladi.
    fbUsage: fbUsage(),
    results,
  };
}


/**
 * ---- POST /api/sync/amocrm-import ----
 * amoCRM tarixini import qiladi — BITTA sahifa (250 lid) har chaqiruvda.
 *
 * NEGA SERVERDA, skript emas: shifrlash kaliti faqat serverda bor
 * (Vercel'da "sensitive" env, o'qib bo'lmaydi), va mijoz terminalda
 * skript ishga tushirmaydi.
 *
 * NEGA BITTA SAHIFA: serverless funksiya 10–60 soniyada uziladi.
 * Javobdagi `nextPage` bilan chaqiruvchi oxirigacha aylantiradi.
 *
 * amoCRM ga faqat GET ketadi (§4.3).
 */
export async function amocrmImport(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const schema = z.object({
    days: z.number().int().min(0).max(3650).optional(),
    page: z.number().int().min(1).max(400).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  try {
    const b = await importChunk(workspaceId, {
      kunlar: parsed.data.days,
      sahifa: parsed.data.page,
    });
    res.json({
      success: true,
      page: b.sahifa,
      nextPage: b.keyingiSahifa,
      leads: b.lidlar,
      updated: b.yangilangan,
      qualified: b.sifatli,
      won: b.yutilgan,
      contacts: b.kontaktlar,
      amoRequests: b.sorovlar,
      errors: b.xatolar,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    // 400 — bizning ataylab yozgan matnimiz (sozlama yetishmaydi).
    if (e.status === 400) {
      res.status(400).json({ error: e.message });
      return;
    }
    xatoQayd(err, {
      joy: 'amocrm-import',
      workspaceId: req.user?.workspaceId,
      qoshimcha: { sahifa: req.body?.page, kunlar: req.body?.days },
    });
    res.status(500).json({ error: 'Import bajarilmadi' });
  }
}


/**
 * ---- POST /api/sync/kunlik-backfill ----
 * Kunlik tarixni BO'LAKLAB to'ldiradi (30 kun har chaqiruvda).
 *
 * NEGA BO'LAKLAB: `time_increment=1` bilan Facebook har reklama uchun
 * har kunga alohida qator qaytaradi. 1 600 reklama x 90 kun = 144 000
 * qator — bitta so'rovga sig'maydi va funksiya 300 soniyada uziladi.
 *
 * Chaqiruvchi javobdagi `keyingi_until` ni olib qayta chaqiradi va
 * shu tarzda orqaga qarab oxirigacha aylantiradi. Har bo'lak
 * idempotent (UPSERT), ya'ni qayta yuklash xavfsiz.
 *
 * Body: { until?: "YYYY-MM-DD", days?: 1..90 }
 *   until berilmasa — bugundan boshlanadi.
 */
export async function kunlikBackfill(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const schema = z.object({
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'until YYYY-MM-DD shaklida bo\'lishi kerak')
      .optional(),
    days: z.number().int().min(1).max(90).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const until = parsed.data.until ?? new Date().toISOString().slice(0, 10);

  try {
    const natija = await bolakniYukla(workspaceId, until, parsed.data.days);
    res.json({ success: true, ...natija });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status === 400) {
      res.status(400).json({ error: e.message });
      return;
    }
    xatoQayd(err, { joy: 'kunlik-backfill', workspaceId, qoshimcha: { until } });
    res.status(500).json({ error: 'Kunlik backfill bajarilmadi' });
  }
}
