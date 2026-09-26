/* ═══════════════════════════════════════════════════════════════════════
   INTEGRATSIYALAR — bitta so'rovda hamma ulanishning holati

   NEGA BITTA ENDPOINT. Sozlamalar sahifasi endi kartalar to'ri: har
   kartada "ulangan / ulanmagan" belgisi turadi va shundagina to'r
   ma'noga ega bo'ladi — aks holda odam har bittasini ochib ko'rishi
   kerak, ya'ni to'r hech narsani tejamaydi.

   Har karta o'z holatini o'zi so'rasa — sahifa ochilishida 7 ta
   parallel so'rov. Bu yerda esa bitta SQL.

   ⚠ TASHQI SO'ROV YO'Q. Hamma javob BAZADAN o'qiladi. Webhook holatini
   bilish uchun amoCRM'ga murojaat qilish kerak, Telegram webhook uchun
   esa Telegram'ga — ikkalasi ham sekin va rate limit yeydi. Shuning
   uchun ular bu yerda 'nomalum' bo'lib qaytadi va faqat karta ochilganda
   aniqlanadi.

   Qoida: to'rdagi belgi TEZ va TAXMINSIZ bo'lsin. Bilmasak "nomalum"
   deymiz — "ulangan" deb yozib qo'yish eng yomon variant.
   ═══════════════════════════════════════════════════════════════════════ */

import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { botTokenBor } from '../services/telegram';

/**
 * ⚠ TO'RTTA HOLAT, ATAYLAB.
 *
 *   ok       — ishlayapti, bazadan tasdiqlangan
 *   ogoh     — ulangan, LEKIN yarim: natija bermaydi yoki noto'g'ri
 *              beradi. Bu "ulangan" emas va "ulanmagan" ham emas —
 *              aynan shu holat yashirilsa jim buziladi.
 *   yoq      — ulanmagan, aniq bilamiz
 *   nomalum  — BILMAYMIZ. Aniqlash uchun tashqi so'rov kerak.
 *
 * Birinchi versiyada `nomalum` ekranda "Sozlanmagan" deb chiqardi va
 * ishlab turgan webhook "sozlanmagan" bo'lib ko'rindi. Bilmagan narsani
 * yo'q deb da'vo qilish — noto'g'ri raqam ko'rsatish bilan bir xil xato.
 */
export type Holat = 'ok' | 'ogoh' | 'yoq' | 'nomalum';

export interface IntegratsiyaHolat {
  holat: Holat;
  /** Kartada belgi ostida turadigan bir qator. */
  izoh: string | null;
}

interface Qator {
  fb_ad_account_id: string | null;
  fb_access_token: string | null;
  amocrm_domain: string | null;
  amocrm_access_token: string | null;
  amocrm_won_pairs: string[] | null;
  fb_lead_token: string | null;
  meta_capi_enabled: boolean | null;
  meta_dataset_id: string | null;
  telegram_chatlar: string;
  telegram_faol: string;
  oxirgi_webhook: string | null;
}

/**
 * WEBHOOK HOLATI — endi TAXMIN EMAS, FAKT.
 *
 * Ilgari bu yerda `'nomalum'` turardi: "amoCRM'ga so'rov kerak, karta
 * ochilganda aniqlanadi". Bu to'g'ri edi — obunani bilish uchun
 * haqiqatan tashqi so'rov kerak. Lekin obuna bor-yo'qligi **eng
 * muhim savol emas**: muhimi signal KELAYAPTIMI.
 *
 * Migratsiya 040 dan keyin buni bazadan bilamiz — tashqi so'rovsiz.
 *
 * ⚠ 7 KUN — chegara, hukm emas. Kam lidli akkauntda bir hafta jimlik
 * normal bo'lishi mumkin, shuning uchun matn FAKT aytadi ("N kun
 * oldin"), "buzilgan" demaydi. Qaror odamniki.
 */
function webhookHolati(amoUlangan: boolean, oxirgi: string | null): IntegratsiyaHolat {
  if (!amoUlangan) return { holat: 'yoq', izoh: 'Avval amoCRM ulansin' };
  if (!oxirgi) {
    return { holat: 'ogoh', izoh: 'Hali birorta signal kelmagan' };
  }
  const kun = Math.floor((Date.now() - new Date(oxirgi).getTime()) / 86_400_000);
  if (kun >= 7) {
    return { holat: 'ogoh', izoh: `Oxirgi signal ${kun} kun oldin` };
  }
  if (kun >= 1) return { holat: 'ok', izoh: `Oxirgi signal ${kun} kun oldin` };
  const soat = Math.floor((Date.now() - new Date(oxirgi).getTime()) / 3_600_000);
  return {
    holat: 'ok',
    izoh: soat >= 1 ? `Oxirgi signal ${soat} soat oldin` : 'Signal hozirgina keldi',
  };
}

export async function holatlar(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { rows } = await pool.query<Qator>(
    `SELECT w.fb_ad_account_id,
            u.fb_access_token,
            w.amocrm_domain,
            w.amocrm_access_token,
            w.amocrm_won_pairs,
            w.fb_lead_token,
            w.meta_capi_enabled,
            w.meta_dataset_id,
            w.oxirgi_webhook::text AS oxirgi_webhook,
            (SELECT COUNT(*) FROM telegram_chats t
              WHERE t.workspace_id = w.id)                    AS telegram_chatlar,
            (SELECT COUNT(*) FROM telegram_chats t
              WHERE t.workspace_id = w.id AND t.faol)         AS telegram_faol
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
      WHERE w.id = $1`,
    [workspaceId]
  );

  const w = rows[0];
  if (!w) {
    res.status(404).json({ error: 'Workspace topilmadi' });
    return;
  }

  const tgFaol = Number(w.telegram_faol ?? 0);
  const tgJami = Number(w.telegram_chatlar ?? 0);

  /* amoCRM "ulangan" degani hali "ishlayapti" degani emas: sotuv
     juftliklari sozlanmagan bo'lsa daromad NOLGA teng bo'lib qoladi va
     buni hech qayerda xato chiqmaydi. Shuning uchun alohida ogohlantirish. */
  const amoUlangan = Boolean(w.amocrm_domain && w.amocrm_access_token);
  const juftlikBor = (w.amocrm_won_pairs ?? []).length > 0;

  const javob: Record<string, IntegratsiyaHolat> = {
    facebook: {
      holat: w.fb_access_token && w.fb_ad_account_id ? 'ok' : 'yoq',
      izoh: w.fb_ad_account_id
        ? `Akkaunt ${w.fb_ad_account_id}`
        : w.fb_access_token
          ? 'Reklama akkaunti tanlanmagan'
          : null,
    },
    amocrm: {
      /* Juftliksiz amoCRM ulangan, lekin daromad 0 bo'lib qoladi —
         "ulangan" deyish yolg'on, "ulanmagan" deyish ham. */
      holat: amoUlangan ? (juftlikBor ? 'ok' : 'ogoh') : 'yoq',
      izoh: amoUlangan
        ? juftlikBor
          ? w.amocrm_domain
          : "Sotuv etaplari belgilanmagan — daromad 0 ko'rinadi"
        : null,
    },
    webhook: webhookHolati(amoUlangan, w.oxirgi_webhook),
    leadAds: {
      holat: w.fb_lead_token ? 'ok' : 'yoq',
      izoh: w.fb_lead_token ? 'System User tokeni saqlangan' : 'Token kiritilmagan',
    },
    capi: {
      holat: w.meta_capi_enabled && w.meta_dataset_id ? 'ok' : 'yoq',
      izoh: w.meta_dataset_id ? `Dataset ${w.meta_dataset_id}` : null,
    },
    telegram: {
      /* Bot bor, lekin chat yo'q — xabar hech qayerga bormaydi. */
      holat: !botTokenBor() ? 'yoq' : tgFaol > 0 ? 'ok' : 'ogoh',
      izoh: !botTokenBor()
        ? 'Bot sozlanmagan'
        : tgFaol > 0
          ? `${tgFaol} ta chat${tgJami > tgFaol ? ` (${tgJami - tgFaol} to'xtatilgan)` : ''}`
          : 'Chat ulanmagan',
    },
    pixel: {
      // Piksel kodi har doim mavjud — "ulanish" tushunchasi yo'q.
      holat: 'nomalum',
      izoh: 'Kodni saytga joylang',
    },
  };

  res.json(javob);
}
