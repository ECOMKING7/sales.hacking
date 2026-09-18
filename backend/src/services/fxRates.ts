/**
 * Valyuta kurslari.
 *
 * NEGA KERAK
 * ROAS = revenue / spend. Daromad CRM valyutasida, xarajat reklama
 * akkaunti valyutasida. Real mijozda: CRM UZS, 15 ta reklama akkaunti
 * USD. Kurssiz formula so'mni dollarga bo'ladi va raqam ~12 600 barobar
 * shishadi (6558x o'rniga ~23x).
 *
 * MANBA
 * cbu.uz — O'zbekiston Markaziy banki, rasmiy kunlik kurs, kalitsiz.
 *   GET https://cbu.uz/uz/arkhiv-kursov-valyut/json/
 *   [{ Ccy:"USD", Nominal:"1", Rate:"11797.46", Date:"17.09.2026" }, ...]
 * Hamma valyuta SO'MDA kotirovka qilinadi. Shuning uchun bazada
 * quote = UZS, boshqa juftliklar kross-kurs orqali olinadi:
 *   USD -> EUR = (USD->UZS) / (EUR->UZS)
 *
 * ⚠ TEKSHIRILISHI KERAK: CBU dam olish va bayram kunlari yangi kurs
 * bermaydi. Shuning uchun qidiruv "aynan shu sana" emas, "shu sanadan
 * oldingi eng yaqin" tamoyilida ishlaydi.
 *
 * ⚠ Bu rasmiy kurs, bank sotuv kursi emas. Farq odatda 1–3%. Mijoz
 * dollarni bozordan olsa real xarajati biroz yuqori — ya'ni bu yerdagi
 * ROAS biroz optimistik. Keyinchalik akkaunt sozlamasida "o'z kursim"
 * maydonini qo'shish mumkin.
 */
import axios from 'axios';
import { pool } from '../db/pool';

const CBU_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/';
export const FX_SOURCE = 'cbu.uz';
/** Bazadagi kotirovka valyutasi. */
const QUOTE = 'UZS';

interface CbuRow {
  Ccy?: string;
  Nominal?: string;
  Rate?: string;
  Date?: string;
}

export interface FxRate {
  /** 1 `base` = `rate` `quote`. */
  rate: number;
  /** Kurs qaysi kunga tegishli (YYYY-MM-DD). */
  date: string;
  source: string;
}

function norm(code: string | null | undefined): string | null {
  const s = String(code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

/** CBU "17.09.2026" -> "2026-09-17". Boshqa shakl kelsa null. */
function parseCbuDate(v: string | undefined): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * CBU dan bugungi kurslarni olib bazaga yozadi.
 * Qaytaradi: nechta valyuta yozildi.
 */
export async function syncFxRates(): Promise<{ saved: number; date: string | null }> {
  const res = await axios.get<CbuRow[]>(CBU_URL, { timeout: 20_000 });
  const rows = Array.isArray(res.data) ? res.data : [];
  if (!rows.length) throw new Error('CBU bo\'sh javob qaytardi');

  let saved = 0;
  let lastDate: string | null = null;

  for (const r of rows) {
    const base = norm(r.Ccy);
    const date = parseCbuDate(r.Date);
    const rate = Number(r.Rate);
    // Nominal: 100 JPY kabi kotirovkalar 1 birlikka keltiriladi.
    const nominal = Number(r.Nominal ?? '1') || 1;

    if (!base || !date || !Number.isFinite(rate) || rate <= 0) continue;
    if (base === QUOTE) continue; // UZS -> UZS jadvalda saqlanmaydi, u 1.

    const perUnit = rate / nominal;

    await pool.query(
      `INSERT INTO fx_rates (base, quote, rate, rate_date, source)
       VALUES ($1, $2, $3, $4::date, $5)
       ON CONFLICT (base, quote, rate_date)
       DO UPDATE SET rate = EXCLUDED.rate,
                     source = EXCLUDED.source,
                     fetched_at = now()`,
      [base, QUOTE, perUnit, date, FX_SOURCE]
    );
    saved += 1;
    lastDate = date;
  }

  return { saved, date: lastDate };
}

/** Bitta valyutaning so'mdagi kursi — sanadan oldingi eng yaqini. */
async function rateToQuote(base: string, onDate: string): Promise<FxRate | null> {
  if (base === QUOTE) return { rate: 1, date: onDate, source: 'identity' };

  const { rows } = await pool.query<{ rate: string; rate_date: string; source: string }>(
    `SELECT rate, rate_date::text AS rate_date, source
       FROM fx_rates
      WHERE base = $1 AND quote = $2 AND rate_date <= $3::date
      ORDER BY rate_date DESC
      LIMIT 1`,
    [base, QUOTE, onDate]
  );
  const row = rows[0];
  if (!row) return null;

  const rate = Number(row.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { rate, date: row.rate_date, source: row.source };
}

/**
 * `from` -> `to` kursi. Ikkalasi ham so'mga nisbatan olinadi va
 * bo'linadi, shuning uchun istalgan juftlik ishlaydi.
 *
 * Kurs topilmasa null — chaqiruvchi shunda ROAS'ni ko'rsatmaydi.
 * Taxminiy qiymat QAYTARILMAYDI.
 */
export async function getFxRate(
  from: string | null | undefined,
  to: string | null | undefined,
  onDate?: string
): Promise<FxRate | null> {
  const a = norm(from);
  const b = norm(to);
  if (!a || !b) return null;

  const date = (onDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (a === b) return { rate: 1, date, source: 'identity' };

  const [fromRate, toRate] = await Promise.all([rateToQuote(a, date), rateToQuote(b, date)]);
  if (!fromRate || !toRate || toRate.rate === 0) return null;

  return {
    rate: fromRate.rate / toRate.rate,
    // Eskiroq kurs butun hisobning yoshini belgilaydi — shuni ko'rsatamiz.
    date: fromRate.date < toRate.date ? fromRate.date : toRate.date,
    source: fromRate.source === 'identity' ? toRate.source : fromRate.source,
  };
}

/**
 * Kurs eskirgan bo'lsa yangilaydi.
 *
 * Har chaqiruvda CBU ga bormaydi: bazadagi eng so'nggi sana bugungi
 * (yoki kechagi — CBU ertalab yangilaydi, dam olishda umuman bermaydi)
 * bo'lsa hech narsa qilmaydi. Shu sababli uni cron'ga ham, sync
 * endpointiga ham qo'yish xavfsiz.
 *
 * Hech qachon xato otmaydi: kurs yangilanmagani hisobotni to'xtatmasin.
 */
export async function ensureFreshFxRates(): Promise<void> {
  try {
    const latest = await latestFxDate();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (latest && latest >= yesterday) return;

    const { saved, date } = await syncFxRates();
    console.log(`fx: kurs yangilandi (${date ?? '—'}, ${saved} ta valyuta)`);
  } catch (err) {
    console.error('fx: kurs yangilanmadi:', (err as Error).message);
  }
}

/** Bazadagi eng so'nggi kurs sanasi — cron ishlayaptimi degan savolga javob. */
export async function latestFxDate(): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ d: string | null }>(
      `SELECT MAX(rate_date)::text AS d FROM fx_rates`
    );
    return rows[0]?.d ?? null;
  } catch {
    return null;
  }
}
