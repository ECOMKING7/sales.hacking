/* ═══════════════════════════════════════════════════════════════
   QO'NG'IROQ VORONKASI → CALL KAMPANIYA

   Qo'ng'iroq lidida UTM ham, fbclid ham, Meta Lead ID ham yo'q. Lekin
   telefoniya reklama raqamiga kelgan qo'ng'iroqqa amoCRM'da kartochkani
   alohida voronkada ochadi. Demak: lid SHU voronkada YARATILGAN bo'lsa,
   u shu voronkaga biriktirilgan call kampaniyadan kelgan.

   Xarita konfiguratsiyada (§3.1):  { "<amoCRM voronka ID>": "<FB kampaniya ID>" }

   ANIQLIK:
     kampaniya darajasi — 100% (raqam faqat shu kampaniyada turadi)
     ad darajasi        — TAXMINIY. Qo'ng'iroq qaysi ad'dan kelgani hech
                          qayerda yozilmaydi. Lid o'sha kuni eng ko'p
                          pul sarflagan ad'ga yoziladi (shunday ad bo'lmasa —
                          umumiy natijasi eng ko'p ad'ga). Kampaniya
                          yig'indisi bundan buzilmaydi.

   Butun lid BITTA ad'ga yoziladi (vaznni bo'lmasdan): `purchases_count`
   butun son ustuni, kasr vazn uni yaxlitlab kampaniya sotuvlarini
   kamaytirib yuborardi.
   ═══════════════════════════════════════════════════════════════ */

import type { Pool, PoolClient } from 'pg';
import { pool } from '../db/pool';

type Sorovchi = Pick<Pool | PoolClient, 'query'>;

/** voronka ID -> FB kampaniya ID */
export type QongiroqXaritasi = Record<string, string>;

/* ---------- sxema: migratsiya qo'lda yurgizilmagan bo'lsa ham ishlasin ---------- */

let sxema: Promise<boolean> | null = null;

/**
 * 046 ustunlari borligini ta'minlaydi. Natija keshlanadi — keyingi
 * chaqiruvlar so'rov yubormaydi.
 *
 * ⚠ OCHIQ TRANZAKSIYA ICHIDAN CHAQIRILMASIN: serverless'da pool `max: 1`,
 * bu funksiya o'zi ulanish oladi va kutib qoladi.
 */
export function qongiroqSxemasiniTaminla(): Promise<boolean> {
  if (!sxema) {
    sxema = (async () => {
      try {
        const bor = await pool.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND ((table_name = 'workspaces' AND column_name IN ('qongiroq_voronkalari', 'capi_event_call'))
                OR (table_name = 'leads' AND column_name IN ('kanal', 'qongiroq_kampaniya', 'yaratilgan_voronka')))`
        );
        if ((bor.rows[0]?.n ?? 0) >= 5) return true;

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query("SET LOCAL lock_timeout = '3s'");
          await client.query(
            `ALTER TABLE workspaces
               ADD COLUMN IF NOT EXISTS qongiroq_voronkalari JSONB NOT NULL DEFAULT '{}'::jsonb,
               ADD COLUMN IF NOT EXISTS capi_event_call TEXT`
          );
          await client.query(
            `ALTER TABLE leads
               ADD COLUMN IF NOT EXISTS kanal TEXT,
               ADD COLUMN IF NOT EXISTS qongiroq_kampaniya TEXT,
               ADD COLUMN IF NOT EXISTS yaratilgan_voronka TEXT`
          );
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw e;
        } finally {
          client.release();
        }
        return true;
      } catch (err) {
        console.warn("Qo'ng'iroq ustunlari yaratilmadi —", (err as Error).message);
        sxema = null; // keyingi chaqiruvda qayta urinadi
        return false;
      }
    })();
  }
  return sxema;
}

/* ---------- toza funksiyalar (testlanadi) ---------- */

/** JSONB qiymatini xavfsiz xaritaga aylantiradi: faqat "raqam": "raqam". */
export function xaritaniTozala(qiymat: unknown): QongiroqXaritasi {
  if (!qiymat || typeof qiymat !== 'object' || Array.isArray(qiymat)) return {};
  const natija: QongiroqXaritasi = {};
  for (const [k, v] of Object.entries(qiymat as Record<string, unknown>)) {
    const voronka = String(k).trim();
    const kampaniya = v == null ? '' : String(v).trim();
    if (/^\d+$/.test(voronka) && /^\d+$/.test(kampaniya)) natija[voronka] = kampaniya;
  }
  return natija;
}

/**
 * Lid qo'ng'iroq kampaniyasiga tegishlimi. Kampaniya ID yoki null.
 *
 * Boshqa kuchliroq kalit bo'lsa (Meta Lead ID, fbclid, UTM) — bu
 * qo'ng'iroq EMAS: lid formadan yoki saytdan kelgan, shunchaki shu
 * voronkada ochilgan. O'sha kalit ishonchliroq.
 */
export function qongiroqKampaniyasi(
  yaratilganVoronka: string | null | undefined,
  xarita: QongiroqXaritasi,
  belgilar: { fbLeadId?: string | null; fbclid?: string | null; utmSource?: string | null } = {}
): string | null {
  if (!yaratilganVoronka) return null;
  if (belgilar.fbLeadId || belgilar.fbclid || belgilar.utmSource) return null;
  return xarita[String(yaratilganVoronka)] ?? null;
}

/* ---------- baza ---------- */

/** Workspace xaritasi. Ustun yo'q yoki xato — bo'sh xarita (funksiya o'chiq). */
export async function qongiroqXaritasiniYukla(workspaceId: string): Promise<QongiroqXaritasi> {
  if (!(await qongiroqSxemasiniTaminla())) return {};
  try {
    const { rows } = await pool.query<{ qongiroq_voronkalari: unknown }>(
      `SELECT qongiroq_voronkalari FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    return xaritaniTozala(rows[0]?.qongiroq_voronkalari);
  } catch (err) {
    console.warn("Qo'ng'iroq xaritasi o'qilmadi —", (err as Error).message);
    return {};
  }
}

export interface QongiroqReklamasi {
  adId: string;
  adsetId: string | null;
  campaignId: string | null;
}

/**
 * Kampaniya ichidan lid yoziladigan ad.
 *
 * Tartib: lid kuni eng ko'p sarflagan ad → umumiy natijasi (qo'ng'iroqlar)
 * eng ko'p → umumiy xarajati eng ko'p. Oxirgi kalit `a.id` — natija
 * har chaqiruvda bir xil bo'lsin (idempotentlik).
 *
 * Kun reklama akkaunti vaqt zonasida (`fb_timezone`) — `ad_insights_daily`
 * ham shu zonada. Zona noma'lum bo'lsa Asia/Tashkent (§8 standarti).
 *
 * `null` — kampaniya hali sync qilinmagan yoki unda ad yo'q.
 */
export async function qongiroqReklamasiniTop(
  db: Sorovchi,
  workspaceId: string,
  fbCampaignId: string,
  lidVaqti: Date | string | null
): Promise<QongiroqReklamasi | null> {
  const { rows } = await db.query<{ ad_id: string; adset_id: string | null; campaign_id: string | null }>(
    `SELECT a.id AS ad_id, a.adset_id, a.campaign_id
       FROM ads a
       JOIN campaigns c ON c.id = a.campaign_id AND c.workspace_id = a.workspace_id
       JOIN workspaces w ON w.id = a.workspace_id
       LEFT JOIN ad_insights_daily d
              ON d.workspace_id = a.workspace_id
             AND d.ad_id = a.id
             AND d.kun = (COALESCE($3::timestamptz, now())
                          AT TIME ZONE COALESCE(NULLIF(w.fb_timezone, ''), 'Asia/Tashkent'))::date
      WHERE a.workspace_id = $1
        AND c.fb_campaign_id = $2
      ORDER BY COALESCE(d.spend, 0) DESC, a.results DESC, a.spend DESC, a.id
      LIMIT 1`,
    [workspaceId, fbCampaignId, lidVaqti]
  );
  const r = rows[0];
  return r ? { adId: r.ad_id, adsetId: r.adset_id, campaignId: r.campaign_id } : null;
}
