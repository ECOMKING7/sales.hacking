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

   ⚠ NAMUNA HAR VORONKADAN ALOHIDA OLINADI. Birinchi versiyada
   "oxirgi 250 lid" olinardi va bu XATO xulosa berdi: hajmi katta
   voronka (qo'ng'iroq) namunani to'ldirib, lid formasidan kelgan
   lidlar umuman ko'rinmay qoldi. Voronkalar bir-biriga o'xshamaydi —
   biri formadan, biri telefoniyadan to'ladi — shuning uchun ularni
   birga o'rtachalash xulosani buzadi.

   Meta Lead ID faqat maxsus maydonda bo'lishi shart emas: ba'zi
   integratsiyalar uni lid NOMIGA yoki KONTAKT maydoniga yozadi.
   Uchalasi ham tekshiriladi.

   ⚠ Kod HECH QACHON o'zi tanlamaydi (§3.5). U nomzodlarni tartiblab
   ko'rsatadi, tanlovni odam qiladi va tanlov konfiguratsiyaga yoziladi.

   FAQAT O'QISH: bu fayldagi hamma so'rov GET (§4.3).
   ═══════════════════════════════════════════════════════════════ */

import { amoGetPath, getPipelines } from './amocrmService';
import { extractUtm, type AmoFieldValue } from './leadMatcher';

/** Meta Lead ID shakli: 15–17 xonali toza son. */
const META_LEAD_ID = /^\d{15,17}$/;
/** Matn ichidan qidirish uchun (lid nomi: "Заявка #1234567890123456"). */
const MATNDA_LEAD_ID = /(?<!\d)\d{15,17}(?!\d)/;

/** Har voronkadan olinadigan lidlar soni. */
const VORONKADAN = 100;
/** Ko'pi bilan shuncha voronka tekshiriladi — so'rovlar cheklangan. */
const MAX_VORONKA = 8;
/** Kontakt maydonlarini tekshirish uchun nechta kontakt olinadi. */
const KONTAKT_NAMUNA = 50;
/** Nomzod deb hisoblash uchun eng kam moslik ulushi. */
const ENG_KAM_ULUSH = 0.8;

interface AmoMaydonTarifi {
  id?: number;
  name?: string;
  code?: string | null;
  type?: string | null;
}

/** amoCRM maxsus maydon qiymati — tip `leadMatcher` dan, ikki nusxa bo'lmasin. */
type AmoMaydonQiymati = AmoFieldValue;

interface AmoLid {
  id: number;
  name?: string;
  /** 0 — integratsiya/API yaratgan; >0 — foydalanuvchi qo'lda yaratgan. */
  created_by?: number;
  pipeline_id?: number;
  custom_fields_values?: AmoMaydonQiymati[] | null;
  _embedded?: { contacts?: Array<{ id: number }>; tags?: Array<{ name?: string }> };
}

interface AmoKontakt {
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

export interface VoronkaHisoboti {
  id: string;
  nom: string;
  /** Namunaga tushgan lidlar soni. */
  jami: number;
  /** Shulardan nechtasi integratsiya tomonidan yaratilgan (created_by = 0). */
  avtomatik: number;
  /** Atribusiya kalitlari shu voronkada nechta lidda bor. */
  utm_term: number;
  utm_campaign: number;
  fbclid: number;
  /** Meta Lead ID shakliga mos qiymat topilgan lidlar soni (maydon/nom/kontakt). */
  leadIdTopildi: number;
}

export interface MaydonTahlili {
  /** Namunaga jami nechta lid tushdi. */
  tekshirilganLid: number;
  /** Har voronka alohida — o'rtachalash xulosani buzadi. */
  voronkalar: VoronkaHisoboti[];
  /** Meta Lead ID ni saqlayotgan bo'lishi mumkin bo'lgan LID maydonlari. */
  nomzodlar: MaydonHisoboti[];
  /** Barcha lid maydonlari — nomzod topilmasa odam o'zi qarab tanlashi uchun. */
  maydonlar: MaydonHisoboti[];
  /** Kontakt maydonlaridagi nomzodlar (integratsiya u yerga yozgan bo'lishi mumkin). */
  kontaktNomzodlari: MaydonHisoboti[];
  /** Lid NOMIDA 15–17 xonali son uchragan lidlar soni. */
  nomdaTopildi: number;
  /** Teglar ichida uchragan lidlar soni. */
  tegdaTopildi: number;
  /** Jami bo'yicha atribusiya kalitlari (voronkalar yig'indisi). */
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
async function maydonTariflari(
  workspaceId: string,
  yol: string
): Promise<Map<string, AmoMaydonTarifi>> {
  const xarita = new Map<string, AmoMaydonTarifi>();
  try {
    const javob = await amoGetPath<{ _embedded?: { custom_fields?: AmoMaydonTarifi[] } }>(
      workspaceId,
      `${yol}?limit=250`
    );
    for (const f of javob._embedded?.custom_fields ?? []) {
      if (f.id !== undefined) xarita.set(String(f.id), f);
    }
  } catch {
    // Ta'riflar bo'lmasa ham tahlil ishlaydi — nom lid ichidan olinadi.
  }
  return xarita;
}

/** Maydon qiymatlarini bitta hisoblagichga qo'shadi. */
function maydonlarniSana(
  hisob: Map<string, MaydonHisoboti>,
  tariflar: Map<string, AmoMaydonTarifi>,
  maydonlar: AmoMaydonQiymati[]
): boolean {
  let topildi = false;
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
      topildi = true;
      if (qator.namunalar.length < 2) qator.namunalar.push(qiymat);
    }
  }
  return topildi;
}

function ishonchBilan(hisob: Map<string, MaydonHisoboti>): MaydonHisoboti[] {
  const royxat = [...hisob.values()].map((m) => ({
    ...m,
    ishonch: m.toldirilgan > 0 ? Math.round((m.metaShaklida / m.toldirilgan) * 100) : 0,
  }));
  royxat.sort((a, b) => b.metaShaklida - a.metaShaklida || b.toldirilgan - a.toldirilgan);
  return royxat;
}

function nomzodlarni(royxat: MaydonHisoboti[]): MaydonHisoboti[] {
  return royxat.filter((m) => m.toldirilgan > 0 && m.metaShaklida / m.toldirilgan >= ENG_KAM_ULUSH);
}

/**
 * Akkauntning maydonlarini tahlil qiladi va Meta Lead ID nomzodlarini
 * qaytaradi. Hech narsani o'zgartirmaydi, hech narsa tanlamaydi.
 */
export async function discoverLeadFields(workspaceId: string): Promise<MaydonTahlili> {
  const lidTariflari = await maydonTariflari(workspaceId, '/api/v4/leads/custom_fields');

  let voronkalar: Array<{ id: number; name: string }> = [];
  try {
    voronkalar = (await getPipelines(workspaceId))
      .slice(0, MAX_VORONKA)
      .map((p) => ({ id: p.id, name: p.name }));
  } catch {
    // Voronkalar o'qilmasa — bitta umumiy namuna bilan davom etamiz.
  }

  const lidHisob = new Map<string, MaydonHisoboti>();
  const voronkaHisob: VoronkaHisoboti[] = [];
  const kontaktIdlar: number[] = [];
  const atribusiya = { utm_term: 0, utm_campaign: 0, utm_content: 0, utm_source: 0, fbclid: 0 };
  let tekshirilganLid = 0;
  let nomdaTopildi = 0;
  let tegdaTopildi = 0;

  // Voronkalar topilmasa — filtrsiz bitta namuna.
  const sorovlar =
    voronkalar.length > 0
      ? voronkalar.map((v) => ({
          id: String(v.id),
          nom: v.name,
          yol: `/api/v4/leads?limit=${VORONKADAN}&order[created_at]=desc&with=contacts&filter[pipeline_id]=${v.id}`,
        }))
      : [
          {
            id: '—',
            nom: 'Barcha lidlar',
            yol: `/api/v4/leads?limit=${VORONKADAN}&order[created_at]=desc&with=contacts`,
          },
        ];

  for (const s of sorovlar) {
    let lidlar: AmoLid[] = [];
    try {
      const javob = await amoGetPath<{ _embedded?: { leads?: AmoLid[] } }>(workspaceId, s.yol);
      lidlar = javob._embedded?.leads ?? [];
    } catch {
      // Bitta voronkadagi xato qolganlarini to'xtatmaydi.
    }

    const v: VoronkaHisoboti = {
      id: s.id,
      nom: s.nom,
      jami: lidlar.length,
      avtomatik: 0,
      utm_term: 0,
      utm_campaign: 0,
      fbclid: 0,
      leadIdTopildi: 0,
    };

    for (const lid of lidlar) {
      tekshirilganLid += 1;
      // created_by = 0 — integratsiya yoki API yaratgan, odam emas.
      if (lid.created_by === 0) v.avtomatik += 1;

      const maydonlar = lid.custom_fields_values ?? [];
      const utm = extractUtm(maydonlar);
      if (utm.utm_term) {
        v.utm_term += 1;
        atribusiya.utm_term += 1;
      }
      if (utm.utm_campaign) {
        v.utm_campaign += 1;
        atribusiya.utm_campaign += 1;
      }
      if (utm.utm_content) atribusiya.utm_content += 1;
      if (utm.utm_source) atribusiya.utm_source += 1;
      if (utm.fbclid) {
        v.fbclid += 1;
        atribusiya.fbclid += 1;
      }

      let topildi = maydonlarniSana(lidHisob, lidTariflari, maydonlar);

      // Lid nomi: "Заявка с Facebook #1234567890123456" kabi holatlar.
      if (lid.name && MATNDA_LEAD_ID.test(lid.name)) {
        nomdaTopildi += 1;
        topildi = true;
      }
      // Teglar: ba'zi integratsiyalar manbani tegga yozadi.
      for (const t of lid._embedded?.tags ?? []) {
        if (t.name && MATNDA_LEAD_ID.test(t.name)) {
          tegdaTopildi += 1;
          topildi = true;
          break;
        }
      }

      if (topildi) v.leadIdTopildi += 1;

      const kontakt = lid._embedded?.contacts?.[0]?.id;
      if (kontakt && kontaktIdlar.length < KONTAKT_NAMUNA) kontaktIdlar.push(kontakt);
    }

    voronkaHisob.push(v);
  }

  // Kontakt maydonlari — integratsiya Lead ID ni u yerga yozgan bo'lishi mumkin.
  const kontaktHisob = new Map<string, MaydonHisoboti>();
  if (kontaktIdlar.length) {
    const kontaktTariflari = await maydonTariflari(
      workspaceId,
      '/api/v4/contacts/custom_fields'
    );
    try {
      const filtr = kontaktIdlar.map((id) => `filter[id][]=${id}`).join('&');
      const javob = await amoGetPath<{ _embedded?: { contacts?: AmoKontakt[] } }>(
        workspaceId,
        `/api/v4/contacts?limit=${KONTAKT_NAMUNA}&${filtr}`
      );
      for (const k of javob._embedded?.contacts ?? []) {
        maydonlarniSana(kontaktHisob, kontaktTariflari, k.custom_fields_values ?? []);
      }
    } catch {
      // Kontaktlar o'qilmasa — lid maydonlari bo'yicha xulosa qoladi.
    }
  }

  // To'ldirilmagan lid maydonlari ham ro'yxatda tursin.
  for (const [id, tarif] of lidTariflari) {
    if (lidHisob.has(id)) continue;
    lidHisob.set(id, {
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

  const maydonlar = ishonchBilan(lidHisob);
  const kontaktMaydonlari = ishonchBilan(kontaktHisob);

  return {
    tekshirilganLid,
    voronkalar: voronkaHisob,
    nomzodlar: nomzodlarni(maydonlar),
    maydonlar,
    kontaktNomzodlari: nomzodlarni(kontaktMaydonlari),
    nomdaTopildi,
    tegdaTopildi,
    atribusiya,
  };
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
export const METR = { META_LEAD_ID, MATNDA_LEAD_ID, VORONKADAN, ENG_KAM_ULUSH };
