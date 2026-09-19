/* ═══════════════════════════════════════════════════════════════════════
   KUNLIK INSIGHTS — sana tanlagichni ishlatadigan qism

   Nima o'zgaradi: `ads.spend` bitta ustun edi va butun tarixni saqlardi.
   Endi `ad_insights_daily` da har reklama × har kun alohida qator.
   Istalgan oraliq shu yerdan YIG'ILADI.

   Eski ustunlar joyida qoladi va yozilishda davom etadi — ular "butun
   davr" ko'rinishi uchun kerak va ularni birdan olib tashlash butun
   dashboardni buzardi. Ikkisi yonma-yon yashaydi, lekin MA'NOSI boshqa:

     ads.spend              → butun tarix (date_preset=maximum)
     ad_insights_daily.spend → aniq kun

   ⚠ Ularni QO'SHIB bo'lmaydi. Bir xil pul ikki joyda turadi.
   ═══════════════════════════════════════════════════════════════════════ */

import { pool } from '../db/pool';
import { decrypt } from '../utils/encryption';
import { fetchAll, normalizeActId } from './facebookAdsService';

/**
 * Bir chaqiruvda qancha kun so'raladi.
 *
 * NEGA BO'LAKLAB: `time_increment=1` bilan Facebook javobni kunlarga
 * bo'ladi — 1 600 reklama × 90 kun = 144 000 qator, bitta so'rovda
 * kelmaydi va serverless funksiya 300 soniyada uziladi.
 *
 * 30 kun ≈ 48 000 qator ≈ 10–20 sahifa. Bu chegaraga sig'adi va
 * chaqiruvchi `keyingi_until` bilan oxirigacha aylantiradi.
 */
const BOLAK_KUN = 30;

/** Har kuni qayta o'qiladigan oxirgi kunlar — FB raqamlari kechikadi. */
const YANGILASH_KUN = 3;

interface KunlikQator {
  ad_id?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

const LEAD_TURLARI = [
  'leadgen.other',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'lead',
];
const SOTUV_TURLARI = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];
/**
 * Qo'ng'iroq maqsadidagi kampaniyalarda "natija" shu hodisalar.
 * Ro'yxat `facebookAdsService` dagi CALL_ACTIONS bilan bir xil bo'lishi
 * SHART — aks holda kunlik va butun davr raqamlari bir-biriga mos kelmaydi.
 */
const QONGIROQ_TURLARI = ['click_to_call_native_call_placed', 'onsite_conversion.flow_complete'];

/**
 * Bir hodisani bir necha action_type ostida qaytaradi — QO'SHIB bo'lmaydi.
 * Ro'yxat ustuvorlik tartibida: birinchi topilgani olinadi.
 *
 * (Bu qoida `facebookAdsService` da ham bor. Ikki joyda bo'lgani yomon,
 * lekin u yerdagi funksiya eksport qilinmagan va uni ochish sinxronning
 * ichki mantig'ini tashqariga chiqarardi. TEKSHIRILISHI KERAK: keyinroq
 * bitta umumiy modulga chiqarish.)
 */
function hodisa(
  royxat: Array<{ action_type: string; value: string }> | undefined,
  turlar: string[]
): number {
  if (!royxat) return 0;
  for (const tur of turlar) {
    const topildi = royxat.find((a) => a.action_type === tur);
    if (topildi) {
      const n = Number(topildi.value);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

function son(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface BolakNatija {
  since: string;
  until: string;
  /** Facebook qaytargan qatorlar. */
  qatorlar: number;
  /** Bazaga yozilganlar (bizda mavjud reklamalar bo'yicha). */
  yozildi: number;
  /** Bizda bo'lmagan reklamaga tegishli qatorlar — sinxron kerak. */
  notanish_reklama: number;
  /** Oldinga (eskiroq) davom etish uchun. null — tugadi. */
  keyingi_until: string | null;
}

function sanaMatn(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Bitta bo'lakni (30 kun) yuklaydi va `ad_insights_daily` ga yozadi.
 *
 * Idempotent: PRIMARY KEY (workspace, ad, kun) bo'yicha UPSERT.
 * Ya'ni bir kunni yuz marta yuklash ham bir xil natija beradi —
 * bu muhim, chunki oxirgi kunlar har sinxronda qayta o'qiladi.
 */
export async function bolakniYukla(
  workspaceId: string,
  until: string,
  kunSoni = BOLAK_KUN
): Promise<BolakNatija> {
  const wsRes = await pool.query<{
    fb_ad_account_id: string | null;
    fb_access_token: string | null;
    daily_backfill_start: string | null;
    daily_backfill_end: string | null;
  }>(
    `SELECT w.fb_ad_account_id, u.fb_access_token,
            w.daily_backfill_start::text, w.daily_backfill_end::text
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
      WHERE w.id = $1`,
    [workspaceId]
  );
  const ws = wsRes.rows[0];
  if (!ws?.fb_access_token) throw Object.assign(new Error('Facebook ulanmagan'), { status: 400 });
  if (!ws.fb_ad_account_id)
    throw Object.assign(new Error('Ad akkaunt tanlanmagan'), { status: 400 });

  const token = decrypt(ws.fb_access_token);
  const actId = normalizeActId(ws.fb_ad_account_id);

  const untilD = new Date(`${until}T00:00:00Z`);
  const sinceD = new Date(untilD);
  sinceD.setUTCDate(sinceD.getUTCDate() - (kunSoni - 1));
  const since = sanaMatn(sinceD);

  const qatorlar = await fetchAll<KunlikQator>(
    `${actId}/insights`,
    {
      level: 'ad',
      time_increment: 1,
      fields: 'ad_id,spend,impressions,clicks,actions,action_values',
      time_range: JSON.stringify({ since, until }),
      limit: 500,
    },
    token
  );

  // Bizdagi reklamalarning FB id → UUID xaritasi. Bitta so'rov, keyin
  // xotirada — har qator uchun bazaga borish 144 000 so'rov bo'lardi.
  const { rows: adRows } = await pool.query<{ id: string; fb_ad_id: string }>(
    `SELECT id, fb_ad_id FROM ads WHERE workspace_id = $1 AND fb_ad_id IS NOT NULL`,
    [workspaceId]
  );
  const adXarita = new Map(adRows.map((r) => [r.fb_ad_id, r.id]));

  let yozildi = 0;
  let notanish = 0;

  // Bir so'rovda ko'p qator — 500 talik to'plamlarda.
  const toplam: Array<
    [string, string, string, number, number, number, number, number, number, number]
  > = [];
  for (const q of qatorlar) {
    if (!q.ad_id || !q.date_start) continue;
    const adUuid = adXarita.get(q.ad_id);
    if (!adUuid) {
      notanish += 1;
      continue;
    }
    toplam.push([
      workspaceId,
      adUuid,
      q.date_start,
      son(q.spend),
      son(q.impressions),
      son(q.clicks),
      hodisa(q.actions, LEAD_TURLARI),
      hodisa(q.actions, SOTUV_TURLARI),
      hodisa(q.action_values, SOTUV_TURLARI),
      hodisa(q.actions, QONGIROQ_TURLARI),
    ]);
  }

  for (let i = 0; i < toplam.length; i += 500) {
    const bolak = toplam.slice(i, i + 500);
    const qiymatlar: unknown[] = [];
    const joylar = bolak
      .map((r, j) => {
        qiymatlar.push(...r);
        const b = j * 10;
        return `($${b + 1}::uuid,$${b + 2}::uuid,$${b + 3}::date,$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
      })
      .join(',');

    await pool.query(
      `INSERT INTO ad_insights_daily
         (workspace_id, ad_id, kun, spend, impressions, clicks, leads_count,
          fb_purchases, fb_revenue, calls_count)
       VALUES ${joylar}
       ON CONFLICT (workspace_id, ad_id, kun) DO UPDATE SET
         spend        = EXCLUDED.spend,
         impressions  = EXCLUDED.impressions,
         clicks       = EXCLUDED.clicks,
         leads_count  = EXCLUDED.leads_count,
         fb_purchases = EXCLUDED.fb_purchases,
         fb_revenue   = EXCLUDED.fb_revenue,
         calls_count  = EXCLUDED.calls_count,
         yangilandi   = now()`,
      qiymatlar
    );
    yozildi += bolak.length;
  }

  // Qamrov chegarasini kengaytiramiz. `LEAST/GREATEST` — bo'laklar
  // tartibsiz kelsa ham chegara to'g'ri qoladi.
  await pool.query(
    `UPDATE workspaces
        SET daily_backfill_start = LEAST(COALESCE(daily_backfill_start, $2::date), $2::date),
            daily_backfill_end   = GREATEST(COALESCE(daily_backfill_end,   $3::date), $3::date)
      WHERE id = $1`,
    [workspaceId, since, until]
  );

  // Keyingi (eskiroq) bo'lak: shu oraliqdan bir kun oldin.
  const keyingi = new Date(sinceD);
  keyingi.setUTCDate(keyingi.getUTCDate() - 1);

  return {
    since,
    until,
    qatorlar: qatorlar.length,
    yozildi,
    notanish_reklama: notanish,
    keyingi_until: sanaMatn(keyingi),
  };
}

/**
 * Har sinxronda chaqiriladi: faqat oxirgi bir necha kunni yangilaydi.
 *
 * NEGA BUTUN TARIXNI EMAS: Facebook raqamlari bir necha kun davomida
 * aniqlashadi (atribusiya oynasi yopilgunicha). Eski kunlar esa
 * o'zgarmaydi — ularni har 30 daqiqada qayta o'qish behuda so'rov.
 */
export async function oxirgiKunlarniYangila(workspaceId: string): Promise<BolakNatija | null> {
  const bugun = sanaMatn(new Date());
  try {
    return await bolakniYukla(workspaceId, bugun, YANGILASH_KUN);
  } catch (e) {
    // Kunlik yangilanish yiqilsa asosiy sinxron to'xtamasligi kerak —
    // xarajat va lid ustunlari baribir yangilanadi.
    console.warn('kunlik insights yangilanmadi:', (e as Error).message);
    return null;
  }
}
