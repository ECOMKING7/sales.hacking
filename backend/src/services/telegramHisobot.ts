/* ═══════════════════════════════════════════════════════════════════════
   1-ISH: REJALI HISOBOT

   "Tanlangan vaqtda reklama bo'yicha hisobot beradi, qaysi metrikalar —
   har kim o'zi tanlaydi."

   ─── VAQT QANDAY ISHLAYDI ───────────────────────────────────────────
   Cron har 30 daqiqada bir marta keladi (cron-job.org). Shuning uchun
   hisobot vaqti AMALDA 30 daqiqalik aniqlikda: 09:00 deb qo'yilsa
   09:00–09:30 oralig'ida keladi.

   Tanlov SQL'da qilinadi:
     (now() AT TIME ZONE vaqt_zonasi)::time >= hisobot_vaqti
     AND (oxirgi_hisobot IS NULL OR oxirgi_hisobot < mahalliy_sana)

   Bu shakl ikki narsani beradi:
     1. Kuniga BIR marta (oxirgi_hisobot qo'riqchisi).
     2. O'tkazib yuborilgan cron o'zini tuzatadi: 09:00 dagi chaqiruv
        yiqilsa, 09:30 dagisi baribir yuboradi — jim yo'qolmaydi.

   ⚠ VAQT ZONASI CHALKASHLIGI (hujjatlashtirilgan cheklov):
   `ad_insights_daily.kun` — Facebook reklama akkauntining vaqt
   zonasida. `leads.won_at` — UTC. Hisobotning "kecha" si esa chat
   vaqt zonasida. Uch xil kun chegarasi. Akkaunt Toshkentda bo'lsa
   (bizning holat) farq yo'q; boshqa zonadagi akkauntda kun chegarasida
   bir necha lid siljishi mumkin. BU TEKSHIRILISHI KERAK.
   ═══════════════════════════════════════════════════════════════════════ */

import { pool } from '../db/pool';
import { loadCurrencyGuard, spendInCrmCurrency } from '../utils/currencyGuard';
import { xatoQayd } from '../utils/xatolar';
import { chatgaYubor, botTokenBor } from './telegram';
import {
  hisobotMatni,
  metrikalarniTozala,
  type HisobotMalumot,
  type TafsilotQator,
} from './telegramMatn';

export const DAVRLAR = ['kecha', 'bugun', '7kun'] as const;
export type Davr = (typeof DAVRLAR)[number];

export const TAFSILOTLAR = ['yoq', 'kampaniya', 'reklama'] as const;
export type Tafsilot = (typeof TAFSILOTLAR)[number];

export interface ChatQator {
  id: string;
  workspace_id: string;
  chat_id: string;
  nom: string | null;
  vaqt_zonasi: string;
  hisobot_davri: string;
  metrikalar: string[];
  tafsilot: string;
  tafsilot_soni: number;
}

/** `Date` → 'YYYY-MM-DD' berilgan vaqt zonasida. */
export function sanaMahalliy(d: Date, tz: string): string {
  // en-CA formati aynan YYYY-MM-DD beradi — qo'lda yig'ishdan xavfsizroq.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function kunQoshib(sana: string, kun: number): string {
  const d = new Date(`${sana}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + kun);
  return d.toISOString().slice(0, 10);
}

/**
 * Davr nomidan sana oralig'i. TOZA funksiya — testlanadi.
 *
 * `bugun` ataylab "hozirgacha": ertalab 09:00 da yuborilgan "bugun"
 * hisoboti deyarli bo'sh bo'ladi va bu foydasiz. Shuning uchun standart
 * `kecha`.
 */
export function davrOraligi(
  davr: string,
  bugun: string
): { since: string; until: string; nomi: string } {
  switch (davr) {
    case 'bugun':
      return { since: bugun, until: bugun, nomi: 'Bugun' };
    case '7kun':
      return { since: kunQoshib(bugun, -7), until: kunQoshib(bugun, -1), nomi: "So'nggi 7 kun" };
    case 'kecha':
    default: {
      const k = kunQoshib(bugun, -1);
      return { since: k, until: k, nomi: 'Kecha' };
    }
  }
}

/**
 * Davr bo'yicha umumiy raqamlar.
 *
 * FB tomoni `ad_insights_daily` dan — kunlik jadval. Entity jadvallari
 * (`ads.spend`) BUTUN DAVR uchun oxirgi sinxron suratini saqlaydi,
 * ya'ni ulardan kunlik raqam olib bo'lmaydi. Bu farqni aralashtirish
 * CLAUDE.md da yozilgan "oyna" xatosining aynan o'zi.
 */
export async function hisobotMalumot(
  workspaceId: string,
  since: string,
  until: string
): Promise<HisobotMalumot> {
  const fb = await pool.query<{
    sarf: string;
    korishlar: string;
    bosishlar: string;
    fb_lidlar: string;
  }>(
    `SELECT COALESCE(SUM(spend), 0)       AS sarf,
            COALESCE(SUM(impressions), 0) AS korishlar,
            COALESCE(SUM(clicks), 0)      AS bosishlar,
            COALESCE(SUM(leads_count), 0) AS fb_lidlar
       FROM ad_insights_daily
      WHERE workspace_id = $1 AND kun BETWEEN $2 AND $3`,
    [workspaceId, since, until]
  );

  /* CRM tomoni. Har raqam O'Z sanasi bo'yicha filtrlanadi:
     lid — yaratilgan kuni, sifatli — sifatli bo'lgan kuni,
     sotuv — yopilgan kuni. Hammasini bitta sanaga bog'lash
     ("shu kuni yaratilgan va shu kuni yopilgan") sotuvlarni deyarli
     nolga tushiradi, chunki bitim o'rtacha 12–20 kun davom etadi. */
  const crm = await pool.query<{
    lidlar: string;
    sifatli: string;
    sotuvlar: string;
    daromad: string;
    deal_time: string | null;
  }>(
    `SELECT
       COUNT(*) FILTER (
         WHERE crm_created_at IS NOT NULL AND crm_created_at::date BETWEEN $2 AND $3
       ) AS lidlar,
       COUNT(*) FILTER (
         WHERE qualified_at IS NOT NULL AND qualified_at::date BETWEEN $2 AND $3
       ) AS sifatli,
       COUNT(*) FILTER (
         WHERE won_at IS NOT NULL AND won_at::date BETWEEN $2 AND $3
       ) AS sotuvlar,
       COALESCE(SUM(revenue) FILTER (
         WHERE won_at IS NOT NULL AND won_at::date BETWEEN $2 AND $3
       ), 0) AS daromad,
       AVG(EXTRACT(EPOCH FROM (won_at - crm_created_at)) / 86400) FILTER (
         WHERE won_at IS NOT NULL AND crm_created_at IS NOT NULL
           AND won_at::date BETWEEN $2 AND $3
       ) AS deal_time
     FROM leads
     WHERE workspace_id = $1`,
    [workspaceId, since, until]
  );

  const guard = await loadCurrencyGuard(workspaceId);
  const sarf = Number(fb.rows[0]?.sarf ?? 0);

  return {
    sarf,
    korishlar: Number(fb.rows[0]?.korishlar ?? 0),
    bosishlar: Number(fb.rows[0]?.bosishlar ?? 0),
    fbLidlar: Number(fb.rows[0]?.fb_lidlar ?? 0),
    lidlar: Number(crm.rows[0]?.lidlar ?? 0),
    sifatli: Number(crm.rows[0]?.sifatli ?? 0),
    sotuvlar: Number(crm.rows[0]?.sotuvlar ?? 0),
    daromad: Number(crm.rows[0]?.daromad ?? 0),
    dealTimeOrtacha:
      crm.rows[0]?.deal_time === null || crm.rows[0]?.deal_time === undefined
        ? null
        : Number(crm.rows[0].deal_time),
    fbValyuta: guard.fb,
    crmValyuta: guard.crm,
    sarfCrmda: guard.canComputeRoas ? spendInCrmCurrency(sarf, guard) : null,
    valyutaSababi: guard.mismatch ? guard.reason : null,
  };
}

/**
 * Eng ko'p sarflagan N kampaniya yoki reklama.
 *
 * Ikki so'rov + JS'da birlashtirish: xarajat kunlik jadvaldan
 * (davr bo'yicha), lid va sotuv esa `leads` dan (o'z sanalari bo'yicha).
 * Bitta SQL'da qilish uchun ikki xil sana filtrini bitta JOIN ga
 * siqish kerak bo'lardi — o'qilmaydigan va xato qilish oson.
 */
export async function tafsilotQatorlari(
  workspaceId: string,
  since: string,
  until: string,
  tur: Tafsilot,
  soni: number
): Promise<TafsilotQator[]> {
  if (tur === 'yoq' || soni <= 0) return [];

  const kampaniyami = tur === 'kampaniya';
  const nomManba = kampaniyami ? 'c.name' : 'a.name';
  const kalit = kampaniyami ? 'c.id' : 'a.id';

  const sarf = await pool.query<{ kalit: string; nom: string | null; sarf: string }>(
    `SELECT ${kalit}::text AS kalit, ${nomManba} AS nom,
            COALESCE(SUM(d.spend), 0) AS sarf
       FROM ad_insights_daily d
       JOIN ads a ON a.id = d.ad_id
       ${kampaniyami ? 'LEFT JOIN campaigns c ON c.id = a.campaign_id' : ''}
      WHERE d.workspace_id = $1 AND d.kun BETWEEN $2 AND $3
      GROUP BY ${kalit}, ${nomManba}
      HAVING COALESCE(SUM(d.spend), 0) > 0
      ORDER BY sarf DESC
      LIMIT $4`,
    [workspaceId, since, until, soni]
  );

  if (sarf.rows.length === 0) return [];
  const kalitlar = sarf.rows.map((r) => r.kalit);

  const crm = await pool.query<{
    kalit: string;
    lidlar: string;
    sotuvlar: string;
    daromad: string;
  }>(
    `SELECT ${kampaniyami ? 'a.campaign_id' : 'a.id'}::text AS kalit,
            COUNT(*) FILTER (
              WHERE l.crm_created_at::date BETWEEN $2 AND $3
            ) AS lidlar,
            COUNT(*) FILTER (
              WHERE l.won_at::date BETWEEN $2 AND $3
            ) AS sotuvlar,
            COALESCE(SUM(l.revenue) FILTER (
              WHERE l.won_at::date BETWEEN $2 AND $3
            ), 0) AS daromad
       FROM leads l
       JOIN ads a ON a.id = l.last_click_ad_id
      WHERE l.workspace_id = $1
        AND ${kampaniyami ? 'a.campaign_id' : 'a.id'}::text = ANY($4::text[])
      GROUP BY 1`,
    [workspaceId, since, until, kalitlar]
  );

  const xarita = new Map(crm.rows.map((r) => [r.kalit, r]));

  return sarf.rows.map((r) => {
    const c = xarita.get(r.kalit);
    return {
      nom: r.nom ?? '(nomsiz)',
      sarf: Number(r.sarf),
      lidlar: Number(c?.lidlar ?? 0),
      sotuvlar: Number(c?.sotuvlar ?? 0),
      daromad: Number(c?.daromad ?? 0),
    };
  });
}

/** Bitta chat uchun to'liq hisobot matni. Sinov tugmasi ham shuni chaqiradi. */
export async function chatHisoboti(chat: ChatQator): Promise<string> {
  const bugun = sanaMahalliy(new Date(), chat.vaqt_zonasi);
  const { since, until, nomi } = davrOraligi(chat.hisobot_davri, bugun);

  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM workspaces WHERE id = $1`,
    [chat.workspace_id]
  );

  const malumot = await hisobotMalumot(chat.workspace_id, since, until);
  const tafsilot = await tafsilotQatorlari(
    chat.workspace_id,
    since,
    until,
    chat.tafsilot as Tafsilot,
    chat.tafsilot_soni
  );

  return hisobotMatni({
    akkaunt: rows[0]?.name ?? 'Akkaunt',
    davrNomi: nomi,
    since,
    until,
    metrikalar: metrikalarniTozala(chat.metrikalar),
    malumot,
    tafsilotSarlavha:
      chat.tafsilot === 'kampaniya'
        ? `Top ${tafsilot.length} kampaniya`
        : chat.tafsilot === 'reklama'
          ? `Top ${tafsilot.length} reklama`
          : null,
    tafsilot,
  });
}

export interface HisobotNatija {
  tekshirildi: number;
  yuborildi: number;
  xato: number;
}

/**
 * Cron chaqiradigan yagona funksiya.
 *
 * ⚠ BITTA CHATDAGI XATO QOLGANLARINI TO'XTATMAYDI (§3.6). Har chat
 * o'z `try` ida: bitta mijozning bloklangan boti butun platformaning
 * ertalabki hisobotini yo'q qilmasligi kerak.
 */
export async function hisobotlarniYubor(): Promise<HisobotNatija> {
  const natija: HisobotNatija = { tekshirildi: 0, yuborildi: 0, xato: 0 };
  if (!botTokenBor()) return natija;

  const { rows } = await pool.query<ChatQator>(
    `SELECT id, workspace_id, chat_id, nom, vaqt_zonasi, hisobot_davri,
            metrikalar, tafsilot, tafsilot_soni
       FROM telegram_chats
      WHERE faol = TRUE
        AND hisobot_vaqti IS NOT NULL
        AND (now() AT TIME ZONE vaqt_zonasi)::time >= hisobot_vaqti
        AND (
          oxirgi_hisobot IS NULL
          OR oxirgi_hisobot < (now() AT TIME ZONE vaqt_zonasi)::date
        )`
  );

  natija.tekshirildi = rows.length;

  for (const chat of rows) {
    try {
      const matn = await chatHisoboti(chat);
      const n = await chatgaYubor(chat.id, chat.chat_id, matn);

      /* Sana FAQAT muvaffaqiyatdan keyin belgilanadi: aks holda
         vaqtincha nosozlik (Telegram 500) o'sha kunlik hisobotni
         butunlay yo'qotardi. Keyingi cron qayta urinadi. */
      if (n.ok) {
        await pool.query(
          `UPDATE telegram_chats
              SET oxirgi_hisobot = (now() AT TIME ZONE vaqt_zonasi)::date
            WHERE id = $1`,
          [chat.id]
        );
        natija.yuborildi++;
      } else {
        natija.xato++;
      }
    } catch (err) {
      natija.xato++;
      xatoQayd(err, {
        joy: 'telegram-hisobot',
        workspaceId: chat.workspace_id,
        qoshimcha: { chatRow: chat.id },
      });
    }
  }

  return natija;
}
