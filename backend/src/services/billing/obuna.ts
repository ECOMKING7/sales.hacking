import { pool } from '../../db/pool';
import { encrypt, decrypt } from '../../utils/encryption';
import { xatoQayd } from '../../utils/xatolar';
import { emailYubor } from '../email';
import { billingSxemasiniTaminla } from './sxema';
import { eskiCheckoutlarniBekor } from './checkout';
import {
  JAMI_URINISH,
  billingUrl,
  PLAN_NOMI,
  QAYTA_URINISH_KUN,
  birOyKeyin,
  clickQarori,
  eslatmaSanasi,
  narxlar,
  paymeQarori,
  pullikPlanmi,
  yangilashDavrBoshi,
  type BillingHolat,
  type Provayder,
  type PullikPlan,
  type Qaror,
} from './qoidalar';
import { eslatmaXati, tolovOtdiXati, tolovOtmadiXati } from './xatlar';
import {
  PAYME_TOLANGAN,
  PaymeXato,
  paymeChekHolati,
  paymeChekTola,
  paymeChekYarat,
  paymeKartaOchir,
  paymeSozlama,
} from './payme';
import { CLICK_TOLANGAN, ClickXato, clickTokenOchir, clickTolovHolati, clickYech, clickSozlama } from './click';

/* ─────────────────────────────────────────────────────────────
   OBUNA YADROSI.

   IKKI MARTA YECHMASLIK — eng muhim kafolat:
     • har urinish oldidan `billing_payments` ga 'pending' yozuv qo'yiladi;
     • QISMAN UNIQUE indekslar:
         (workspace_id, period_start) — bir davr bir marta;
         (workspace_id) WHERE pending/unknown — bir vaqtda bitta ochiq to'lov;
     • natija noma'lum bo'lsa (tarmoq uzildi) yozuv 'pending'/'unknown'
       bo'lib qoladi va QAYTA URINILMAYDI — provayderdan holat so'raladi
       yoki odam hal qiladi (scripts/billing-hal.ts).
     • cron har workspace'ni avval "egallaydi" (billing_next_attempt_at
       +20 daqiqa, FOR UPDATE SKIP LOCKED) — parallel ikki cron bitta
       mijozga ikki marta tegmaydi.

   ROZILIK:
     • birinchi to'lovda ko'rsatilgan summa `billing_amount_uzs` ga yoziladi
       va keyingi yechishlar AYNAN shu summa bilan bo'ladi;
     • har yangilash oldidan 7 kunlik eslatma YUBORILGAN bo'lishi shart —
       xat ketmagan bo'lsa yechish kechiktiriladi (shartlarda va'da qilingan).

   Uzun tranzaksiya YO'Q: pool max=1, tashqi API kutilayotganda
   ulanishni band qilib turish butun API'ni to'xtatardi.
   ───────────────────────────────────────────────────────────── */

export { billingUrl } from './qoidalar';

interface KartaQator {
  id: string;
  provider: Provayder;
  token_enc: string;
  masked: string | null;
}

async function faolKarta(workspaceId: string): Promise<KartaQator | null> {
  const { rows } = await pool.query<KartaQator>(
    `SELECT id, provider, token_enc, masked FROM billing_cards
      WHERE workspace_id = $1 AND active AND verified LIMIT 1`,
    [workspaceId]
  );
  return rows[0] ?? null;
}

type Yechish = { holat: 'paid' | 'pending' | 'failed' | 'unknown'; ref?: string; xato?: string };

/** Provayderga murojaat. Hech qachon throw qilmaydi — natijani qaytaradi. */
async function yech(karta: KartaQator, summa: number, tolovId: string, tavsif: string): Promise<Yechish> {
  let token: string;
  try {
    token = decrypt(karta.token_enc);
  } catch {
    return { holat: 'failed', xato: "Karta tokeni o'qilmadi — kartani qayta ulang" };
  }

  if (karta.provider === 'payme') {
    const s = paymeSozlama();
    if (!s) return { holat: 'failed', xato: 'Payme sozlanmagan' };
    let chek: string;
    try {
      chek = await paymeChekYarat(s, { somSumma: summa, tolovId, tavsif });
    } catch (err) {
      // Chek yaratilmadi — pul yechilmagan, xavfsiz "failed".
      return { holat: 'failed', xato: (err as Error).message };
    }
    // Chek ID darhol saqlanadi: pay paytida aloqa uzilsa ham holatni so'ray olamiz.
    try {
      await pool.query(`UPDATE billing_payments SET provider_ref = $1 WHERE id = $2`, [chek, tolovId]);
    } catch {
      /* oxirida baribir yoziladi */
    }
    try {
      const state = await paymeChekTola(s, chek, token);
      if (state === PAYME_TOLANGAN) return { holat: 'paid', ref: chek };
      return { holat: 'pending', ref: chek };
    } catch (err) {
      if (!(err instanceof PaymeXato)) return { holat: 'pending', ref: chek, xato: (err as Error).message };
      // Payme rad xatosi qaytardi — lekin ichki/timeout xatosida pul baribir
      // yechilgan bo'lishi mumkin. Taxmin qilmaymiz: chek holatini so'raymiz.
      try {
        const q = paymeQarori(await paymeChekHolati(s, chek), true);
        if (q === 'paid') return { holat: 'paid', ref: chek };
        if (q === 'failed') return { holat: 'failed', ref: chek, xato: err.message };
      } catch {
        /* so'rab bo'lmadi — pending, keyin aniqlanadi */
      }
      return { holat: 'pending', ref: chek, xato: err.message };
    }
  }

  const s = clickSozlama();
  if (!s) return { holat: 'failed', xato: 'Click sozlanmagan' };
  try {
    const r = await clickYech(s, token, summa, tolovId);
    const q = clickQarori(r.holat);
    if (q === 'paid') return { holat: 'paid', ref: r.paymentId };
    if (q === 'failed') return { holat: 'failed', ref: r.paymentId, xato: `Click holati ${r.holat}` };
    return { holat: 'pending', ref: r.paymentId };
  } catch (err) {
    if (err instanceof ClickXato) return { holat: 'failed', xato: err.message };
    // Javob kelmadi: yechildimi-yo'qmi noma'lum, payment_id ham yo'q.
    return { holat: 'unknown', xato: (err as Error).message };
  }
}

interface WsQator {
  id: string;
  email: string;
  paid_until: Date | null;
  billing_plan: string | null;
  billing_status: BillingHolat;
  billing_fail_count: number;
  auto_renew: boolean;
  billing_amount_uzs: string | null;
}

const WS_USTUNLAR = `w.id, u.email, w.paid_until, w.billing_plan, w.billing_status,
  w.billing_fail_count, w.auto_renew, w.billing_amount_uzs`;

async function wsOl(workspaceId: string): Promise<WsQator | null> {
  const { rows } = await pool.query<WsQator>(
    `SELECT ${WS_USTUNLAR} FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = $1`,
    [workspaceId]
  );
  return rows[0] ?? null;
}

/** Mijoz rozilik bergan summa; yo'q bo'lsa (eski yozuv) — joriy narx. */
function yechiladiganSumma(ws: Pick<WsQator, 'billing_amount_uzs'>, plan: PullikPlan): number | null {
  const saqlangan = Number(ws.billing_amount_uzs ?? 0);
  return saqlangan > 0 ? saqlangan : narxlar()[plan];
}

/**
 * To'lov 'paid' bo'ldi — muddatni uzaytirish.
 * BITTA SQL (CTE): "to'landi" belgisi va paid_until uzaytirish birga yoziladi —
 * orada funksiya o'ldirilsa, to'langan-lekin-uzaytirilmagan holat qolmaydi.
 * Idempotent: faqat pending/unknown → paid o'tishda ishlaydi.
 * kind='initial': avto-yangilash yoqiladi va rozilik summasi saqlanadi.
 */
export async function tolovniYakunla(tolovId: string, ref?: string): Promise<boolean> {
  const { rows } = await pool.query<{
    workspace_id: string;
    plan: PullikPlan;
    period_end: Date;
    amount_uzs: string;
    card_id: string | null;
  }>(
    `WITH t AS (
       UPDATE billing_payments
          SET status = 'paid', paid_at = now(), provider_ref = COALESCE($2, provider_ref), error = NULL
        WHERE id = $1 AND status IN ('pending', 'unknown') AND kind <> 'onetime'
        RETURNING workspace_id, plan, period_end, amount_uzs, card_id, kind
     ), w AS (
       UPDATE workspaces ws
          SET plan = t.plan, billing_plan = t.plan, billing_status = 'active',
              paid_until = GREATEST(COALESCE(ws.paid_until, t.period_end), t.period_end),
              auto_renew = CASE WHEN t.kind = 'initial' THEN true ELSE ws.auto_renew END,
              billing_amount_uzs = CASE WHEN t.kind = 'initial' THEN t.amount_uzs ELSE ws.billing_amount_uzs END,
              billing_fail_count = 0, billing_next_attempt_at = NULL, updated_at = now()
         FROM t WHERE ws.id = t.workspace_id
        RETURNING ws.id
     )
     SELECT t.workspace_id, t.plan, t.period_end, t.amount_uzs, t.card_id FROM t`,
    [tolovId, ref ?? null]
  );
  const t = rows[0];
  if (!t) return false;
  // Pul olindi va muddat uzaytirildi. Qolgani (kvitansiya xati) — fail-soft:
  // bu yerdagi xato foydalanuvchiga "500" bo'lib qaytmasin.
  try {
    const ws = await wsOl(t.workspace_id);
    const karta = t.card_id
      ? (await pool.query<{ masked: string | null }>(`SELECT masked FROM billing_cards WHERE id = $1`, [t.card_id])).rows[0]
      : undefined;
    if (ws?.email) {
      await emailYubor(
        tolovOtdiXati({
          kimga: ws.email,
          plan: t.plan,
          summa: Number(t.amount_uzs),
          sana: ws.paid_until ? new Date(ws.paid_until) : new Date(t.period_end),
          karta: karta?.masked ?? 'karta',
          billingUrl: billingUrl(),
        }),
        `tolov-${tolovId}`
      );
    }
  } catch (err) {
    console.warn('billing: kvitansiya xati yuborilmadi:', (err as Error).message);
  }
  return true;
}

export type TolovNatija =
  | { ok: true; paidUntil: Date }
  | { ok: false; xato: string; jarayonda?: boolean; band?: boolean };

/**
 * Bitta yechish urinishi.
 *  kind='initial' — foydalanuvchi "To'lash" bosganda, davr hozirdan boshlanadi.
 *  kind='renewal' — cron, davr eski paid_until dan boshlanadi (sana siljimaydi).
 */
export async function tolovQil(p: {
  workspaceId: string;
  kind: 'initial' | 'renewal';
  plan: PullikPlan;
  summa: number | null;
  davrBoshi: Date;
}): Promise<TolovNatija> {
  await billingSxemasiniTaminla();
  // SOZLAMA xatosi mijozning aybi emas: "band" qaytadi — urinish hisoblanmaydi,
  // mijoz past_due/expired bo'lmaydi, faqat bizga ogohlantirish ketadi.
  if (!p.summa) {
    xatoQayd(new Error(`billing: ${p.plan} summasi aniqlanmadi (env?)`), { joy: 'billing-sozlama', workspaceId: p.workspaceId });
    return { ok: false, band: true, xato: `${PLAN_NOMI[p.plan]} tarifi narxi sozlanmagan` };
  }
  const karta = await faolKarta(p.workspaceId);
  if (!karta) return { ok: false, xato: "Tasdiqlangan karta yo'q" };
  if (karta.provider === 'payme' ? !paymeSozlama() : !clickSozlama()) {
    xatoQayd(new Error(`billing: ${karta.provider} env sozlanmagan`), { joy: 'billing-sozlama', workspaceId: p.workspaceId });
    return { ok: false, band: true, xato: `${karta.provider} hozircha ishlamayapti` };
  }

  const davrOxiri = birOyKeyin(p.davrBoshi);
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO billing_payments
       (workspace_id, card_id, provider, kind, plan, amount_uzs, status, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [p.workspaceId, karta.id, karta.provider, p.kind, p.plan, p.summa, p.davrBoshi, davrOxiri]
  );
  const tolovId = ins.rows[0]?.id;
  if (!tolovId) return { ok: false, band: true, xato: "To'lov allaqachon jarayonda yoki bu davr to'langan" };

  const r = await yech(karta, p.summa, tolovId, `McQueen AI ${PLAN_NOMI[p.plan]} — 1 oy`);

  if (r.holat === 'paid') {
    await tolovniYakunla(tolovId, r.ref);
    return { ok: true, paidUntil: davrOxiri };
  }
  if (r.holat === 'failed') {
    await pool.query(
      `UPDATE billing_payments SET status = 'failed', error = $2, provider_ref = COALESCE($3, provider_ref) WHERE id = $1`,
      [tolovId, (r.xato ?? '').slice(0, 500), r.ref ?? null]
    );
    return { ok: false, xato: r.xato ?? "To'lov rad etildi" };
  }
  // pending / unknown — qayta urinilmaydi, holat keyin aniqlanadi.
  await pool.query(
    `UPDATE billing_payments SET status = $2, error = $3, provider_ref = COALESCE($4, provider_ref) WHERE id = $1`,
    [tolovId, r.holat, (r.xato ?? '').slice(0, 500) || null, r.ref ?? null]
  );
  if (r.holat === 'unknown') {
    xatoQayd(new Error(`billing: to'lov natijasi noma'lum (${tolovId}) — provayder kabinetida tekshiring`), {
      joy: 'billing-nomalum',
      workspaceId: p.workspaceId,
    });
  }
  return { ok: false, jarayonda: true, xato: "To'lov ishlov berilmoqda — bir necha daqiqadan so'ng tekshiring" };
}

/* ───────────── Karta ───────────── */

/** Bir soatda bitta workspace uchun nechta karta ulash urinishi (SMS bombing / card testing). */
export const SOATLIK_KARTA_CHEGARASI = 5;
export const SMS_URINISH_CHEGARASI = 5;

export async function kartaUrinishlariSoati(workspaceId: string): Promise<number> {
  await billingSxemasiniTaminla();
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM billing_cards WHERE workspace_id = $1 AND created_at > now() - interval '1 hour'`,
    [workspaceId]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function kartaniSaqla(p: {
  workspaceId: string;
  provider: Provayder;
  token: string;
  masked: string;
  telefon?: string | null;
  tasdiqlangan: boolean;
}): Promise<string> {
  await billingSxemasiniTaminla();
  if (!p.tasdiqlangan) {
    // SMS kutilayotgan karta FAOL kartani almashtirmaydi: kod kiritilmasa
    // eski karta ishlashda davom etadi. Oldingi tasdiqlanmaganlar tozalanadi —
    // provayderda ham (aks holda Click'da ishlatilmaydigan tokenlar to'planadi).
    // DELETE emas, belgilash: soatlik chegara hisobi uchun qator saqlanadi.
    await tasdiqlanmaganlarniTozala(p.workspaceId);
    await pool.query(
      `UPDATE billing_cards SET token_enc = '', updated_at = now()
        WHERE workspace_id = $1 AND NOT active AND NOT verified AND token_enc <> ''`,
      [p.workspaceId]
    );
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO billing_cards (workspace_id, provider, token_enc, masked, phone_masked, verified, active)
       VALUES ($1, $2, $3, $4, $5, false, false) RETURNING id`,
      [p.workspaceId, p.provider, encrypt(p.token), p.masked, p.telefon ?? null]
    );
    return rows[0]!.id;
  }
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO billing_cards (workspace_id, provider, token_enc, masked, phone_masked, verified, active)
     VALUES ($1, $2, $3, $4, $5, true, false) RETURNING id`,
    [p.workspaceId, p.provider, encrypt(p.token), p.masked, p.telefon ?? null]
  );
  await kartaniFaollashtir(p.workspaceId, rows[0]!.id);
  return rows[0]!.id;
}

/**
 * Tasdiqlangan kartani faol qiladi, eskisini o'chiradi (provayderda ham).
 * past_due bo'lsa — keyingi urinish DARHOL (mijoz yangi karta ulagani shu uchun).
 */
export async function kartaniFaollashtir(workspaceId: string, kartaId: string): Promise<void> {
  const eski = await pool.query<KartaQator>(
    `UPDATE billing_cards SET active = false, updated_at = now()
      WHERE workspace_id = $1 AND active AND id <> $2
      RETURNING id, provider, token_enc, masked`,
    [workspaceId, kartaId]
  );
  await pool.query(
    `UPDATE billing_cards SET active = true, verified = true, updated_at = now() WHERE id = $1 AND workspace_id = $2`,
    [kartaId, workspaceId]
  );
  await pool.query(
    `UPDATE workspaces SET billing_next_attempt_at = now()
      WHERE id = $1 AND billing_status = 'past_due' AND auto_renew`,
    [workspaceId]
  );
  for (const k of eski.rows) await tokenniProvayderdaOchir(k);
}

export async function tokenniProvayderdaOchir(k: Pick<KartaQator, 'provider' | 'token_enc'>): Promise<void> {
  if (!k.token_enc) return;
  try {
    const token = decrypt(k.token_enc);
    if (k.provider === 'payme') {
      const s = paymeSozlama();
      if (s) await paymeKartaOchir(s, token);
    } else {
      const s = clickSozlama();
      if (s) await clickTokenOchir(s, token);
    }
  } catch (err) {
    console.warn("billing: karta tokeni provayderda o'chirilmadi:", (err as Error).message);
  }
}

/** Tasdiqlanmagan eski tokenlarni provayderda o'chirish. */
async function tasdiqlanmaganlarniTozala(workspaceId: string): Promise<void> {
  await billingSxemasiniTaminla();
  const { rows } = await pool.query<KartaQator>(
    `SELECT id, provider, token_enc, masked FROM billing_cards
      WHERE workspace_id = $1 AND NOT active AND NOT verified AND token_enc <> ''`,
    [workspaceId]
  );
  for (const k of rows) await tokenniProvayderdaOchir(k);
}

export async function kartaniOchir(workspaceId: string): Promise<void> {
  await billingSxemasiniTaminla();
  const { rows } = await pool.query<KartaQator>(
    `UPDATE billing_cards SET active = false, updated_at = now()
      WHERE workspace_id = $1 AND active
      RETURNING id, provider, token_enc, masked`,
    [workspaceId]
  );
  // Kartasiz avto-yangilash ma'nosiz — o'chiriladi; joriy muddat oxirigacha tarif qoladi.
  await pool.query(
    `UPDATE workspaces SET auto_renew = false,
            billing_status = CASE WHEN billing_status IN ('active','past_due') THEN 'canceled' ELSE billing_status END,
            updated_at = now()
      WHERE id = $1`,
    [workspaceId]
  );
  for (const k of rows) await tokenniProvayderdaOchir(k);
}

/* ───────────── Obuna boshqaruvi ───────────── */

/**
 * @param kutilganSumma — mijoz ekranda ko'rgan summa. Joriy narxdan farq qilsa
 *   yechilmaydi: rozilik aynan ko'rsatilgan summaga berilgan.
 */
export async function obunaBoshla(
  workspaceId: string,
  plan: PullikPlan,
  kutilganSumma: number
): Promise<TolovNatija & { narxOzgardi?: boolean }> {
  await billingSxemasiniTaminla();
  const ws = await wsOl(workspaceId);
  if (!ws) return { ok: false, xato: 'Workspace topilmadi' };
  const faol = ws.billing_status === 'active' || ws.billing_status === 'past_due' || ws.billing_status === 'canceled';
  const muddatBor = ws.paid_until && new Date(ws.paid_until) > new Date();

  if (faol && muddatBor && ws.billing_plan === plan) {
    // Shu tarif to'langan — qayta yechmaymiz, faqat avto-yangilashni yoqamiz.
    // Kartasiz yoqish = keyin 3 marta muvaffaqiyatsiz urinish va Free'ga tushish.
    if (!(await faolKarta(workspaceId))) return { ok: false, xato: 'Avval karta ulang' };
    await pool.query(
      `UPDATE workspaces SET auto_renew = true, billing_status = 'active', billing_consent_at = now() WHERE id = $1`,
      [workspaceId]
    );
    return { ok: true, paidUntil: new Date(ws.paid_until!) };
  }

  const narx = narxlar()[plan];
  if (!narx) return { ok: false, xato: `${PLAN_NOMI[plan]} tarifi hozir sotuvda emas` };
  if (narx !== kutilganSumma) {
    return { ok: false, narxOzgardi: true, xato: "Narx yangilandi — sahifani yangilab, summani qayta tasdiqlang" };
  }

  // Pastroq tarifga (Agency → Pro) to'langan davr o'rtasida o'tilmaydi:
  // aks holda mijoz Agency'ning qolgan kunlarini yo'qotib, yana pul to'lardi.
  if (faol && muddatBor && pullikPlanmi(ws.billing_plan)) {
    const joriy = yechiladiganSumma(ws, ws.billing_plan) ?? 0;
    if (narx < joriy) {
      return {
        ok: false,
        xato: `Pastroq tarifga to'langan muddat tugagach o'tiladi: avto-yangilashni o'chiring, muddat tugagach ${PLAN_NOMI[plan]} ni tanlang`,
      };
    }
  }

  await pool.query(`UPDATE workspaces SET billing_consent_at = now() WHERE id = $1`, [workspaceId]);
  // Yuqoriroq tarifga o'tish: to'liq narx, yangi davr HOZIRDAN. Eski tarifning
  // qolgan kunlari hisobga OLINMAYDI (proratsiya yo'q — MVP; UI buni aytadi).
  const r = await tolovQil({ workspaceId, kind: 'initial', plan, summa: narx, davrBoshi: new Date() });
  if (!r.ok) return r;
  const yangi = await wsOl(workspaceId).catch(() => null);
  return { ok: true, paidUntil: yangi?.paid_until ? new Date(yangi.paid_until) : r.paidUntil };
}

export async function avtoYangilash(workspaceId: string, yoqilsin: boolean): Promise<{ ok: boolean; xato?: string }> {
  await billingSxemasiniTaminla();
  if (yoqilsin && !(await faolKarta(workspaceId))) return { ok: false, xato: 'Avval karta ulang' };
  await pool.query(
    `UPDATE workspaces
        SET auto_renew = $2,
            billing_status = CASE
              WHEN $2 AND billing_status = 'canceled' THEN 'active'
              WHEN NOT $2 AND billing_status = 'active' THEN 'canceled'
              ELSE billing_status END,
            billing_consent_at = CASE WHEN $2 THEN now() ELSE billing_consent_at END,
            updated_at = now()
      WHERE id = $1`,
    [workspaceId, yoqilsin]
  );
  return { ok: true };
}

export async function billingHolati(workspaceId: string) {
  await billingSxemasiniTaminla();
  const [ws, karta, tolovlar] = await Promise.all([
    pool.query(
      `SELECT plan, billing_plan, billing_status, paid_until, auto_renew, billing_next_attempt_at, billing_amount_uzs
         FROM workspaces WHERE id = $1`,
      [workspaceId]
    ),
    pool.query(
      `SELECT provider, masked, phone_masked, verified, created_at FROM billing_cards
        WHERE workspace_id = $1 AND active LIMIT 1`,
      [workspaceId]
    ),
    pool.query(
      `SELECT id, kind, plan, amount_uzs, status, provider, period_start, period_end, created_at, paid_at
         FROM billing_payments
        WHERE workspace_id = $1
          -- Ochilib to'lanmagan checkout'lar tarixda ko'rinmaydi (mijoz Payme
          -- sahifasini yopib ketgan bo'lishi mumkin) — faqat to'langani.
          AND NOT (kind = 'onetime' AND status <> 'paid')
        ORDER BY created_at DESC LIMIT 24`,
      [workspaceId]
    ),
  ]);
  const p = paymeSozlama();
  const o = ws.rows[0];
  // Mijoz Payme sahifasidan qaytgan, Perform hali kelmagan bo'lishi mumkin —
  // frontend shu bayroq bilan holatni qayta so'raydi.
  const kutilmoqda = await pool.query(
    `SELECT 1 FROM payme_transactions pt JOIN billing_checkout bc ON bc.id = pt.checkout_id
      WHERE bc.workspace_id = $1 AND pt.state = 1 LIMIT 1`,
    [workspaceId]
  );
  return {
    checkoutKutilmoqda: Boolean(kutilmoqda.rowCount),
    obuna: o ? { ...o, billing_amount_uzs: o.billing_amount_uzs === null ? null : Number(o.billing_amount_uzs) } : null,
    karta: karta.rows[0] ?? null,
    tolovlar: tolovlar.rows.map((t) => ({ ...t, amount_uzs: Number(t.amount_uzs) })),
    narxlar: narxlar(),
    provayderlar: {
      // Kassa ID — ochiq ma'lumot (Payme brauzer formasi aynan shu bilan ishlaydi). Kalit QAYTARILMAYDI.
      payme: p ? { merchantId: p.id, test: p.test } : null,
      click: Boolean(clickSozlama()),
      // Bir martalik to'lov (havola/QR) — Payme Merchant API. Subscribe'siz ham ishlaydi.
      paymeCheckout: Boolean(p),
    },
  };
}

/* ───────────── CRON ───────────── */

export interface CronNatija {
  eslatma: number;
  yechildi: number;
  otmadi: number;
  tugatildi: number;
  aniqlandi: number;
  vaqtTugadi: boolean;
}

/** Vercel maxDuration = 300 s. Shu chegaradan keyin yangi yechish BOSHLANMAYDI. */
const VAQT_BYUDJETI_MS = 200_000;

/** Har soatda chaqirilsin (cron-job.org). Har qadam alohida: biri yiqilsa qolganlari ishlaydi. */
export async function billingCron(hozir = new Date()): Promise<CronNatija> {
  await billingSxemasiniTaminla();
  const boshi = Date.now();
  const vaqtBor = () => Date.now() - boshi < VAQT_BYUDJETI_MS;
  const n: CronNatija = { eslatma: 0, yechildi: 0, otmadi: 0, tugatildi: 0, aniqlandi: 0, vaqtTugadi: false };
  for (const [nom, qadam] of [
    ['checkout', async () => {
      n.aniqlandi += await eskiCheckoutlarniBekor(hozir.getTime());
    }],
    ['aniqla', () => osilganlarniAniqla(n, vaqtBor)],
    ['eslatma', () => eslatmalar(n, hozir)],
    ['yechish', () => yangilashlar(n, hozir, vaqtBor)],
    ['tugatish', () => tugaganlar(n)],
  ] as const) {
    try {
      await qadam();
    } catch (err) {
      xatoQayd(err, { joy: `billing-cron-${nom}` });
    }
  }
  n.vaqtTugadi = !vaqtBor();
  return n;
}

/**
 * 7 kun oldin eslatma. Har davr uchun BIR MARTA (billing_notices PK).
 * Muddati o'tib ketgan, lekin eslatmasi ketmagan obunalar ham kiradi
 * (cron to'xtagan bo'lsa) — xatda yechish sanasi kamida 7 kun keyin ko'rsatiladi
 * va yechish shu sanagacha kutadi.
 */
async function eslatmalar(n: CronNatija, hozir: Date): Promise<void> {
  const { rows } = await pool.query<WsQator & { masked: string | null }>(
    `SELECT ${WS_USTUNLAR}, c.masked
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
       JOIN billing_cards c ON c.workspace_id = w.id AND c.active AND c.verified
      WHERE w.auto_renew AND w.billing_status = 'active'
        AND w.paid_until <= $1::timestamptz + interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM billing_notices b
                         WHERE b.workspace_id = w.id AND b.kind = 'eslatma_7kun' AND b.period_end = w.paid_until)
      LIMIT 200`,
    [hozir]
  );
  for (const w of rows) {
    if (!pullikPlanmi(w.billing_plan) || !w.paid_until) continue;
    const summa = yechiladiganSumma(w, w.billing_plan);
    if (!summa) continue;
    // Avval "band" qilamiz (parallel cron ikki xat yubormasin), yuborilmasa — qaytaramiz.
    // period_end bazadagi paid_until'dan to'g'ridan-to'g'ri olinadi: JS Date
    // millisekundgacha qisqartiradi, Postgres esa mikrosekund saqlaydi —
    // aylanib kelgan qiymat tenglik solishtiruvida mos kelmay qolardi.
    const band = await pool.query(
      `INSERT INTO billing_notices (workspace_id, kind, period_end)
       SELECT id, 'eslatma_7kun', paid_until FROM workspaces WHERE id = $1 AND paid_until IS NOT NULL
       ON CONFLICT DO NOTHING RETURNING 1`,
      [w.id]
    );
    if (!band.rowCount) continue;
    const ok = await emailYubor(
      eslatmaXati({
        kimga: w.email,
        plan: w.billing_plan,
        summa,
        sana: eslatmaSanasi(new Date(w.paid_until), hozir),
        karta: w.masked ?? 'karta',
        billingUrl: billingUrl(),
      }),
      `eslatma-${w.id}-${new Date(w.paid_until).toISOString()}`
    );
    if (ok) n.eslatma++;
    else {
      await pool.query(
        `DELETE FROM billing_notices b USING workspaces w
          WHERE b.workspace_id = $1 AND w.id = b.workspace_id
            AND b.kind = 'eslatma_7kun' AND b.period_end = w.paid_until`,
        [w.id]
      );
      xatoQayd(new Error('billing: eslatma xati yuborilmadi — yechish kechiktiriladi'), {
        joy: 'billing-eslatma',
        workspaceId: w.id,
      });
    }
  }
}

async function yangilashlar(n: CronNatija, hozir: Date, vaqtBor: () => boolean): Promise<void> {
  /* EGALLASH: bitta SQL bilan tanlanadi va billing_next_attempt_at +20 daqiqaga
     suriladi (FOR UPDATE SKIP LOCKED). Parallel ikkinchi cron shu qatorlarni
     ko'rmaydi. Shartlar:
       • ochiq (pending/unknown) to'lovi yo'q — aks holda u har soat "band"
         bo'lib, navbatni to'ldirib qo'yardi;
       • 7 kunlik eslatma ≥ 7 kun oldin yuborilgan (past_due — eslatma
         shu davr uchun allaqachon ketgan). */
  const { rows } = await pool.query<WsQator>(
    `UPDATE workspaces w SET billing_next_attempt_at = $1::timestamptz + interval '20 minutes'
       FROM users u
      WHERE u.id = w.owner_id
        AND w.id IN (
          SELECT w2.id FROM workspaces w2
           WHERE w2.auto_renew AND w2.billing_status IN ('active', 'past_due')
             AND w2.paid_until <= $1::timestamptz
             AND (w2.billing_next_attempt_at IS NULL OR w2.billing_next_attempt_at <= $1::timestamptz)
             AND NOT EXISTS (SELECT 1 FROM billing_payments p
                              WHERE p.workspace_id = w2.id AND p.status IN ('pending', 'unknown'))
             -- Mijoz shu payt Payme checkout orqali o'zi to'layapti — kartadan
             -- yechib, bir davrni ikki marta to'latmaymiz (checkout.ts).
             AND NOT EXISTS (SELECT 1 FROM payme_transactions pt
                               JOIN billing_checkout bc ON bc.id = pt.checkout_id
                              WHERE bc.workspace_id = w2.id AND pt.state = 1)
             AND (w2.billing_status = 'past_due' OR EXISTS (
                   SELECT 1 FROM billing_notices b
                    WHERE b.workspace_id = w2.id AND b.kind = 'eslatma_7kun'
                      AND b.period_end = w2.paid_until
                      AND b.sent_at <= $1::timestamptz - interval '7 days' + interval '2 hours'))
           ORDER BY w2.paid_until
           LIMIT 50
           FOR UPDATE SKIP LOCKED)
      RETURNING ${WS_USTUNLAR}`,
    [hozir]
  );
  for (const w of rows) {
    if (!vaqtBor()) break; // qolganlari 20 daqiqadan keyin keyingi cron'da
    if (!pullikPlanmi(w.billing_plan) || !w.paid_until) continue;
    const r = await tolovQil({
      workspaceId: w.id,
      kind: 'renewal',
      plan: w.billing_plan,
      summa: yechiladiganSumma(w, w.billing_plan),
      davrBoshi: yangilashDavrBoshi(new Date(w.paid_until), hozir),
    });
    if (r.ok) {
      n.yechildi++;
      continue;
    }
    if (r.band || r.jarayonda) continue; // natija keyin aniqlanadi — muvaffaqiyatsiz deb hisoblanmaydi
    n.otmadi++;
    await muvaffaqiyatsiz(w.id, r.xato, n);
  }
}

/**
 * Muvaffaqiyatsiz yechish. Hisoblagich ATOMIK oshiriladi (billing_fail_count + 1)
 * — o'qilgan eski qiymatdan emas. 3-urinishda: Free, avto-yangilash o'chadi.
 */
async function muvaffaqiyatsiz(workspaceId: string, sabab: string, n: CronNatija): Promise<void> {
  const { rows } = await pool.query<WsQator & { yangi_soni: number }>(
    `UPDATE workspaces w
        SET billing_fail_count = w.billing_fail_count + 1,
            billing_status = CASE WHEN w.billing_fail_count + 1 >= $2 THEN 'expired' ELSE 'past_due' END,
            plan = CASE WHEN w.billing_fail_count + 1 >= $2 THEN 'free' ELSE w.plan END,
            auto_renew = CASE WHEN w.billing_fail_count + 1 >= $2 THEN false ELSE w.auto_renew END,
            billing_next_attempt_at = CASE WHEN w.billing_fail_count + 1 >= $2 THEN NULL
              ELSE now() + make_interval(days => ($3::int[])[w.billing_fail_count + 1]) END,
            updated_at = now()
       FROM users u
      WHERE w.id = $1 AND u.id = w.owner_id
      RETURNING ${WS_USTUNLAR}, w.billing_fail_count AS yangi_soni, w.billing_next_attempt_at AS keyingi`,
    [workspaceId, JAMI_URINISH, [...QAYTA_URINISH_KUN]]
  );
  const w = rows[0] as (WsQator & { yangi_soni: number; keyingi: Date | null }) | undefined;
  if (!w || !pullikPlanmi(w.billing_plan)) return;
  if (w.yangi_soni >= JAMI_URINISH) n.tugatildi++;
  const karta = await faolKarta(w.id).catch(() => null);
  await emailYubor(
    tolovOtmadiXati({
      kimga: w.email,
      plan: w.billing_plan,
      summa: yechiladiganSumma(w, w.billing_plan) ?? 0,
      sana: new Date(),
      karta: karta?.masked ?? 'karta',
      billingUrl: billingUrl(),
      keyingi: w.keyingi ? new Date(w.keyingi) : null,
      sabab: sabab.slice(0, 120),
    }),
    `otmadi-${w.id}-${w.yangi_soni}-${w.paid_until ? new Date(w.paid_until).toISOString() : ''}`
  );
}

/** Bekor qilinganlar (auto_renew=false) muddati tugaganda — Free. */
async function tugaganlar(n: CronNatija): Promise<void> {
  const r = await pool.query(
    `UPDATE workspaces SET plan = 'free', billing_status = 'expired', updated_at = now()
      WHERE NOT auto_renew AND billing_status IN ('active', 'canceled', 'past_due') AND paid_until <= now()`
  );
  n.tugatildi += r.rowCount ?? 0;
}

/**
 * Osilib qolgan to'lovlarni aniqlash (cron'ning birinchi qadami).
 *
 *  • ref bor (chek / payment_id): provayderdan holat so'raladi — 7 kungacha.
 *    to'langan → yakunlanadi; rad → 'failed'. Agar bu YANGILASH bo'lsa,
 *    muvaffaqiyatsiz urinish sifatida hisoblanadi (aks holda har soat
 *    hisobsiz qayta yechilardi).
 *  • ref yo'q yoki 1 soatdan keyin ham noaniq → 'unknown' + BIR MARTA
 *    ogohlantirish. Avtomatik qayta yechilmaydi: odam provayder kabinetida
 *    tekshirib, `npm run billing:hal` bilan hal qiladi.
 *
 * Har qator alohida try/catch: bitta provayder xatosi qolganlarini to'xtatmaydi.
 */
async function osilganlarniAniqla(n: CronNatija, vaqtBor: () => boolean): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    provider: Provayder;
    provider_ref: string | null;
    workspace_id: string;
    status: 'pending' | 'unknown';
    kind: 'initial' | 'renewal';
    eski: boolean;
  }>(
    `SELECT id, provider, provider_ref, workspace_id, status, kind,
            created_at < now() - interval '1 hour' AS eski
       FROM billing_payments
      WHERE status IN ('pending', 'unknown')
        -- Checkout (Payme Merchant API) to'lovini Payme o'zi yakunlaydi yoki
        -- 12 soatda bekor qilinadi — bu yerda chek holati so'ralmaydi.
        AND kind <> 'onetime'
        AND created_at < now() - interval '10 minutes'
        AND created_at > now() - interval '7 days'
      ORDER BY created_at
      LIMIT 50`
  );
  for (const t of rows) {
    if (!vaqtBor()) break;
    try {
      if (!t.provider_ref) {
        if (t.status === 'pending') await nomalumDeb(t.id, t.workspace_id, "ref yo'q");
        continue;
      }
      let q: Qaror = null;
      if (t.provider === 'payme') {
        const s = paymeSozlama();
        if (!s) continue;
        q = paymeQarori(await paymeChekHolati(s, t.provider_ref), t.eski);
      } else {
        const s = clickSozlama();
        if (!s) continue;
        q = clickQarori(await clickTolovHolati(s, t.provider_ref));
      }
      if (q === 'paid') {
        if (await tolovniYakunla(t.id)) n.aniqlandi++;
      } else if (q === 'failed') {
        const r = await pool.query(
          `UPDATE billing_payments SET status = 'failed', error = COALESCE(error, 'Provayder: to''lanmagan')
            WHERE id = $1 AND status IN ('pending', 'unknown')`,
          [t.id]
        );
        if (r.rowCount) {
          n.aniqlandi++;
          if (t.kind === 'renewal') await muvaffaqiyatsiz(t.workspace_id, "To'lov o'tmadi", n);
        }
      } else if (t.eski && t.status === 'pending') {
        await nomalumDeb(t.id, t.workspace_id, 'provayder hali yakunlamagan');
      }
    } catch (err) {
      console.warn(`billing: ${t.id} holatini so'rab bo'lmadi:`, (err as Error).message);
    }
  }
}

async function nomalumDeb(id: string, workspaceId: string, sabab: string): Promise<void> {
  const r = await pool.query(`UPDATE billing_payments SET status = 'unknown' WHERE id = $1 AND status = 'pending'`, [id]);
  if (r.rowCount) {
    xatoQayd(new Error(`billing: to'lov ${id} holati noma'lum (${sabab}) — provayder kabinetida tekshiring`), {
      joy: 'billing-nomalum',
      workspaceId,
    });
  }
}

/**
 * Qo'lda hal qilish (scripts/billing-hal.ts): provayder kabinetida tekshirilgan
 * 'unknown'/'pending' to'lovni 'paid' yoki 'failed' qiladi.
 */
export async function tolovniQoldaHalQil(tolovId: string, natija: 'paid' | 'failed'): Promise<boolean> {
  await billingSxemasiniTaminla();
  // Checkout (onetime) to'lovi payme_transactions bilan bog'liq: uni faqat Payme
  // (Perform/Cancel) yoki 12 soatlik timeout yopadi. Qo'lda yopish tranzaksiya
  // bilan nomuvofiqlik yaratardi — pul olinib tarif berilmasligi yoki teskarisi.
  const { rows } = await pool.query<{ kind: string }>(`SELECT kind FROM billing_payments WHERE id = $1`, [tolovId]);
  if (rows[0]?.kind === 'onetime') return false;
  if (natija === 'paid') return tolovniYakunla(tolovId);
  const r = await pool.query(
    `UPDATE billing_payments SET status = 'failed', error = COALESCE(error, 'Qo''lda: to''lanmagan')
      WHERE id = $1 AND status IN ('pending', 'unknown')`,
    [tolovId]
  );
  return Boolean(r.rowCount);
}
