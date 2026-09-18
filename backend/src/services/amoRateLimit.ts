/**
 * amoCRM so'rov limiti.
 *
 * HODISA: 15.09 da mijozning akkaunti "API so'rovlari limitidan oshdi"
 * sababi bilan bloklandi. O'sha akkauntga to'rtta integratsiya ulangan
 * — biz beshinchisimiz va boshqalarning sarfini ko'rmaymiz. Facebook
 * uchun limit hisobi bor edi, amoCRM uchun umuman yo'q edi.
 *
 * Uchta himoya, uchtasi ham kerak:
 *
 *  1. ORALIQ — bitta nusxa ichida so'rovlar orasidagi eng kam vaqt.
 *     amoCRM hujjatida "7 so'rov/sekund" deyilgan; biz 4 dan
 *     oshmaymiz, chunki akkauntda bizdan boshqa ham mijoz bor.
 *
 *  2. 429 GA JAVOB — qayta urinish limitni UZAYTIRADI, shuning uchun
 *     bir marta kutamiz (Retry-After bo'yicha), ikkinchisida to'xtaymiz.
 *
 *  3. SOVISH VAQTI BAZADA — serverless'da xotira umumiy emas. Bitta
 *     funksiya nusxasi 429 ko'rsa, boshqasi bundan bexabar so'rov
 *     yuboraverardi. Endi sovish vaqti workspaces jadvalida.
 *
 * ⚠ TEKSHIRILISHI KERAK: amoCRM javob sarlavhalarida sarf foizini
 * bermaydi (Facebook'dan farqli). Ya'ni "limitning necha foizi
 * ishlatilgan" degan savolga javob yo'q — faqat 429 kelgach bilamiz.
 */
import { pool } from '../db/pool';

/** So'rovlar orasidagi eng kam vaqt (ms). 250ms ≈ 4 so'rov/sekund. */
const ENG_KAM_ORALIQ_MS = 250;
/** 429 kelganda Retry-After bo'lmasa — shuncha kutamiz. */
const SUKUT_KUTISH_MS = 5_000;
/** Ikkinchi 429 dan keyin butun akkaunt shuncha soviydi. */
const SOVISH_DAQIQA = 10;

/** Oxirgi so'rov vaqti — har domen uchun alohida, shu nusxa ichida. */
const oxirgiSorov = new Map<string, number>();

function kut(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Navbatdagi so'rovgacha kutish. Bitta nusxa ichida ketma-ketlikni
 * saqlaydi: ikki so'rov ENG_KAM_ORALIQ_MS dan yaqin bo'lmaydi.
 */
export async function oraliqniKut(domain: string): Promise<void> {
  const endi = Date.now();
  const oxirgi = oxirgiSorov.get(domain) ?? 0;
  const otgan = endi - oxirgi;
  if (otgan < ENG_KAM_ORALIQ_MS) {
    await kut(ENG_KAM_ORALIQ_MS - otgan);
  }
  oxirgiSorov.set(domain, Date.now());
}

/**
 * Bu workspace hozir sovishdami? Sovishda bo'lsa — necha soniya qolgani.
 *
 * Fail-open: baza javob bermasa so'rov to'xtatilmaydi. Aks holda
 * bazadagi vaqtinchalik muammo butun integratsiyani o'chirib qo'yardi.
 */
export async function sovishHolati(workspaceId: string): Promise<number> {
  try {
    const { rows } = await pool.query<{ qoldi: string | null }>(
      `SELECT GREATEST(0, EXTRACT(EPOCH FROM (amocrm_cooldown_until - now())))::text AS qoldi
         FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    const qoldi = Number(rows[0]?.qoldi ?? 0);
    return Number.isFinite(qoldi) && qoldi > 0 ? Math.ceil(qoldi) : 0;
  } catch {
    return 0;
  }
}

/** Sovish vaqtini belgilash (429 dan keyin). */
export async function sovishniBelgila(
  workspaceId: string,
  daqiqa = SOVISH_DAQIQA
): Promise<void> {
  try {
    await pool.query(
      `UPDATE workspaces
          SET amocrm_cooldown_until = now() + make_interval(mins => $2::int)
        WHERE id = $1`,
      [workspaceId, daqiqa]
    );
    console.warn(`amocrm: workspace ${workspaceId} ${daqiqa} daqiqaga to'xtatildi (429)`);
  } catch (err) {
    console.error('amocrm sovish vaqti yozilmadi:', (err as Error).message);
  }
}

/** Sovishni bekor qilish — muvaffaqiyatli so'rovdan keyin. */
export async function sovishniTozala(workspaceId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE workspaces SET amocrm_cooldown_until = NULL
        WHERE id = $1 AND amocrm_cooldown_until IS NOT NULL`,
      [workspaceId]
    );
  } catch {
    /* jim: bu faqat tozalash */
  }
}

/** 429 javobidagi Retry-After (soniya) → kutish vaqti (ms). */
export function kutishVaqti(retryAfter: unknown): number {
  const sek = Number(retryAfter);
  if (Number.isFinite(sek) && sek > 0) {
    // Juda uzun qiymat funksiyani o'ldiradi — 30 soniyadan oshirmaymiz.
    return Math.min(sek, 30) * 1000;
  }
  return SUKUT_KUTISH_MS;
}
