/* ═══════════════════════════════════════════════════════════════════════
   INSTANT FORM → REKLAMA (B yo'li)

   MUAMMO: FurniGlass lidlari Instant Form orqali keladi. Landing sahifa
   yo'q, shuning uchun UTM ham, fbclid ham, piksel ham yo'q — tashxis buni
   raqam bilan ko'rsatdi (hamma kalit 0%).

   G'OYA: har Instant Form ma'lum reklamalarga biriktirilgan. Agar forma
   FAQAT BITTA reklamada ishlatilsa, o'sha formadan kelgan lid aynan o'sha
   reklamaniki. Bu bizdagi `ads_read` ruxsati bilan ishlaydi — `lead_id`
   dan `ad_id` ga o'tish uchun kerak bo'lgan `ads_management` shart emas.

   ⚠ BU TAJRIBA, YECHIM EMAS. Ikki noma'lum bor va ikkalasi ham shu
   funksiyada TEKSHIRILADI, taxmin qilinmaydi (§3.5):

     1. `object_story_spec` ni `ads_read` bilan o'qib bo'ladimi?
        Kodda allaqachon yozilgan: bu maydon ads_read bilan tez-tez
        HTTP 500 beradi va aynan shuning uchun sync'dan olib tashlangan.
        Endi qayta urinish qo'shildi (code 2 / 5xx), shuning uchun qayta
        sinab ko'rishga arziydi.

     2. Forma ID qayerda turadi? Meta uni bir necha joyda saqlaydi
        (link_data, video_data, asset_feed_spec). Shuning uchun maydon
        yo'li TAXMIN QILINMAYDI — javob REKURSIV qidiriladi.

   FAQAT O'QIYDI (§4.3).
   ═══════════════════════════════════════════════════════════════════════ */

import { pool } from '../db/pool';
import { decrypt } from '../utils/encryption';
import { fetchAll, normalizeActId } from './facebookAdsService';
import { discoverLeadFields } from './amocrmFields';

/** Necha reklamani tekshiramiz. Tajriba — butun akkaunt shart emas. */
const NAMUNA = 300;

/**
 * Javobning ichidan forma ID'sini REKURSIV qidiradi.
 *
 * Nega yo'l bo'yicha emas: `object_story_spec.link_data.call_to_action
 * .value.lead_gen_form_id` — bu faqat BIR turdagi kreativ uchun. Video,
 * karusel va asset_feed'da yo'l boshqa. Yo'lni qotirib yozsak, ishlamagan
 * holatni "forma yo'q" deb xato xulosa qilardik.
 *
 * Kalit nomi bo'yicha qidirish bu xatoni yo'q qiladi: Meta qaysi joyga
 * qo'ysa ham topiladi.
 */
export function formIdlarniTop(obj: unknown, chiqish = new Set<string>()): Set<string> {
  if (obj === null || obj === undefined) return chiqish;

  if (Array.isArray(obj)) {
    for (const el of obj) formIdlarniTop(el, chiqish);
    return chiqish;
  }

  if (typeof obj !== 'object') return chiqish;

  for (const [kalit, qiymat] of Object.entries(obj as Record<string, unknown>)) {
    const k = kalit.toLowerCase();
    // `lead_gen_form_id`, `leadgen_form_id`, `form_id`, `lead_gen_form`
    if (/lead_?gen_?form(_id)?$/.test(k) || k === 'form_id') {
      if (typeof qiymat === 'string' && /^\d{6,}$/.test(qiymat)) chiqish.add(qiymat);
      else if (typeof qiymat === 'number') chiqish.add(String(qiymat));
      else formIdlarniTop(qiymat, chiqish);
      continue;
    }
    formIdlarniTop(qiymat, chiqish);
  }
  return chiqish;
}

/**
 * Teg matnidan forma ID'ga o'xshash raqamni ajratadi.
 *
 * NEGA KERAK: amoCRM teglari toza raqam emas — integratsiya prefiks qo'shadi:
 *
 *     FB tomonda:  1394587378208816
 *     CRM tegida:  fb1394587378208816      ← "fb" prefiks
 *
 * Birinchi versiya teglarni to'g'ridan-to'g'ri solishtirdi va `kesishma: 0`
 * qaytardi — "CRM tomonida kalit yo'q" degan XATO xulosa. Aslida 8 tadan
 * 7 tasi mos kelardi. Bu mening xatom edi, ma'lumotniki emas.
 *
 * Shuning uchun ikkala tomon ham raqamga keltiriladi: tegdagi eng uzun
 * raqamlar ketma-ketligi olinadi va faqat u solishtiriladi.
 *
 * `null` — tegda forma ID bo'la oladigan raqam yo'q (6+ xona).
 */
export function tegdanRaqam(matn: string): string | null {
  const parchalar = matn.match(/\d{6,}/g);
  if (!parchalar || parchalar.length === 0) return null;
  // Eng uzuni — forma ID 15–17 xonali, qolgan raqamlar (sana, versiya) qisqa.
  return parchalar.reduce((a, b) => (b.length > a.length ? b : a));
}

export interface FormNatija {
  /** `object_story_spec` o'qildimi. false bo'lsa B yo'li shu ruxsat bilan yopiq. */
  oqildi: boolean;
  /** O'qilmasa — Facebook'ning aniq xatosi (token maskalanadi). */
  xato: string | null;
  tekshirilgan_reklama: number;
  formali_reklama: number;
  formalar: number;
  /** Faqat bitta reklamada ishlatilgan formalar — ANIQ atribusiya beradi. */
  yagona_formalar: number;
  /** Bir nechta reklamada ishlatilgan — atribusiya ambiguous bo'ladi. */
  ulashilgan_formalar: Array<{ form_id: string; reklamalar: number }>;
  /** Qamrov: formasi aniq bitta reklamaga tushadigan reklamalar ulushi. */
  aniq_qamrov_foiz: number;
  /** Solishtirish uchun: topilgan forma ID'laridan namuna. */
  namuna_form_idlar: string[];
  /** Hech narsa topilmasa — javob qanday ko'ringani (tashxis uchun). */
  namuna_kalitlar: string[];

  /**
   * Har forma nechta KAMPANIYA va AD SET ga yoyilgan.
   *
   * NEGA MUHIM: forma 18 ta reklamada bo'lsa reklama darajasida atribusiya
   * yo'q. LEKIN agar o'sha 18 ta reklama BITTA kampaniyada bo'lsa, forma
   * kampaniya darajasida ANIQ javob beradi — "qaysi kampaniya pul keltirdi"
   * degan savol esa byudjet qarori uchun aynan yetarli.
   *
   * Reklama darajasi ideal, kampaniya darajasi foydali, noldan yaxshi.
   */
  kampaniya_darajasi: {
    formalar_bitta_kampaniyada: number;
    formalar_bitta_adsetda: number;
    tafsilot: Array<{ form_id: string; reklamalar: number; kampaniyalar: number; adsetlar: number }>;
  };

  /**
   * ⚠ HAL QILUVCHI TEKSHIRUV: CRM tomonida forma ID bormi?
   *
   * Xarita qanchalik toza bo'lmasin, agar amoCRM lidida forma ID yo'q
   * bo'lsa — bog'lash uchun kalit yo'q va B yo'li o'lik. Shuning uchun
   * FB dan topilgan forma ID'lari amoCRM teglaridagi qiymatlar bilan
   * SOLISHTIRILADI. Taxmin emas — kesishma sanaladi.
   */
  crm_tekshiruv: {
    /** CRM dan olingan teg matnlari soni (xom). */
    crm_teg_qiymatlari: number;
    /** Ulardan forma ID bo'la oladigan raqam ajratilganlari. */
    raqamli_teglar: number;
    kesishma: number;
    kesishgan_idlar: string[];
    /** "fb1394587378208816 → 1394587378208816" ko'rinishida namuna. */
    namuna_teglar: string[];
    xulosa: string;
  };
}

interface AdCreative {
  id: string;
  creative?: Record<string, unknown>;
}

/**
 * Akkauntdagi reklamalarni o'qib, forma → reklama xaritasini quradi.
 *
 * Hech narsa yozmaydi. Natija faqat qaytariladi — qaror odamniki.
 */
export async function formlarniKashfEt(
  workspaceId: string,
  namunaSoni = NAMUNA
): Promise<FormNatija> {
  const wsRes = await pool.query<{
    fb_ad_account_id: string | null;
    fb_access_token: string | null;
  }>(
    `SELECT w.fb_ad_account_id, u.fb_access_token
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

  const bosh: FormNatija = {
    oqildi: false,
    xato: null,
    tekshirilgan_reklama: 0,
    formali_reklama: 0,
    formalar: 0,
    yagona_formalar: 0,
    ulashilgan_formalar: [],
    aniq_qamrov_foiz: 0,
    namuna_form_idlar: [],
    namuna_kalitlar: [],
    kampaniya_darajasi: {
      formalar_bitta_kampaniyada: 0,
      formalar_bitta_adsetda: 0,
      tafsilot: [],
    },
    crm_tekshiruv: {
      crm_teg_qiymatlari: 0,
      raqamli_teglar: 0,
      kesishma: 0,
      kesishgan_idlar: [],
      namuna_teglar: [],
      xulosa: 'tekshirilmadi',
    },
  };

  let adlar: AdCreative[];
  try {
    adlar = await fetchAll<AdCreative>(
      `${actId}/ads`,
      {
        // `object_story_spec` — asosiy nomzod. `asset_feed_spec` —
        // Advantage+ kreativlari uchun. Ikkalasi ham so'raladi, chunki
        // qaysi biri to'lishi kreativ turiga bog'liq.
        fields: 'id,creative{id,object_story_spec,asset_feed_spec,object_type}',
        limit: 50,
      },
      token,
      namunaSoni
    );
  } catch (e) {
    // Ruxsat yetmasa yoki FB 500 bersa — bu ham NATIJA. "Ishlamadi" deb
    // jim qaytarish emas, sababini ko'rsatish kerak.
    bosh.xato = (e as Error).message;
    return bosh;
  }

  bosh.oqildi = true;
  const namuna = adlar.slice(0, namunaSoni);
  bosh.tekshirilgan_reklama = namuna.length;

  /** form_id → shu formani ishlatgan reklamalar */
  const xarita = new Map<string, Set<string>>();
  const kalitlar = new Set<string>();

  for (const ad of namuna) {
    if (!ad.creative) continue;
    // Javob shakli noma'lum bo'lsa ham tashxis qo'ya olish uchun:
    // birinchi bir nechta kreativning yuqori darajadagi kalitlarini yig'amiz.
    if (kalitlar.size < 30) {
      for (const k of Object.keys(ad.creative)) kalitlar.add(k);
      const oss = ad.creative.object_story_spec;
      if (oss && typeof oss === 'object') {
        for (const k of Object.keys(oss as object)) kalitlar.add(`object_story_spec.${k}`);
      }
    }

    const idlar = formIdlarniTop(ad.creative);
    if (idlar.size === 0) continue;
    bosh.formali_reklama += 1;
    for (const f of idlar) {
      const toplam = xarita.get(f);
      if (toplam) toplam.add(ad.id);
      else xarita.set(f, new Set([ad.id]));
    }
  }

  bosh.formalar = xarita.size;
  bosh.namuna_kalitlar = [...kalitlar].sort();
  bosh.namuna_form_idlar = [...xarita.keys()].slice(0, 20);

  let aniqReklama = 0;
  for (const [formId, adSet] of xarita) {
    if (adSet.size === 1) {
      bosh.yagona_formalar += 1;
      aniqReklama += 1;
    } else {
      bosh.ulashilgan_formalar.push({ form_id: formId, reklamalar: adSet.size });
    }
  }
  bosh.ulashilgan_formalar.sort((a, b) => b.reklamalar - a.reklamalar);
  bosh.ulashilgan_formalar = bosh.ulashilgan_formalar.slice(0, 20);

  bosh.aniq_qamrov_foiz =
    bosh.tekshirilgan_reklama > 0
      ? Math.round((aniqReklama / bosh.tekshirilgan_reklama) * 1000) / 10
      : 0;

  /* ── Kampaniya darajasi: forma nechta kampaniyaga yoyilgan ──────────
     Kampaniya/ad set bog'lanishi O'Z BAZAMIZDAN olinadi — Facebook'ga
     qo'shimcha so'rov yubormaymiz (limit tor). */
  const hammaAdIdlar = [...new Set([...xarita.values()].flatMap((s2) => [...s2]))];
  if (hammaAdIdlar.length > 0) {
    const { rows: adRows } = await pool.query<{
      fb_ad_id: string;
      campaign_fb_id: string | null;
      adset_fb_id: string | null;
    }>(
      `SELECT a.fb_ad_id,
              c.fb_campaign_id AS campaign_fb_id,
              s.fb_adset_id    AS adset_fb_id
         FROM ads a
         LEFT JOIN campaigns c ON c.id = a.campaign_id
         LEFT JOIN adsets    s ON s.id = a.adset_id
        WHERE a.workspace_id = $1 AND a.fb_ad_id = ANY($2::text[])`,
      [workspaceId, hammaAdIdlar]
    );
    const adKampaniya = new Map(adRows.map((r) => [r.fb_ad_id, r]));

    for (const [formId, adSet] of xarita) {
      const kamp = new Set<string>();
      const adset = new Set<string>();
      for (const adId of adSet) {
        const r = adKampaniya.get(adId);
        if (r?.campaign_fb_id) kamp.add(r.campaign_fb_id);
        if (r?.adset_fb_id) adset.add(r.adset_fb_id);
      }
      if (kamp.size === 1) bosh.kampaniya_darajasi.formalar_bitta_kampaniyada += 1;
      if (adset.size === 1) bosh.kampaniya_darajasi.formalar_bitta_adsetda += 1;
      bosh.kampaniya_darajasi.tafsilot.push({
        form_id: formId,
        reklamalar: adSet.size,
        kampaniyalar: kamp.size,
        adsetlar: adset.size,
      });
    }
    bosh.kampaniya_darajasi.tafsilot.sort((a, b) => b.reklamalar - a.reklamalar);
  }

  /* ── HAL QILUVCHI: CRM tomonida shu forma ID'lari bormi ─────────────── */
  try {
    const crm = await discoverLeadFields(workspaceId);
    const tegMatnlari = crm.tegMatnlari ?? [];

    // Teg → raqam. Prefiksli ("fb139…") va toza ("139…") teg bir xil
    // raqamga tushadi, shuning uchun solishtirish prefiksdan mustaqil.
    const tegRaqamlar = new Map<string, string>(); // raqam → asl teg
    for (const t of tegMatnlari) {
      const r = tegdanRaqam(t);
      if (r) tegRaqamlar.set(r, t);
    }

    bosh.crm_tekshiruv.crm_teg_qiymatlari = tegMatnlari.length;
    bosh.crm_tekshiruv.raqamli_teglar = tegRaqamlar.size;

    const kesishgan = [...xarita.keys()].filter((f) => tegRaqamlar.has(f));
    bosh.crm_tekshiruv.kesishma = kesishgan.length;
    bosh.crm_tekshiruv.kesishgan_idlar = kesishgan.slice(0, 20);
    bosh.crm_tekshiruv.namuna_teglar = [...tegRaqamlar.entries()]
      .slice(0, 10)
      .map(([raqam, teg]) => (raqam === teg ? teg : `${teg} → ${raqam}`));

    const foiz =
      tegRaqamlar.size > 0 ? Math.round((kesishgan.length / tegRaqamlar.size) * 1000) / 10 : 0;
    bosh.crm_tekshiruv.xulosa =
      kesishgan.length > 0
        ? `CRM teglarida ${kesishgan.length} / ${tegRaqamlar.size} ta forma ID mos keldi (${foiz}%) — B yo'li uchun kalit BOR`
        : "CRM teglarida birorta forma ID topilmadi — B yo'li uchun CRM tomonida kalit YO'Q";
  } catch (e) {
    bosh.crm_tekshiruv.xulosa = `CRM tekshiruvi bajarilmadi: ${(e as Error).message}`;
  }

  return bosh;
}
