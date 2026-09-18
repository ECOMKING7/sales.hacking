/**
 * Piksel so'rovlari cheklovi.
 *
 * NEGA QAYTA YOZILDI: ilgari cheklov xotiradagi `Map` da edi.
 * Serverless muhitda (server doim yonib turmaydi — so'rov kelganda
 * bir necha soniyaga uyg'onadi) har so'rov boshqa nusxada bajarilishi
 * mumkin, har nusxaning o'z xotirasi bor. Ya'ni "daqiqasiga 100 ta"
 * amalda "100 × nusxalar soni" bo'lardi. Cheklov bor ko'rinardi,
 * lekin amalda hech narsani to'smasdi — bu eng yomon holat, chunki
 * himoya bor deb o'ylaysiz.
 *
 * Bu endpoint PAROLSIZ ochiq va boshqacha bo'lishi ham mumkin emas:
 * u mijozning saytidan, brauzerdan chaqiriladi. Demak cheklov —
 * himoyaning o'zi.
 *
 * IKKI QATLAM:
 *   1. Xotira (tez yo'l) — shu nusxa allaqachon limitdan oshgan
 *      bo'lsa, bazaga umuman bormaymiz. Hujum paytida bu bazani
 *      himoya qiladi.
 *   2. Baza (haqiqat) — bitta UPSERT hisoblagichni oshiradi va yangi
 *      qiymatni qaytaradi. Hamma nusxa bitta raqamni ko'radi.
 *
 * FAIL-OPEN: baza javob bermasa so'rov o'tkaziladi. Piksel yo'li
 * mijozning saytini hech qachon buzmasligi kerak — bu qoida
 * cheklovdan ustun.
 */
import { pool } from '../db/pool';

/** Bir daqiqada bitta workspace uchun ruxsat etilgan hodisalar. */
const DAQIQADA = 100;
/** Shu muddatdan eski hisoblagich qatorlari keraksiz. */
const SAQLASH_DAQIQA = 10;

/** Xotiradagi tez yo'l: workspace -> { daqiqa, son }. */
const tezYol = new Map<string, { daqiqa: number; son: number }>();

/** Vaqtni daqiqaga yaxlitlaydi (epoch daqiqalari). */
export function daqiqaRaqami(now: number = Date.now()): number {
  return Math.floor(now / 60_000);
}

export interface PikselHolat {
  /** Limitdan oshdimi — shu so'rov rad etiladi. */
  bloklandi: boolean;
  /** Shu daqiqadagi hisob (bilinsa). */
  son: number;
}

/**
 * Hodisani hisoblaydi va limitdan oshgan-oshmaganini aytadi.
 * Har so'rovda BIR MARTA chaqiriladi.
 */
export async function pikselCheklovi(workspaceId: string): Promise<PikselHolat> {
  const hozirgiDaqiqa = daqiqaRaqami();

  // 1-qatlam: xotira. Shu nusxa allaqachon limitni bilgan bo'lsa —
  // bazaga bormay rad etamiz.
  const xotira = tezYol.get(workspaceId);
  if (xotira && xotira.daqiqa === hozirgiDaqiqa) {
    xotira.son += 1;
    if (xotira.son > DAQIQADA) {
      return { bloklandi: true, son: xotira.son };
    }
  } else {
    tezYol.set(workspaceId, { daqiqa: hozirgiDaqiqa, son: 1 });
  }

  // 2-qatlam: baza. Bitta so'rov — oshiradi va yangi qiymatni qaytaradi.
  try {
    const { rows } = await pool.query<{ n: number }>(
      `INSERT INTO pixel_hits (workspace_id, minute, n)
       VALUES ($1, date_trunc('minute', now()), 1)
       ON CONFLICT (workspace_id, minute)
       DO UPDATE SET n = pixel_hits.n + 1
       RETURNING n`,
      [workspaceId]
    );
    const son = Number(rows[0]?.n ?? 1);

    // Xotirani baza haqiqatiga tenglashtiramiz: keyingi so'rovlar
    // shu nusxada bazaga bormay rad etiladi.
    tezYol.set(workspaceId, { daqiqa: hozirgiDaqiqa, son });

    // Tozalash: 1% so'rovda, alohida cron kerak bo'lmasin.
    if (Math.random() < 0.01) {
      void pool
        .query(
          `DELETE FROM pixel_hits
            WHERE minute < now() - make_interval(mins => $1::int)`,
          [SAQLASH_DAQIQA]
        )
        .catch(() => undefined);
    }

    return { bloklandi: son > DAQIQADA, son };
  } catch (err) {
    // Fail-open: piksel mijoz saytini buzmasin.
    console.error('piksel cheklovi ishlamadi (fail-open):', (err as Error).message);
    return { bloklandi: false, son: 0 };
  }
}
