/* ═══════════════════════════════════════════════════════════════
   amoCRM maydonlarini TANIB OLISH — har qanday akkaunt uchun.

   NEGA KERAK: Meta CAPI ga eng kuchli moslik kaliti — Meta Lead ID
   (15–17 xonali son). U amoCRM da maxsus maydonda turadi, lekin
   maydon nomi har akkauntda boshqacha: "Facebook Lead ID", "lead_id",
   "Идентификатор лида", yoki umuman o'zbekcha nom. Nomga tayanadigan
   kod birinchi yangi mijozda sinadi.

   SHUNING UCHUN NOMGA EMAS, SHAKLGA QARAYMIZ: real lidlardan namuna
   olamiz va har maydonda qiymatlar Meta Lead ID SHAKLIDA (15–17 xonali
   toza son) ekanini sanaymiz. Bu til va nomdan mustaqil.

   Chegaralarni ham ataylab tanladik:
     - telefon 998XXXXXXXXX = 12 xona  → tushmaydi
     - unix vaqt              = 10 xona → tushmaydi
     - summa                  = odatda < 12 xona → tushmaydi
     - amoCRM lid ID si       = 7–9 xona → tushmaydi

   ⚠ Kod HECH QACHON o'zi tanlamaydi (§3.5). U nomzodlarni tartiblab
   ko'rsatadi, tanlovni odam qiladi va tanlov konfiguratsiyaga yoziladi.

   FAQAT O'QISH: bu fayldagi hamma so'rov GET (§4.3).
   ═══════════════════════════════════════════════════════════════ */

import { amoGetPath } from './amocrmService';
import { extractUtm, type AmoFieldValue } from './leadMatcher';

/** Meta Lead ID shakli: 15–17 xonali toza son. */
const META_LEAD_ID = /^\d{15,17}$/;

/** Namuna uchun olinadigan lidlar soni (bitta sahifa = bitta so'rov). */
const NAMUNA_LID = 250;

/** Nomzod deb hisoblash uchun eng kam moslik ulushi. */
const ENG_KAM_ULUSH = 0.8;

interface AmoMaydonTarifi {
  id?: number;
  name?: string;
  code?: string | null;
  type?: string | null;
}

/**
 * amoCRM maxsus maydon qiymati. Tip `leadMatcher` dan olinadi — bir xil
 * ma'lumot ikki joyda ikki xil tip bilan yurmasligi uchun.
 */
type AmoMaydonQiymati = AmoFieldValue;

interface AmoLid {
  id: number;
  custom_fields_values?: AmoMaydonQiymati[] | null;
}

export interface MaydonHisoboti {
  /** amoCRM field_id — konfiguratsiyaga aynan shu yoziladi. */
  field_id: string;
  field_name: string;
  field_code: string | null;
  field_type: string | null;
  /** Namunadagi nechta lidda bu maydon to'ldirilgan. */
  toldirilgan: number;
  /** Shulardan nechtasi Meta Lead ID shaklida. */
  metaShaklida: number;
  /** 0–100. `toldirilgan` nolga teng bo'lsa 0. */
  ishonch: number;
  /** Ikkita misol — tanlaganda odam ko'rib tasdiqlashi uchun. */
  namunalar: string[];
}

export interface MaydonTahlili {
  /** Namunaga nechta lid tushdi. Nol bo'lsa xulosa chiqarib bo'lmaydi. */
  tekshirilganLid: number;
  /** Meta Lead ID ni saqlayotgan bo'lishi mumkin bo'lgan maydonlar. */
  nomzodlar: MaydonHisoboti[];
  /** Barcha maydonlar — nomzod topilmasa odam o'zi qarab tanlashi uchun. */
  maydonlar: MaydonHisoboti[];
  /**
   * Atribusiya diagnostikasi: namunadagi nechta lidda UTM / fbclid bor.
   * "Nega hech narsa bog'lanmayapti" savoliga raqam bilan javob.
   */
  atribusiya: {
    utm_term: number;
    utm_campaign: number;
    utm_content: number;
    utm_source: number;
    fbclid: number;
  };
}

function matn(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Maydon ta'riflari — to'ldirilmagan maydonlar ham ro'yxatda tursin. */
async function maydonTariflari(workspaceId: string): Promise<Map<string, AmoMaydonTarifi>> {
  const xarita = new Map<string, AmoMaydonTarifi>();
  try {
    const javob = await amoGetPath<{ _embedded?: { custom_fields?: AmoMaydonTarifi[] } }>(
      workspaceId,
      '/api/v4/leads/custom_fields?limit=250'
    );
    for (const f of javob._embedded?.custom_fields ?? []) {
      if (f.id !== undefined) xarita.set(String(f.id), f);
    }
  } catch {
    // Ta'riflar bo'lmasa ham tahlil ishlaydi — nom lid ichidan olinadi.
  }
  return xarita;
}

/**
 * Akkauntning maydonlarini tahlil qiladi va Meta Lead ID nomzodlarini
 * qaytaradi. Hech narsani o'zgartirmaydi, hech narsa tanlamaydi.
 */
export async function discoverLeadFields(workspaceId: string): Promise<MaydonTahlili> {
  const tariflar = await maydonTariflari(workspaceId);

  // Eng yangi lidlar — eski akkauntda arxiv emas, hozirgi holat kerak.
  const javob = await amoGetPath<{ _embedded?: { leads?: AmoLid[] } }>(
    workspaceId,
    `/api/v4/leads?limit=${NAMUNA_LID}&order[created_at]=desc`
  );
  const lidlar = javob._embedded?.leads ?? [];

  const hisob = new Map<string, MaydonHisoboti>();
  const atribusiya = {
    utm_term: 0,
    utm_campaign: 0,
    utm_content: 0,
    utm_source: 0,
    fbclid: 0,
  };

  for (const lid of lidlar) {
    const maydonlar = lid.custom_fields_values ?? [];

    const utm = extractUtm(maydonlar);
    if (utm.utm_term) atribusiya.utm_term += 1;
    if (utm.utm_campaign) atribusiya.utm_campaign += 1;
    if (utm.utm_content) atribusiya.utm_content += 1;
    if (utm.utm_source) atribusiya.utm_source += 1;
    if (utm.fbclid) atribusiya.fbclid += 1;

    for (const f of maydonlar) {
      if (f.field_id === undefined) continue;
      const id = String(f.field_id);
      const qiymat = matn(f.values?.[0]?.value);
      if (!qiymat) continue;

      let qator = hisob.get(id);
      if (!qator) {
        const tarif = tariflar.get(id);
        qator = {
          field_id: id,
          field_name: f.field_name ?? tarif?.name ?? `#${id}`,
          field_code: f.field_code ?? tarif?.code ?? null,
          field_type: tarif?.type ?? null,
          toldirilgan: 0,
          metaShaklida: 0,
          ishonch: 0,
          namunalar: [],
        };
        hisob.set(id, qator);
      }

      qator.toldirilgan += 1;
      if (META_LEAD_ID.test(qiymat)) {
        qator.metaShaklida += 1;
        if (qator.namunalar.length < 2) qator.namunalar.push(qiymat);
      }
    }
  }

  // To'ldirilmagan maydonlar ham ko'rinsin — nomzod topilmaganda odam
  // ro'yxatdan o'zi tanlashi kerak bo'lishi mumkin.
  for (const [id, tarif] of tariflar) {
    if (hisob.has(id)) continue;
    hisob.set(id, {
      field_id: id,
      field_name: tarif.name ?? `#${id}`,
      field_code: tarif.code ?? null,
      field_type: tarif.type ?? null,
      toldirilgan: 0,
      metaShaklida: 0,
      ishonch: 0,
      namunalar: [],
    });
  }

  const maydonlar = [...hisob.values()].map((m) => ({
    ...m,
    ishonch: m.toldirilgan > 0 ? Math.round((m.metaShaklida / m.toldirilgan) * 100) : 0,
  }));

  maydonlar.sort((a, b) => b.metaShaklida - a.metaShaklida || b.toldirilgan - a.toldirilgan);

  const nomzodlar = maydonlar.filter(
    (m) => m.toldirilgan > 0 && m.metaShaklida / m.toldirilgan >= ENG_KAM_ULUSH
  );

  return { tekshirilganLid: lidlar.length, nomzodlar, maydonlar, atribusiya };
}

/**
 * Sozlangan maydondan Meta Lead ID ni oladi.
 *
 * `fieldId` null bo'lsa — sozlanmagan, null qaytadi (xato emas).
 * Qiymat shaklga mos kelmasa ham null: noto'g'ri ID yuborilgandan
 * ko'ra yubormaslik ma'qul, aks holda Meta hodisani boshqa odamga
 * bog'lab qo'yishi mumkin.
 */
export function extractLeadId(
  fields: AmoMaydonQiymati[] | null | undefined,
  fieldId: string | null
): string | null {
  if (!fields || !fieldId) return null;
  for (const f of fields) {
    if (f.field_id === undefined || String(f.field_id) !== fieldId) continue;
    const qiymat = matn(f.values?.[0]?.value);
    return META_LEAD_ID.test(qiymat) ? qiymat : null;
  }
  return null;
}

/** Test va diagnostika uchun ochiq. */
export const METR = { META_LEAD_ID, NAMUNA_LID, ENG_KAM_ULUSH };
