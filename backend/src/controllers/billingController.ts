import crypto from 'crypto';
import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { runInBackground } from '../utils/background';
import { xatoQayd } from '../utils/xatolar';
import { billingSxemasiniTaminla } from '../services/billing/sxema';
import { kartaNiqobi, pullikPlanmi } from '../services/billing/qoidalar';
import { paymeKartaTekshir, paymeSozlama } from '../services/billing/payme';
import { ClickXato, clickSozlama, clickTokenSora, clickTokenTasdiqla } from '../services/billing/click';
import {
  avtoYangilash,
  billingCron,
  billingHolati,
  kartaniOchir,
  kartaniFaollashtir,
  kartaniSaqla,
  kartaUrinishlariSoati,
  obunaBoshla,
  SMS_URINISH_CHEGARASI,
  SOATLIK_KARTA_CHEGARASI,
  tokenniProvayderdaOchir,
} from '../services/billing/obuna';
import { decrypt } from '../utils/encryption';
import { checkoutYarat, paymeMerchant } from '../services/billing/checkout';

/* ─────────────────────────────────────────────────────────────
   /api/billing — obuna, karta, avto-yechish.
   Pul bilan bog'liq hamma amal faqat WORKSPACE EGASIGA ruxsat:
   jamoa a'zosi boshqa birovning kartasidan yechishni yoqa olmasin.
   ───────────────────────────────────────────────────────────── */

async function egami(req: Request, res: Response): Promise<string | null> {
  const u = req.user;
  if (!u?.workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT owner_id = $2 AS ok FROM workspaces WHERE id = $1`,
    [u.workspaceId, u.userId]
  );
  if (!rows[0]?.ok) {
    res.status(403).json({ error: "Faqat workspace egasi to'lovni boshqara oladi" });
    return null;
  }
  return u.workspaceId;
}

function xato(res: Response, err: unknown, joy: string): void {
  xatoQayd(err, { joy });
  res.status(500).json({ error: "Ichki xato — birozdan so'ng qayta urinib ko'ring" });
}

export async function holat(req: Request, res: Response): Promise<void> {
  try {
    const ws = await egami(req, res);
    if (!ws) return;
    res.json(await billingHolati(ws));
  } catch (err) {
    xato(res, err, 'billing-holat');
  }
}

/** Payme: brauzer cards.create + verify qilgan tokenni qabul qiladi. */
export async function paymeKarta(req: Request, res: Response): Promise<void> {
  try {
    const ws = await egami(req, res);
    if (!ws) return;
    const s = paymeSozlama();
    if (!s) {
      res.status(503).json({ error: 'Payme hali ulanmagan' });
      return;
    }
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token || token.length > 2000) {
      res.status(400).json({ error: 'token kerak' });
      return;
    }
    // Brauzer "tasdiqlandi" desa ham — serverdan Payme'ning o'zidan so'raymiz.
    const karta = await paymeKartaTekshir(s, token).catch((e: Error) => {
      res.status(400).json({ error: `Payme: ${e.message}` });
      return null;
    });
    if (!karta) return;
    if (!karta.verify) {
      res.status(400).json({ error: 'Karta SMS kod bilan tasdiqlanmagan' });
      return;
    }
    if (karta.recurrent === false) {
      res.status(400).json({ error: "Bu karta avtomatik yechishni qo'llab-quvvatlamaydi — boshqa karta ulang" });
      return;
    }
    await kartaniSaqla({
      workspaceId: ws,
      provider: 'payme',
      token,
      masked: karta.number ?? '**** ****',
      tasdiqlangan: true,
    });
    res.json({ ok: true, masked: karta.number ?? null });
  } catch (err) {
    xato(res, err, 'billing-payme-karta');
  }
}

/** Click 1-qadam: karta raqami → token + SMS. Raqam saqlanmaydi va loglanmaydi. */
export async function clickKarta(req: Request, res: Response): Promise<void> {
  try {
    const ws = await egami(req, res);
    if (!ws) return;
    const s = clickSozlama();
    if (!s) {
      res.status(503).json({ error: 'Click hali ulanmagan' });
      return;
    }
    // SMS bombing / karta sinovidan himoya: soatiga 5 ta urinish.
    if ((await kartaUrinishlariSoati(ws)) >= SOATLIK_KARTA_CHEGARASI) {
      res.status(429).json({ error: "Juda ko'p urinish — 1 soatdan so'ng qayta urinib ko'ring" });
      return;
    }
    const raqam = String(req.body?.karta ?? '').replace(/\D/g, '');
    const muddat = String(req.body?.muddat ?? '').replace(/\D/g, '');
    if (raqam.length !== 16 || muddat.length !== 4) {
      res.status(400).json({ error: "Karta raqami 16 ta, muddat MMYY (4 ta raqam) bo'lishi kerak" });
      return;
    }
    try {
      const r = await clickTokenSora(s, raqam, muddat);
      await kartaniSaqla({
        workspaceId: ws,
        provider: 'click',
        token: r.token,
        masked: kartaNiqobi(raqam),
        telefon: r.telefon ?? null,
        tasdiqlangan: false,
      });
      res.json({ ok: true, telefon: r.telefon ?? null });
    } catch (e) {
      if (e instanceof ClickXato) {
        res.status(400).json({ error: `Click: ${e.message}`, kod: e.kod });
        return;
      }
      throw e;
    }
  } catch (err) {
    xato(res, err, 'billing-click-karta');
  }
}

/** Click 2-qadam: SMS kod. */
export async function clickTasdiq(req: Request, res: Response): Promise<void> {
  try {
    const ws = await egami(req, res);
    if (!ws) return;
    const s = clickSozlama();
    if (!s) {
      res.status(503).json({ error: 'Click hali ulanmagan' });
      return;
    }
    const kod = String(req.body?.kod ?? '').replace(/\D/g, '');
    if (kod.length < 4 || kod.length > 8) {
      res.status(400).json({ error: "SMS kod noto'g'ri" });
      return;
    }
    await billingSxemasiniTaminla();
    // Urinish hisoblagichi ATOMIK oshiriladi; 5 tadan keyin token yo'q qilinadi
    // (SMS kodni terib topishning oldini olish).
    const { rows } = await pool.query<{ id: string; token_enc: string; verify_attempts: number }>(
      `UPDATE billing_cards SET verify_attempts = verify_attempts + 1, updated_at = now()
        WHERE id = (SELECT id FROM billing_cards
                     WHERE workspace_id = $1 AND NOT active AND provider = 'click' AND NOT verified
                       AND token_enc <> ''
                     ORDER BY created_at DESC LIMIT 1)
        RETURNING id, token_enc, verify_attempts`,
      [ws]
    );
    const karta = rows[0];
    if (karta && karta.verify_attempts > SMS_URINISH_CHEGARASI) {
      await tokenniProvayderdaOchir({ provider: 'click', token_enc: karta.token_enc });
      await pool.query(`UPDATE billing_cards SET token_enc = '' WHERE id = $1`, [karta.id]);
      res.status(429).json({ error: "Kod ko'p marta noto'g'ri kiritildi — karta raqamini qaytadan kiriting" });
      return;
    }
    if (!karta) {
      res.status(400).json({ error: 'Tasdiqlanadigan karta yo\'q — avval karta raqamini kiriting' });
      return;
    }
    try {
      await clickTokenTasdiqla(s, decrypt(karta.token_enc), kod);
    } catch (e) {
      if (e instanceof ClickXato) {
        res.status(400).json({ error: `Click: ${e.message}`, kod: e.kod });
        return;
      }
      throw e;
    }
    await kartaniFaollashtir(ws, karta.id);
    res.json({ ok: true });
  } catch (err) {
    xato(res, err, 'billing-click-tasdiq');
  }
}

export async function obuna(req: Request, res: Response): Promise<void> {
  try {
    const ws = await egami(req, res);
    if (!ws) return;
    const plan = req.body?.plan;
    if (!pullikPlanmi(plan)) {
      res.status(400).json({ error: 'plan: pro | agency' });
      return;
    }
    // Avto-yechishga aniq rozilik — oferta talabi; belgilanmasa yechilmaydi.
    if (req.body?.rozilik !== true) {
      res.status(400).json({ error: 'Avtomatik yechishga rozilik belgilanmagan' });
      return;
    }
    const summa = Number(req.body?.summa);
    if (!Number.isInteger(summa) || summa <= 0) {
      res.status(400).json({ error: 'summa kerak (ekranda ko\'rsatilgan narx)' });
      return;
    }
    const r = await obunaBoshla(ws, plan, summa);
    if (r.ok) {
      res.json({ ok: true, paidUntil: r.paidUntil });
      return;
    }
    const status = r.jarayonda ? 202 : r.band || ('narxOzgardi' in r && r.narxOzgardi) ? 409 : 402;
    res.status(status).json({ error: r.xato, jarayonda: r.jarayonda ?? false });
  } catch (err) {
    xato(res, err, 'billing-obuna');
  }
}

export async function avto(req: Request, res: Response): Promise<void> {
  try {
    const ws = await egami(req, res);
    if (!ws) return;
    if (typeof req.body?.yoqilsin !== 'boolean') {
      res.status(400).json({ error: 'yoqilsin: true | false' });
      return;
    }
    const r = await avtoYangilash(ws, req.body.yoqilsin);
    if (!r.ok) {
      res.status(400).json({ error: r.xato });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    xato(res, err, 'billing-avto');
  }
}

export async function kartaOchir(req: Request, res: Response): Promise<void> {
  try {
    const ws = await egami(req, res);
    if (!ws) return;
    await kartaniOchir(ws);
    res.json({ ok: true });
  } catch (err) {
    xato(res, err, 'billing-karta-ochir');
  }
}

/** Cron: soatiga 1 marta. Himoya — CRON_SECRET (sync cron bilan bir xil). */
export async function cron(req: Request, res: Response): Promise<void> {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  if (!secret) {
    res.status(503).json({ error: "CRON_SECRET sozlanmagan — endpoint o'chirilgan" });
    return;
  }
  // Faqat sarlavhada: URL'dagi sir kirish loglariga tushadi.
  const berilgan = (req.header('x-cron-secret') ?? '').trim();
  const a = Buffer.from(berilgan.padEnd(secret.length).slice(0, secret.length));
  if (berilgan.length !== secret.length || !crypto.timingSafeEqual(a, Buffer.from(secret))) {
    res.status(401).json({ error: 'Invalid cron secret' });
    return;
  }
  if (req.query.wait === '1') {
    try {
      res.json({ ok: true, ...(await billingCron()) });
    } catch (err) {
      xato(res, err, 'billing-cron');
    }
    return;
  }
  void runInBackground(
    billingCron().then((n) => console.log('billing cron:', JSON.stringify(n))),
    'billing-cron'
  );
  res.status(202).json({ ok: true, accepted: true });
}

/* ───────────── Bir martalik to'lov (Payme checkout: havola / QR) ───────────── */

/** POST /api/billing/checkout {plan, summa} → {url}. Karta saqlanmaydi, avto-yechish yo'q. */
export async function checkout(req: Request, res: Response): Promise<void> {
  try {
    const ws = await egami(req, res);
    if (!ws) return;
    const plan = req.body?.plan;
    if (!pullikPlanmi(plan)) {
      res.status(400).json({ error: 'plan: pro | agency' });
      return;
    }
    const summa = Number(req.body?.summa);
    if (!Number.isInteger(summa) || summa <= 0) {
      res.status(400).json({ error: "summa kerak (ekranda ko'rsatilgan narx)" });
      return;
    }
    const r = await checkoutYarat(ws, plan, summa);
    if (!r.ok) {
      res.status(r.narxOzgardi ? 409 : 400).json({ error: r.xato });
      return;
    }
    res.json({ ok: true, url: r.url, buyurtmaId: r.buyurtmaId });
  } catch (err) {
    xato(res, err, 'billing-checkout');
  }
}

/**
 * POST /api/billing/payme/merchant — Payme serveridan JSON-RPC.
 * JWT EMAS: himoya — Basic auth (Paycom:<kassa kaliti>), checkout.ts tekshiradi.
 * Javob HAR DOIM 200: Payme xatoni JSON-RPC `error` dan o'qiydi.
 */
export async function paymeMerchantRpc(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(200).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32300, message: { uz: "Faqat POST", ru: 'Метод запроса не POST', en: 'Request method must be POST' } },
    });
    return;
  }
  res.status(200).json(await paymeMerchant(req.body, req.header('authorization')));
}
