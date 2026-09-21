/* ═══════════════════════════════════════════════════════════════════════
   META LEAD ADS — "bu lid qaysi reklamadan keldi?"

   NEGA BU FAYL BOR. Mahsulotning asosiy va'dasi — "qaysi reklama qancha
   pul keltirdi". Buning uchun lidni reklamaga bog'lash kerak. Uchta
   mavjud usul (UTM, fbclid, telefon hash) Instant Form lidida
   ISHLAMAYDI, chunki odam saytga umuman o'tmaydi:

     UTM    — linkda keladi, link yo'q
     fbclid — linkda keladi, link yo'q
     piksel — saytda ishlaydi, sayt yo'q

   O'lchangan (FurniGlass, 2026-09-21): `utm_term` 0%, `fbclid` 0%,
   touchpoint 0. Ya'ni 1 623 reklama va $47 521 xarajat hech qaysi
   sotuvga bog'lanmagan.

   Qoladigan yagona iz — Meta Lead ID (amoCRM lid nomida, 98%).
   Lekin u reklamani aytmaydi: uni Meta'dan so'rash kerak.

   ⚠ RUXSAT. `GET /{leadgen_id}` chaqiruvi `ads_management` +
   `pages_read_engagement` + `pages_show_list` talab qiladi. Bizning
   OAuth tokenimizda faqat `ads_read` bor. Shuning uchun `fb_lead_token`
   (System User tokeni) ishlatiladi. Bo'lmasa OAuth tokeni bilan
   urinib ko'riladi — natija odatda 200 emas, va xato SAQLANADI,
   jim o'tmaydi.

   ⚠ CHEKLOV — TEKSHIRILISHI KERAK: Meta lid ma'lumotini ma'lum
   muddatdan keyin o'chiradi (hujjatda 90 kun deyiladi, amalda
   tekshirilmagan). Shuning uchun natija `fb_lead_ads` jadvaliga
   yoziladi: bir marta so'raladi, keyin bazadan o'qiladi.
   ═══════════════════════════════════════════════════════════════════════ */

import axios from 'axios';
import { pool } from '../db/pool';
import { GRAPH_URL as GRAPH } from '../config/graph';
import { decrypt } from '../utils/encryption';

/** Meta javobidan bizga keraklisi. */
export interface LidReklama {
  fbLeadId: string;
  adId: string | null;
  formId: string | null;
}

export interface TokenManba {
  token: string;
  /** Qaysi tokendan foydalanildi — xato xabarida ko'rsatish uchun. */
  manba: 'lead_token' | 'oauth';
}

/**
 * Lead ID shakli: 15–17 xonali son.
 *
 * Nega tekshiramiz: `amocrm_lead_id_field` noto'g'ri sozlansa u yerga
 * telefon (12 xona), forma ID yoki umuman matn tushishi mumkin. Bunday
 * qiymatni Meta'ga yuborish — bekorga so'rov va rate limit.
 */
export function leadIdShakliTogrimi(qiymat: string | null | undefined): boolean {
  if (!qiymat) return false;
  return /^\d{15,17}$/.test(String(qiymat).trim());
}

/**
 * Meta javobidan `ad_id` va `form_id` ni ajratadi.
 *
 * Toza funksiya — tarmoqsiz, shuning uchun testlanadi. Meta maydonni
 * umuman yubormasligi mumkin (masalan organik forma lidida `ad_id`
 * bo'lmaydi) — bu xato emas, shunchaki bog'lanish yo'q.
 */
export function javobdanReklama(
  fbLeadId: string,
  javob: { id?: string; ad_id?: string | number; form_id?: string | number } | null | undefined
): LidReklama {
  const son = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return /^\d+$/.test(s) ? s : null;
  };
  return {
    fbLeadId,
    adId: son(javob?.ad_id),
    formId: son(javob?.form_id),
  };
}

/**
 * Qaysi token ishlatiladi.
 *
 * Tartib qat'iy: avval `fb_lead_token` (System User), keyin OAuth.
 * Ikkalasi ham bo'lmasa — aniq xato, jim `null` emas.
 */
export async function tokenniOl(workspaceId: string): Promise<TokenManba> {
  const { rows } = await pool.query<{
    fb_lead_token: string | null;
    fb_access_token: string | null;
  }>(
    `SELECT w.fb_lead_token, u.fb_access_token
       FROM workspaces w
       LEFT JOIN users u ON u.id = w.owner_id
      WHERE w.id = $1`,
    [workspaceId]
  );
  const r = rows[0];
  if (!r) throw new Error('Workspace topilmadi');

  if (r.fb_lead_token) return { token: decrypt(r.fb_lead_token), manba: 'lead_token' };
  if (r.fb_access_token) return { token: decrypt(r.fb_access_token), manba: 'oauth' };

  throw new Error(
    "Facebook tokeni yo'q. Sozlamalarda Lead Ads tokenini kiriting yoki Facebook'ni ulang."
  );
}

/**
 * Bitta lidni Meta'dan so'raydi.
 *
 * Xatoni YUTMAYDI: chaqiruvchi uni `fb_lead_ads.xato` ga yozadi.
 * Sabab — bu yerdagi eng ehtimolli xato "ruxsat yetarli emas", va u
 * jim qolsa "atribusiya 0" muammosi yana takrorlanadi.
 */
export async function metadanSora(
  token: string,
  fbLeadId: string
): Promise<LidReklama> {
  const res = await axios.get(`${GRAPH}/${fbLeadId}`, {
    params: { fields: 'ad_id,form_id,created_time', access_token: token },
    timeout: 15000,
  });
  return javobdanReklama(fbLeadId, res.data);
}

/** Meta xatosidan odam o'qiydigan sabab. Token HECH QACHON chiqmaydi. */
export function xatoSababi(err: unknown): string {
  const e = err as {
    response?: { status?: number; data?: { error?: { message?: string; code?: number } } };
    message?: string;
  };
  const meta = e.response?.data?.error;
  if (meta?.code === 190) return 'Token yaroqsiz yoki muddati tugagan (190)';
  if (meta?.code === 10 || meta?.code === 200) {
    return `Ruxsat yetarli emas (${meta.code}): ads_management va sahifa huquqlari kerak`;
  }
  if (e.response?.status === 404) return "Lid Meta'da topilmadi (eskirgan yoki o'chirilgan)";
  const xom = meta?.message ?? e.message ?? 'nomalum xato';
  // Token URL yoki xabarga tushib qolgan bo'lsa — maskalaymiz (§4.2).
  return String(xom).replace(/access_token=[^&\s]+/gi, 'access_token=***').slice(0, 300);
}

/**
 * Lead ID -> reklama, kesh bilan.
 *
 * Kesh `fb_lead_ads` jadvalida. Xato ham keshlanadi: aks holda
 * ishlamaydigan lid har sinxronda qayta so'ralib, rate limitni yeydi.
 * `qaytaUrin` bilan xatolarni qayta so'rash mumkin (token tuzatilgach).
 */
export async function lidReklamasiniTop(
  workspaceId: string,
  fbLeadId: string,
  opts: { token?: string; qaytaUrin?: boolean } = {}
): Promise<{ adId: string | null; formId: string | null; keshdan: boolean; xato: string | null }> {
  if (!leadIdShakliTogrimi(fbLeadId)) {
    return { adId: null, formId: null, keshdan: false, xato: "Lead ID shakli noto'g'ri" };
  }

  const kesh = await pool.query<{ fb_ad_id: string | null; fb_form_id: string | null; holat: string; xato: string | null }>(
    `SELECT fb_ad_id, fb_form_id, holat, xato
       FROM fb_lead_ads
      WHERE workspace_id = $1 AND fb_lead_id = $2`,
    [workspaceId, fbLeadId]
  );
  const bor = kesh.rows[0];
  if (bor && (bor.holat === 'ok' || !opts.qaytaUrin)) {
    return {
      adId: bor.fb_ad_id,
      formId: bor.fb_form_id,
      keshdan: true,
      xato: bor.holat === 'ok' ? null : bor.xato,
    };
  }

  const token = opts.token ?? (await tokenniOl(workspaceId)).token;

  try {
    const natija = await metadanSora(token, fbLeadId);
    await pool.query(
      `INSERT INTO fb_lead_ads (workspace_id, fb_lead_id, fb_ad_id, fb_form_id, holat, xato)
       VALUES ($1, $2, $3, $4, 'ok', NULL)
       ON CONFLICT (workspace_id, fb_lead_id)
       DO UPDATE SET fb_ad_id = EXCLUDED.fb_ad_id,
                     fb_form_id = EXCLUDED.fb_form_id,
                     holat = 'ok',
                     xato = NULL`,
      [workspaceId, fbLeadId, natija.adId, natija.formId]
    );
    return { adId: natija.adId, formId: natija.formId, keshdan: false, xato: null };
  } catch (err) {
    const sabab = xatoSababi(err);
    await pool.query(
      `INSERT INTO fb_lead_ads (workspace_id, fb_lead_id, fb_ad_id, fb_form_id, holat, xato)
       VALUES ($1, $2, NULL, NULL, 'error', $3)
       ON CONFLICT (workspace_id, fb_lead_id)
       DO UPDATE SET holat = 'error', xato = EXCLUDED.xato`,
      [workspaceId, fbLeadId, sabab]
    );
    return { adId: null, formId: null, keshdan: false, xato: sabab };
  }
}
