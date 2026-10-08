import crypto from 'crypto';
import { pool } from '../../db/pool';
import { xatoQayd } from '../../utils/xatolar';
import { emailYubor } from '../email';
import { billingSxemasiniTaminla } from './sxema';
import { PLAN_NOMI, billingUrl, narxlar, pullikPlanmi, tiyin, type PullikPlan } from './qoidalar';
import { fiskalDetail, paymeSozlama } from './payme';
import { tolovOtdiXati } from './xatlar';

/* ─────────────────────────────────────────────────────────────
   BIR MARTALIK TO'LOV — Payme checkout (havola / QR) + Merchant API.
   Hujjat: https://developer.help.paycom.uz/metody-merchant-api/

   Oqim:
     1. Mijoz "1 oyga to'lash" bosadi → billing_checkout buyurtmasi
        (summa shu yerda QOTADI) → checkout.paycom.uz havolasi.
     2. Mijoz Payme sahifasida karta yoki QR bilan to'laydi.
     3. Payme bizning /api/billing/payme/merchant ga JSON-RPC yuboradi:
          CheckPerformTransaction → CreateTransaction → PerformTransaction
        PerformTransaction'da BITTA SQL bilan: tranzaksiya "to'landi",
        buyurtma "paid", billing_payments ga 'onetime' yozuv, muddat +1 oy.

   Avto-obunadan farqi: karta tokeni olinmaydi, keyingi oy o'zi
   yechilmaydi. auto_renew'ga TEGILMAYDI — faqat tarif boshqa bo'lsa
   o'chiriladi (mijoz yangi tarif summasiga avto-yechish roziligini bermagan).

   Ikki marta to'lamaslik:
     • bitta buyurtmada bitta tirik tranzaksiya (payme_tx_buyurtmada_bitta);
     • CreateTransaction shu workspace uchun 'pending' billing_payments
       yozuvini ochadi — u karta yechimi bilan BIR XIL unique indeksni
       (billing_payments_bitta_jarayon) band qiladi. Karta yechimi va
       checkout bir vaqtda ketolmaydi; tekshiruv bilan yozuv orasida poyga yo'q.
     • 12 soatda to'lanmasa — bekor (Payme Cancel, Perform'dagi tekshiruv
       yoki cron: eskiCheckoutlarniBekor), navbat bo'shaydi.

   Javob HAR DOIM HTTP 200 + JSON-RPC (Payme shuni kutadi), xato ham.
   ───────────────────────────────────────────────────────────── */

/** Tranzaksiya Payme'da yaratilgandan 12 soat o'tsa — to'lovsiz bekor (sabab 4). */
export const TRANZAKSIYA_TIMEOUT_MS = 43_200_000;
/** Shundan eski buyurtma uchun yangi to'lov qabul qilinmaydi (narx eskirgan bo'lishi mumkin). */
export const BUYURTMA_AMAL_KUN = 7;

/* ───────────── Toza funksiyalar (testlanadi) ───────────── */

/** Payme GET-checkout havolasi: base64("m=...;ac.order_id=...;a=...;c=...;l=uz"). */
export function paymeCheckoutUrl(p: {
  merchantId: string;
  hisobMaydoni: string;
  buyurtmaId: string;
  somSumma: number;
  qaytishUrl: string;
  test: boolean;
  til?: 'uz' | 'ru' | 'en';
}): string {
  // ⚠ Parametrlar ";" bilan ajratiladi — qaytish URL'ida ";" bo'lmasligi kerak.
  const qism = [
    `m=${p.merchantId}`,
    `ac.${p.hisobMaydoni}=${p.buyurtmaId}`,
    `a=${tiyin(p.somSumma)}`,
    `c=${p.qaytishUrl.replace(/;/g, '')}`,
    `l=${p.til ?? 'uz'}`,
  ].join(';');
  const baza = p.test ? 'https://checkout.test.paycom.uz' : 'https://checkout.paycom.uz';
  return `${baza}/${Buffer.from(qism, 'utf8').toString('base64')}`;
}

/**
 * Payme Merchant API kalitlari. Sinov kaliti FAQAT PAYME_TEST=true da qabul
 * qilinadi: aks holda sandbox'dan (pulsiz) chaqiruv real buyurtmaga tarif berardi.
 */
export function merchantKalitlari(env: NodeJS.ProcessEnv = process.env): string[] {
  const k = [env.PAYME_KEY];
  if (env.PAYME_TEST === 'true') k.push(env.PAYME_TEST_KEY);
  return k.map((v) => (v ?? '').trim()).filter(Boolean);
}

/** Authorization: Basic base64("Paycom:<kalit>"). Doimiy vaqtli solishtirish. */
export function paymeAuthTogrimi(header: string | undefined, kalitlar: string[]): boolean {
  if (!header || !kalitlar.length) return false;
  const m = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  let ochiq: string;
  try {
    ochiq = Buffer.from(m[1]!, 'base64').toString('utf8');
  } catch {
    return false;
  }
  const i = ochiq.indexOf(':');
  if (i < 0 || ochiq.slice(0, i) !== 'Paycom') return false;
  const berilgan = Buffer.from(ochiq.slice(i + 1));
  let mos = false;
  for (const k of kalitlar) {
    const kb = Buffer.from(k);
    // Uzunlik farqi ham kalitni oshkor qilmasin: har kalit bilan baribir solishtiriladi.
    const teng = kb.length === berilgan.length && crypto.timingSafeEqual(kb, berilgan);
    mos = mos || teng;
  }
  return mos;
}

type Matn = { uz: string; ru: string; en: string };

export class RpcXato extends Error {
  constructor(
    public kod: number,
    public matn: Matn,
    public data?: string
  ) {
    super(matn.uz);
  }
}

const X = {
  auth: () => new RpcXato(-32504, { uz: "Ruxsat yo'q", ru: 'Недостаточно привилегий', en: 'Insufficient privileges' }),
  sorov: (d?: string) =>
    new RpcXato(-32600, { uz: "So'rov noto'g'ri", ru: 'Неверный запрос', en: 'Invalid request' }, d),
  metod: (nom: string) =>
    new RpcXato(-32601, { uz: 'Metod topilmadi', ru: 'Метод не найден', en: 'Method not found' }, nom),
  summa: () => new RpcXato(-31001, { uz: "Summa noto'g'ri", ru: 'Неверная сумма', en: 'Incorrect amount' }),
  topilmadi: () =>
    new RpcXato(-31003, { uz: 'Tranzaksiya topilmadi', ru: 'Транзакция не найдена', en: 'Transaction not found' }),
  bekorEmas: () =>
    new RpcXato(-31007, {
      uz: "Xizmat ko'rsatilgan — bekor qilib bo'lmaydi",
      ru: 'Услуга оказана, отмена невозможна',
      en: 'Service delivered, cannot cancel',
    }),
  mumkinEmas: () =>
    new RpcXato(-31008, { uz: "Amalni bajarib bo'lmaydi", ru: 'Невозможно выполнить операцию', en: 'Operation not allowed' }),
  buyurtmaYoq: (f: string) =>
    new RpcXato(-31050, { uz: 'Buyurtma topilmadi', ru: 'Заказ не найден', en: 'Order not found' }, f),
  buyurtmaYopiq: (f: string) =>
    new RpcXato(
      -31051,
      { uz: "Buyurtma to'langan yoki eskirgan", ru: 'Заказ оплачен или устарел', en: 'Order already paid or expired' },
      f
    ),
  buyurtmaBand: (f: string) =>
    new RpcXato(
      -31052,
      { uz: "Buyurtma bo'yicha to'lov jarayonda", ru: 'Заказ ожидает оплаты', en: 'Order is awaiting payment' },
      f
    ),
  boshqaTolov: (f: string) =>
    new RpcXato(
      -31053,
      { uz: "Boshqa to'lov jarayonda", ru: 'Другой платёж в обработке', en: 'Another payment is in progress' },
      f
    ),
};

/** Payme "time"/"amount" — butun musbat son. */
function butunSon(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hisobMaydoni(env: NodeJS.ProcessEnv = process.env): string {
  return (env.PAYME_ACCOUNT_FIELD ?? 'order_id').trim() || 'order_id';
}

/* ───────────── Buyurtma yaratish (mijoz tomoni, JWT) ───────────── */

export type CheckoutNatija = { ok: true; url: string; buyurtmaId: string } | { ok: false; xato: string; narxOzgardi?: boolean };

export async function checkoutYarat(
  workspaceId: string,
  plan: PullikPlan,
  kutilganSumma: number
): Promise<CheckoutNatija> {
  await billingSxemasiniTaminla();
  const s = paymeSozlama();
  if (!s) return { ok: false, xato: "Payme hozircha ulanmagan" };
  const narx = narxlar()[plan];
  if (!narx) return { ok: false, xato: `${PLAN_NOMI[plan]} tarifi hozir sotuvda emas` };
  if (narx !== kutilganSumma) {
    return { ok: false, narxOzgardi: true, xato: 'Narx yangilandi — sahifani yangilab, summani qayta tasdiqlang' };
  }

  const { rows: wsRows } = await pool.query<{ billing_plan: string | null; paid_until: Date | null; billing_amount_uzs: string | null }>(
    `SELECT billing_plan, paid_until, billing_amount_uzs FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const ws = wsRows[0];
  if (!ws) return { ok: false, xato: 'Workspace topilmadi' };
  // Pastroq tarifga to'langan muddat o'rtasida o'tilmaydi (obunaBoshla bilan bir xil qoida).
  if (ws.paid_until && new Date(ws.paid_until) > new Date() && pullikPlanmi(ws.billing_plan) && ws.billing_plan !== plan) {
    const joriy = Number(ws.billing_amount_uzs ?? 0) || narxlar()[ws.billing_plan] || 0;
    if (narx < joriy) {
      return { ok: false, xato: `Pastroq tarifga to'langan muddat tugagach o'tiladi` };
    }
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO billing_checkout (workspace_id, provider, plan, amount_uzs) VALUES ($1, 'payme', $2, $3) RETURNING id`,
    [workspaceId, plan, narx]
  );
  const buyurtmaId = rows[0]!.id;
  return {
    ok: true,
    buyurtmaId,
    url: paymeCheckoutUrl({
      merchantId: s.id,
      hisobMaydoni: hisobMaydoni(),
      buyurtmaId,
      somSumma: narx,
      qaytishUrl: billingUrl(),
      test: s.test,
    }),
  };
}

/* ───────────── Merchant API (Payme → bizning server) ───────────── */

interface Buyurtma {
  id: string;
  workspace_id: string;
  plan: string;
  amount_uzs: string;
  status: 'new' | 'paid' | 'expired';
  eskirgan: boolean;
}

interface Tx {
  payme_id: string;
  checkout_id: string;
  amount_tiyin: string;
  payme_time: string;
  create_time: string;
  perform_time: string;
  cancel_time: string;
  state: number;
  reason: number | null;
}

async function buyurtmaOl(account: unknown): Promise<Buyurtma> {
  const f = hisobMaydoni();
  const v = account && typeof account === 'object' ? (account as Record<string, unknown>)[f] : undefined;
  if (typeof v !== 'string' || !UUID.test(v)) throw X.buyurtmaYoq(f);
  const { rows } = await pool.query<Buyurtma>(
    `SELECT id, workspace_id, plan, amount_uzs, status,
            created_at < now() - make_interval(days => $2) AS eskirgan
       FROM billing_checkout WHERE id = $1`,
    [v, BUYURTMA_AMAL_KUN]
  );
  if (!rows[0]) throw X.buyurtmaYoq(f);
  return rows[0];
}

/** CheckPerformTransaction / CreateTransaction uchun umumiy tekshiruv. */
async function buyurtmaniTekshir(p: Record<string, unknown>): Promise<Buyurtma> {
  if (!butunSon(p.amount) || p.amount <= 0) throw X.sorov('amount');
  const b = await buyurtmaOl(p.account);
  const f = hisobMaydoni();
  if (b.status !== 'new' || b.eskirgan) throw X.buyurtmaYopiq(f);
  if (p.amount !== tiyin(Number(b.amount_uzs))) throw X.summa();
  return b;
}

const son = (v: string | number | null) => (v === null ? 0 : Number(v));

async function txOl(id: unknown): Promise<Tx> {
  if (typeof id !== 'string' || !id || id.length > 64) throw X.sorov('id');
  const { rows } = await pool.query<Tx>(`SELECT * FROM payme_transactions WHERE payme_id = $1`, [id]);
  if (!rows[0]) throw X.topilmadi();
  return rows[0];
}

/**
 * Kutilayotgan tranzaksiyani bekor qilish (state 1 → -1) va uning 'pending'
 * billing_payments yozuvini 'failed' qilish — BITTA SQL. Navbat bo'shaydi:
 * karta yechimi yoki yangi checkout yana mumkin bo'ladi.
 */
async function kutilayotganniBekor(paymeId: string, sabab: number, hozir: number): Promise<boolean> {
  const r = await pool.query(
    `WITH tx AS (
       UPDATE payme_transactions SET state = -1, reason = $2, cancel_time = $3
        WHERE payme_id = $1 AND state = 1
        RETURNING payment_id
     )
     UPDATE billing_payments bp SET status = 'failed', error = 'Payme: bekor (sabab ' || $2 || ')'
       FROM tx WHERE bp.id = tx.payment_id AND bp.status = 'pending'
     RETURNING bp.id`,
    [paymeId, sabab, hozir]
  );
  return Boolean(r.rowCount);
}

/** Muddati o'tgan kutilayotgan tranzaksiyani bekor qiladi (sabab 4 — timeout). */
async function timeoutBolsaBekor(t: Tx, hozir: number): Promise<boolean> {
  if (t.state !== 1 || hozir - son(t.create_time) <= TRANZAKSIYA_TIMEOUT_MS) return false;
  await kutilayotganniBekor(t.payme_id, 4, hozir);
  return true;
}

/**
 * Cron uchun: Payme 12 soatdan keyin ham Cancel yubormagan tranzaksiyalar.
 * Aks holda 'pending' yozuv workspace'ning to'lov navbatini abadiy band qilardi.
 */
export async function eskiCheckoutlarniBekor(hozir = Date.now()): Promise<number> {
  await billingSxemasiniTaminla();
  const { rows } = await pool.query<{ payme_id: string }>(
    `SELECT payme_id FROM payme_transactions WHERE state = 1 AND create_time < $1 LIMIT 100`,
    [hozir - TRANZAKSIYA_TIMEOUT_MS]
  );
  let n = 0;
  for (const r of rows) if (await kutilayotganniBekor(r.payme_id, 4, hozir)) n++;
  return n;
}

async function checkPerform(p: Record<string, unknown>) {
  const b = await buyurtmaniTekshir(p);
  const plan = pullikPlanmi(b.plan) ? PLAN_NOMI[b.plan] : b.plan;
  const detail = fiskalDetail(Number(b.amount_uzs), `McQueen AI ${plan} — 1 oy`, process.env);
  return detail ? { allow: true, detail } : { allow: true };
}

async function mavjudCreate(t: Tx, hozir: number) {
  if (t.state !== 1) throw X.mumkinEmas();
  if (await timeoutBolsaBekor(t, hozir)) throw X.mumkinEmas();
  return { create_time: son(t.create_time), transaction: t.payme_id, state: 1 };
}

/**
 * Tranzaksiya + 'pending' billing_payments yozuvi — BITTA SQL.
 * pending yozuv billing_payments_bitta_jarayon indeksini band qiladi: shu
 * workspace'da karta yechimi (cron yoki "Obuna bo'lish") ketayotgan bo'lsa
 * INSERT rad etiladi (-31053), teskarisi ham — karta yechimi bu davrda
 * ON CONFLICT bilan "band" qaytaradi. Tekshiruv va yozuv orasida poyga yo'q.
 */
/**
 * Shu workspace'ning BOSHQA buyurtmasida kutilayotgan tranzaksiya (mijoz
 * avvalgi Payme sahifasini tashlab ketgan). Uni bekor qilamiz — aks holda u
 * 12 soat davomida har qanday to'lovni (checkout ham, karta ham) bloklardi.
 * Payme keyin eski tranzaksiyaga Perform yuborsa — -31008, pul qaytariladi.
 */
async function tashlanganniBekor(workspaceId: string, buyurtmaId: string, hozir: number): Promise<boolean> {
  const { rows } = await pool.query<{ payme_id: string }>(
    `SELECT pt.payme_id FROM payme_transactions pt JOIN billing_checkout bc ON bc.id = pt.checkout_id
      WHERE bc.workspace_id = $1 AND bc.id <> $2 AND pt.state = 1`,
    [workspaceId, buyurtmaId]
  );
  let n = 0;
  for (const r of rows) if (await kutilayotganniBekor(r.payme_id, 3, hozir)) n++;
  return n > 0;
}

async function create(p: Record<string, unknown>, hozir: number) {
  if (typeof p.id !== 'string' || !p.id || p.id.length > 64) throw X.sorov('id');
  if (!butunSon(p.time)) throw X.sorov('time');

  const bor = await pool.query<Tx>(`SELECT * FROM payme_transactions WHERE payme_id = $1`, [p.id]);
  if (bor.rows[0]) return mavjudCreate(bor.rows[0], hozir);

  const b = await buyurtmaniTekshir(p);
  const f = hisobMaydoni();
  // Aniqroq xato kodi uchun oldindan tekshiruv; poygani baribir indekslar ushlaydi.
  const tirik = await pool.query(`SELECT 1 FROM payme_transactions WHERE checkout_id = $1 AND state IN (1, 2)`, [b.id]);
  if (tirik.rowCount) throw X.buyurtmaBand(f);
  const yoz = () =>
    pool.query(
      `WITH d AS (
         -- Shu tarif hali faol bo'lsa — davr uning oxiridan davom etadi (kunlar
         -- yo'qolmaydi). Boshqa tarif yoki muddat o'tgan — hozirdan.
         SELECT bc.workspace_id, bc.plan, bc.amount_uzs,
                CASE WHEN w.paid_until > now() AND w.billing_plan = bc.plan
                     THEN w.paid_until ELSE now() END AS boshi
           FROM billing_checkout bc JOIN workspaces w ON w.id = bc.workspace_id
          WHERE bc.id = $2
       ), bp AS (
         INSERT INTO billing_payments
           (workspace_id, provider, kind, plan, amount_uzs, status, provider_ref, period_start, period_end)
         SELECT workspace_id, 'payme', 'onetime', plan, amount_uzs, 'pending', $1, boshi, boshi + interval '1 month'
           FROM d
         RETURNING id
       )
       INSERT INTO payme_transactions (payme_id, checkout_id, amount_tiyin, payme_time, create_time, state, payment_id)
       SELECT $1, $2, $3, $4, $5, 1, bp.id FROM bp`,
      [p.id, b.id, p.amount, p.time, hozir]
    );
  try {
    try {
      await yoz();
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      // Navbatni shu workspace'ning tashlab ketilgan checkout'i band qilgan
      // bo'lsa — uni bekor qilib, BIR MARTA qayta urinamiz. Karta yechimi
      // band qilgan bo'lsa tegmaymiz (u haqiqiy pul harakati).
      const navbat = e.constraint === 'billing_payments_bitta_jarayon' || e.constraint === 'billing_payments_davr_bir_marta';
      if (e.code === '23505' && navbat && (await tashlanganniBekor(b.workspace_id, b.id, hozir))) {
        await yoz();
      } else {
        throw err;
      }
    }
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e.code !== '23505') throw err;
    if (e.constraint === 'payme_transactions_pkey') {
      // Bir xil id bilan parallel ikkinchi so'rov — birinchisining natijasi.
      const t = await pool.query<Tx>(`SELECT * FROM payme_transactions WHERE payme_id = $1`, [p.id]);
      if (t.rows[0]) return mavjudCreate(t.rows[0], hozir);
    }
    if (e.constraint === 'payme_tx_buyurtmada_bitta') throw X.buyurtmaBand(f);
    // billing_payments_bitta_jarayon / davr_bir_marta — boshqa to'lov ketmoqda.
    throw X.boshqaTolov(f);
  }
  return { create_time: hozir, transaction: p.id, state: 1 };
}

/**
 * To'lovni o'tkazish — BITTA SQL. Tartib muhim: avval BUYURTMA 'new' → 'paid',
 * faqat shu o'tsa tranzaksiya → 2, pending yozuv → paid, muddat +1 oy.
 * (CTE'dagi har bir yozuv bajariladi — buyurtma yopiq bo'lsa tranzaksiya
 * "to'landi" bo'lib, tarif berilmay qolmasligi uchun zanjir shu tartibda.)
 * Orada funksiya o'ldirilsa — hech narsa yozilmagan, Payme qayta so'raydi.
 */
async function perform(p: Record<string, unknown>, hozir: number) {
  const t = await txOl(p.id);
  if (t.state === 2) return { transaction: t.payme_id, perform_time: son(t.perform_time), state: 2 };
  if (t.state !== 1) throw X.mumkinEmas();
  if (await timeoutBolsaBekor(t, hozir)) throw X.mumkinEmas();

  const { rows } = await pool.query<{
    tolov_id: string;
    workspace_id: string;
    plan: string;
    amount_uzs: string;
    period_end: Date;
  }>(
    `WITH c AS (
       UPDATE billing_checkout bc SET status = 'paid', paid_at = now()
        WHERE bc.id = (SELECT pt.checkout_id FROM payme_transactions pt
                         JOIN billing_payments b ON b.id = pt.payment_id
                        WHERE pt.payme_id = $1 AND pt.state = 1 AND b.status IN ('pending', 'unknown'))
          AND bc.status = 'new'
        RETURNING bc.id
     ), tx AS (
       UPDATE payme_transactions pt SET state = 2, perform_time = $2
         FROM c WHERE pt.payme_id = $1 AND pt.state = 1 AND pt.checkout_id = c.id
        RETURNING pt.payment_id
     ), bp AS (
       UPDATE billing_payments b SET status = 'paid', paid_at = now(), error = NULL
         FROM tx WHERE b.id = tx.payment_id AND b.status IN ('pending', 'unknown')
        RETURNING b.id, b.workspace_id, b.plan, b.amount_uzs, b.period_end
     ), w AS (
       UPDATE workspaces ws
          SET plan = bp.plan, billing_plan = bp.plan, billing_status = 'active',
              paid_until = CASE WHEN ws.billing_plan = bp.plan
                                THEN GREATEST(COALESCE(ws.paid_until, bp.period_end), bp.period_end)
                                ELSE bp.period_end END,
              -- Boshqa tarifga o'tdi: eski summaga berilgan avto-yechish roziligi
              -- yangi tarifga tatbiq etilmaydi.
              auto_renew = CASE WHEN ws.billing_plan IS DISTINCT FROM bp.plan THEN false ELSE ws.auto_renew END,
              billing_fail_count = 0, billing_next_attempt_at = NULL, updated_at = now()
         FROM bp WHERE ws.id = bp.workspace_id
        RETURNING ws.id
     )
     SELECT bp.id AS tolov_id, bp.workspace_id, bp.plan, bp.amount_uzs, bp.period_end FROM bp`,
    [t.payme_id, hozir]
  );

  const r = rows[0];
  if (!r) {
    // Parallel so'rov allaqachon o'tkazgan — o'sha natija. Aks holda buyurtma
    // yopiq: tranzaksiyaga TEGILMAGAN (state 1), Payme bekor qiladi.
    const yangi = await txOl(p.id);
    if (yangi.state === 2) return { transaction: yangi.payme_id, perform_time: son(yangi.perform_time), state: 2 };
    throw X.mumkinEmas();
  }

  await kvitansiya(r.workspace_id, r.tolov_id, r.plan, Number(r.amount_uzs), new Date(r.period_end));
  return { transaction: t.payme_id, perform_time: hozir, state: 2 };
}

/** To'lov xati — fail-soft va 3 soniyadan oshmaydi (Payme javobni kutib turibdi). */
async function kvitansiya(workspaceId: string, tolovId: string, plan: string, summa: number, gacha: Date) {
  if (!pullikPlanmi(plan)) return;
  try {
    const { rows } = await pool.query<{ email: string }>(
      `SELECT u.email FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = $1`,
      [workspaceId]
    );
    if (!rows[0]?.email) return;
    await Promise.race([
      emailYubor(
        tolovOtdiXati({ kimga: rows[0].email, plan, summa, sana: gacha, karta: 'Payme', billingUrl: billingUrl() }),
        `tolov-${tolovId}`
      ),
      new Promise((ok) => setTimeout(ok, 3000)),
    ]);
  } catch (err) {
    console.warn('billing: checkout kvitansiyasi yuborilmadi:', (err as Error).message);
  }
}

async function cancel(p: Record<string, unknown>, hozir: number) {
  const t = await txOl(p.id);
  if (!butunSon(p.reason)) throw X.sorov('reason');
  if (t.state === 1) await kutilayotganniBekor(t.payme_id, p.reason, hozir);
  // Qayta o'qiladi: Cancel va Perform bir vaqtda kelgan bo'lsa haqiqiy holat.
  const yangi = t.state === 1 ? await txOl(p.id) : t;
  // To'langan obuna muddati darhol berilgan — avtomatik qaytarilmaydi.
  // Qaytarish kerak bo'lsa: odam ko'rib, Payme kabinetidan + billing:hal.
  if (yangi.state === 2) throw X.bekorEmas();
  return { transaction: yangi.payme_id, cancel_time: son(yangi.cancel_time), state: yangi.state };
}

async function checkTx(p: Record<string, unknown>) {
  const t = await txOl(p.id);
  return {
    create_time: son(t.create_time),
    perform_time: son(t.perform_time),
    cancel_time: son(t.cancel_time),
    transaction: t.payme_id,
    state: t.state,
    reason: t.reason,
  };
}

async function statement(p: Record<string, unknown>) {
  if (!butunSon(p.from) || !butunSon(p.to)) throw X.sorov('from/to');
  const f = hisobMaydoni();
  const { rows } = await pool.query<Tx>(
    `SELECT * FROM payme_transactions WHERE payme_time BETWEEN $1 AND $2 ORDER BY payme_time`,
    [p.from, p.to]
  );
  return {
    transactions: rows.map((t) => ({
      id: t.payme_id,
      time: son(t.payme_time),
      amount: son(t.amount_tiyin),
      account: { [f]: t.checkout_id },
      create_time: son(t.create_time),
      perform_time: son(t.perform_time),
      cancel_time: son(t.cancel_time),
      transaction: t.payme_id,
      state: t.state,
      reason: t.reason,
    })),
  };
}

async function fiscal(p: Record<string, unknown>) {
  if (typeof p.id !== 'string') throw X.sorov('id');
  // PERFORM va CANCEL cheklari alohida saqlanadi — biri ikkinchisini o'chirmasin.
  const tur = typeof p.type === 'string' && p.type ? p.type.slice(0, 20) : 'PERFORM';
  const r = await pool.query(
    `UPDATE payme_transactions SET fiscal = COALESCE(fiscal, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)
      WHERE payme_id = $1`,
    [p.id, tur, JSON.stringify(p)]
  );
  if (!r.rowCount) throw X.topilmadi();
  return { success: true };
}

export interface RpcJavob {
  jsonrpc: '2.0';
  id: unknown;
  result?: unknown;
  error?: { code: number; message: Matn; data?: string };
}

/** Payme Merchant API — bitta kirish nuqtasi. Hech qachon throw qilmaydi. */
export async function paymeMerchant(
  body: unknown,
  authHeader: string | undefined,
  hozir = Date.now()
): Promise<RpcJavob> {
  const so = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const id = so.id ?? null;
  try {
    if (!paymeAuthTogrimi(authHeader, merchantKalitlari())) throw X.auth();
    if (typeof so.method !== 'string' || !so.params || typeof so.params !== 'object') throw X.sorov();
    await billingSxemasiniTaminla();
    const p = so.params as Record<string, unknown>;
    let result: unknown;
    switch (so.method) {
      case 'CheckPerformTransaction':
        result = await checkPerform(p);
        break;
      case 'CreateTransaction':
        result = await create(p, hozir);
        break;
      case 'PerformTransaction':
        result = await perform(p, hozir);
        break;
      case 'CancelTransaction':
        result = await cancel(p, hozir);
        break;
      case 'CheckTransaction':
        result = await checkTx(p);
        break;
      case 'GetStatement':
        result = await statement(p);
        break;
      case 'SetFiscalData':
        result = await fiscal(p);
        break;
      default:
        throw X.metod(so.method);
    }
    return { jsonrpc: '2.0', id, result };
  } catch (err) {
    if (err instanceof RpcXato) {
      return { jsonrpc: '2.0', id, error: { code: err.kod, message: err.matn, ...(err.data ? { data: err.data } : {}) } };
    }
    xatoQayd(err, { joy: 'payme-merchant', qoshimcha: { method: so.method } });
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32400, message: { uz: 'Ichki xato', ru: 'Внутренняя ошибка', en: 'Internal error' } },
    };
  }
}
