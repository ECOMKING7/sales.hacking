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

import { pool } from '../db/pool';
import { amoGetPath, getPipelines } from './amocrmService';
import { extractUtm, type AmoFieldValue } from './leadMatcher';

/** Meta Lead ID shakli: 15–17 xonali toza son. */
const META_LEAD_ID = /^\d{15,17}$/;
/** Matn ichidan qidirish uchun (lid nomi: "Заявка #1234567890123456"). */
const MATNDA_LEAD_ID = /(?<!\d)\d{15,17}(?!\d)/;

/**
 * Telefon shakli: raqamga keltirilganda 9–15 xona.
 * O'zbekiston: 998901234567 = 12, qisqa ofis raqami = 9.
 */
const TELEFON_XONA = { min: 9, max: 15 };

/**
 * Liniya nomzodi shartlari.
 *
 * Mantiq: liniya raqami TAKRORLANADI (bir nechta lid bitta raqamga
 * qo'ng'iroq qiladi), mijoz raqami esa har lidda boshqa. Shuning uchun
 * noyob qiymatlar soni ajratuvchi belgi bo'la oladi — maydon nomidan,
 * tildan va provayderdan mustaqil.
 */
const LINIYA = {
  /** Shuncha lidda to'ldirilgan bo'lsa tekshiriladi (kam namunadan xulosa chiqmaydi). */
  engKamLid: 10,
  /** Ko'pi bilan shuncha noyob qiymat — bundan ko'pi mijoz raqamiga o'xshaydi. */
  engKopNoyob: 8,
  /** Qiymatlarning kamida shuncha ulushi telefon shaklida bo'lsin. */
  engKamTelefon: 0.8,
};

/** Faqat raqam qoldiradi. Ikki tomon bir xil normalizatsiyadan o'tadi. */
export function raqamlash(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

function telefonShaklidami(v: string): boolean {
  const r = raqamlash(v);
  return r.length >= TELEFON_XONA.min && r.length <= TELEFON_XONA.max;
}

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
  /** Shulardan nechtasi telefon shaklida. */
  telefonShaklida: number;
  /** Nechta NOYOB qiymat uchradi — liniyani mijoz raqamidan ajratadi. */
  noyob: number;
  /** Noyob qiymatlar (faqat kam bo'lsa to'ldiriladi — liniya nomzodi). */
  noyobQiymatlar: string[];
  /** 0–100. `toldirilgan` nolga teng bo'lsa 0. */
  ishonch: number;
  /**
   * Noyob qiymatlar ulushi, 0–100. Lead ID da ≈100, forma ID da past.
   * Shakl bilan birga — bu ikkinchi va HAL QILUVCHI tekshiruv.
   */
  noyoblik: number;
  /**
   * `true` — qiymatlar takrorlanadi, ya'ni bu har lidga tegishli
   * identifikator emas (ehtimol forma yoki reklama ID si).
   */
  takroriy: boolean;
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

export interface IdMosligi {
  /** Tekshirilgan noyob ID soni. */
  tekshirildi: number;
  kampaniya: number;
  adset: number;
  ad: number;
  /** Hech biriga mos kelmaganlari — ehtimol forma ID si yoki boshqa narsa. */
  nomalum: number;
}

export interface MaydonTahlili {
  /** Namunaga jami nechta lid tushdi. */
  tekshirilganLid: number;
  /** Har voronka alohida — o'rtachalash xulosani buzadi. */
  voronkalar: VoronkaHisoboti[];
  /** Meta Lead ID ni saqlayotgan bo'lishi mumkin bo'lgan LID maydonlari. */
  nomzodlar: MaydonHisoboti[];
  /**
   * Shakli mos, lekin qiymatlari TAKRORLANADI — ehtimol forma yoki
   * reklama ID si. Nomzod emas, lekin ko'rsatiladi: sababsiz yo'qolgan
   * maydon "kod topmadi" deb tushuniladi.
   */
  takroriyNomzodlar: MaydonHisoboti[];
  /** Barcha lid maydonlari — nomzod topilmasa odam o'zi qarab tanlashi uchun. */
  maydonlar: MaydonHisoboti[];
  /** Kontakt maydonlaridagi nomzodlar (integratsiya u yerga yozgan bo'lishi mumkin). */
  kontaktNomzodlari: MaydonHisoboti[];
  /**
   * Qo'ng'iroq liniyasi nomzodlari: telefon shaklida, lekin KAM XIL.
   * Reklama qo'ng'irog'ini organikdan ajratish uchun kerak.
   */
  liniyaNomzodlari: MaydonHisoboti[];
  /** Hozir sozlangan liniya maydoni va reklama liniyalari. */
  liniyaMaydoni: string | null;
  reklamaLiniyalari: string[];
  /** Lid NOMIDA 15–17 xonali son uchragan lidlar soni. */
  nomdaTopildi: number;
  /**
   * Nomdagi qiymatlarning NOYOB soni.
   *
   * ⚠ BU ENG MUHIM TEKSHIRUV. 15–17 xonali son Meta Lead ID bo'lishi
   * SHART EMAS: Facebook'da forma ID si, kampaniya ID si, ad ID si va
   * ad account ID si ham aynan shu uzunlikda. Farq bitta:
   *   Lead ID   — HAR lidda boshqa  → noyob ≈ topilgan
   *   Forma/ad  — TAKRORLANADI      → noyob << topilgan
   * Bu farqni ko'rsatmasdan turib maydonni tanlash — noto'g'ri
   * identifikatorni Meta'ga yuborish demak.
   */
  nomNoyob: number;
  /** `true` — nomdagi sonlar takrorlanadi, ya'ni Lead ID emas. */
  nomTakroriy: boolean;
  /** Ko'z bilan tekshirish uchun uchta misol. */
  nomNamunalar: string[];
  /** Teglar ichida uchragan lidlar soni. */
  tegdaTopildi: number;
  tegNoyob: number;
  /**
   * `true` — teglardagi sonlar takrorlanadi.
   *
   * FurniGlass'da aynan shunday: 8 ta qiymat butun bazada. O'lchandi va
   * ular Facebook forma ID lari ekani tasdiqlandi (8/8 mos).
   */
  tegTakroriy: boolean;
  tegNamunalar: string[];
  /** Teglarning to'liq matni — ichida reklama NOMI bo'lishi mumkin. */
  tegMatnlari: string[];
  /** Lid nomlarining to'liq matni — shakli qanday ekanini ko'rish uchun. */
  nomMatnlari: string[];
  /**
   * Topilgan ID lar bizning Facebook jadvallarimizga mos keldimi.
   *
   * MANA SHU — hal qiluvchi tekshiruv. 15–17 xonali son "reklama ID si
   * bo'lsa kerak" degan TAXMIN edi. Bizda Facebook'dan tortilgan
   * kampaniya, adset va ad ID lari bor — solishtirsak taxmin faktga
   * aylanadi. UTM yo'q mamlakatda atribusiyaning yagona yo'li shu.
   */
  idMosligi: {
    nomdan: IdMosligi;
    tegdan: IdMosligi;
  };
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
  maydonlar: AmoMaydonQiymati[],
  /** field_id -> ko'rilgan noyob qiymatlar (cheklangan). */
  noyobHisob: Map<string, Set<string>>
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
        telefonShaklida: 0,
        noyob: 0,
        noyobQiymatlar: [],
        ishonch: 0,
        // Takroriylik `ishonchBilan()` da hisoblanadi — bu yerda
        // hali bitta qiymat ko'rilgan, xulosa chiqarib bo'lmaydi.
        noyoblik: 0,
        takroriy: false,
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
    if (telefonShaklidami(qiymat)) qator.telefonShaklida += 1;

    // Noyob qiymatlar: liniya raqamini mijoz raqamidan shu bilan ajratamiz.
    // Ro'yxat cheklangan — mijoz raqamlari maydonida u minglab bo'lib ketardi.
    // Noyoblikni TO'LIQ sanaymiz (namuna ko'pi bilan 800 qator — arzon).
    // Qiymatlar ro'yxati esa faqat kam bo'lganda ochiladi: mijoz
    // raqamlari maydonida u yuzlab raqamni oshkor qilardi.
    const kalit = raqamlash(qiymat) || qiymat;
    const nq = noyobHisob.get(id) ?? new Set<string>();
    nq.add(kalit);
    noyobHisob.set(id, nq);
    qator.noyob = nq.size;
  }
  return topildi;
}

/* ═══════════════════════════════════════════════════════════════════════
   TAKRORIYLIK TESTI — noto'g'ri identifikatorni tanlashning yagona to'sig'i

   19.09.2026 da o'lchandi va isbotlandi: FurniGlass amoCRM teglarida
   turgan 8 ta qiymat Facebook'ning **forma ID** lari bilan 8/8 mos keldi.
   Ya'ni teglar Lead ID emas, FORMA ID saqlaydi.

   Shaklga qarab ajratib bo'lmaydi — ikkalasi ham 15–17 xonali son:
     Lead ID   1657533052655958
     Forma ID  1394587378208816

   Farq bitta va u SHAKLDA emas, TAQSIMOTDA:
     Lead ID   — har lidda boshqa   → noyob ≈ to'ldirilgan
     Forma ID  — qayta ishlatiladi  → noyob << to'ldirilgan
                 (8 ta qiymat 15 659 lidda)

   Shuning uchun nomzod shartida shakl YETARLI EMAS. Takroriy maydon
   tanlansa `leads.fb_lead_id` ga forma ID yoziladi va Meta CAPI
   mosligi JIM ishlamaydi — xato chiqmaydi, shunchaki hech narsa
   moslashmaydi.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Noyob qiymatlar ulushi shundan past bo'lsa — maydon takroriy.
 *
 * Nega 0.9 va 1.0 emas: real ma'lumotda dublikat lid bo'ladi (bir odam
 * ikki marta forma to'ldiradi), shuning uchun 100% noyoblik talab qilish
 * to'g'ri maydonni ham rad etardi. 0.9 — dublikatga joy qoldiradi,
 * lekin 8/15659 kabi taqsimotni o'tkazmaydi.
 */
const ENG_KAM_NOYOBLIK = 0.9;

/**
 * Maydon qiymatlari takrorlanadimi.
 *
 * Toza funksiya — testdan o'tadi va boshqa joydan ham chaqiriladi.
 * `toldirilgan` juda kam bo'lsa xulosa chiqarilmaydi: 2 ta qiymatdan
 * "takroriy" ham, "noyob" ham deb bo'lmaydi.
 */
export function takroriyMi(toldirilgan: number, noyob: number): boolean {
  if (toldirilgan < 5) return false; // namuna kichik — hukm yo'q
  return noyob / toldirilgan < ENG_KAM_NOYOBLIK;
}

function ishonchBilan(hisob: Map<string, MaydonHisoboti>): MaydonHisoboti[] {
  const royxat = [...hisob.values()].map((m) => ({
    ...m,
    ishonch: m.toldirilgan > 0 ? Math.round((m.metaShaklida / m.toldirilgan) * 100) : 0,
    noyoblik: m.toldirilgan > 0 ? Math.round((m.noyob / m.toldirilgan) * 100) : 0,
    takroriy: takroriyMi(m.toldirilgan, m.noyob),
  }));
  royxat.sort((a, b) => b.metaShaklida - a.metaShaklida || b.toldirilgan - a.toldirilgan);
  return royxat;
}

/** Shakli mos — lekin hali takroriylik tekshirilmagan. */
function shakliMos(royxat: MaydonHisoboti[]): MaydonHisoboti[] {
  return royxat.filter((m) => m.toldirilgan > 0 && m.metaShaklida / m.toldirilgan >= ENG_KAM_ULUSH);
}

/** Haqiqiy nomzodlar: shakli MOS va qiymatlari TAKRORLANMAYDI. */
function nomzodlarni(royxat: MaydonHisoboti[]): MaydonHisoboti[] {
  return shakliMos(royxat).filter((m) => !m.takroriy);
}

/**
 * Shakli mos, lekin takroriy — ya'ni ehtimol forma / reklama ID si.
 *
 * Bular YASHIRILMAYDI. Yashirilsa odam "nega mening maydonim
 * ro'yxatda yo'q?" deb o'ylaydi va sababini bilmaydi. Ko'rsatiladi,
 * lekin sababi bilan va tanlash uchun aniq tasdiq talab qilinadi.
 */
function takroriyNomzodlarni(royxat: MaydonHisoboti[]): MaydonHisoboti[] {
  return shakliMos(royxat).filter((m) => m.takroriy);
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
  const lidNoyob = new Map<string, Set<string>>();
  const voronkaHisob: VoronkaHisoboti[] = [];
  const kontaktIdlar: number[] = [];
  const atribusiya = { utm_term: 0, utm_campaign: 0, utm_content: 0, utm_source: 0, fbclid: 0 };
  let tekshirilganLid = 0;
  let nomdaTopildi = 0;
  let tegdaTopildi = 0;
  const nomQiymatlar = new Set<string>();
  const tegQiymatlar = new Set<string>();
  // To'liq matnlar: ID dan tashqari reklama NOMI ham shu yerda
  // bo'lishi mumkin ("fb | Divan video 3 | 12345...").
  const tegMatnlar = new Set<string>();
  const nomMatnlar = new Set<string>();

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

      let topildi = maydonlarniSana(lidHisob, lidTariflari, maydonlar, lidNoyob);

      // Lid nomi: "Заявка с Facebook #1234567890123456" kabi holatlar.
      const nomdagi = lid.name ? MATNDA_LEAD_ID.exec(lid.name) : null;
      if (nomdagi) {
        nomdaTopildi += 1;
        // ⚠ CHEKLOV QO'YILMAYDI. Ilgari bu yerda `size <= 100` sharti
        // bor edi va o'lchov aynan 101 da to'xtardi — "205 tadan 101
        // noyob" degan raqam chiqdi va u YOLG'ON edi: u cheklovning
        // o'zini o'lchayotgandi. Diagnostika o'z chegarasini o'lchab
        // qo'ysa, u diagnostika emas.
        nomQiymatlar.add(nomdagi[0]);
        if (lid.name && nomMatnlar.size < 5) nomMatnlar.add(lid.name);
        topildi = true;
      }
      // Teglar: ba'zi integratsiyalar manbani tegga yozadi.
      for (const t of lid._embedded?.tags ?? []) {
        const tegdagi = t.name ? MATNDA_LEAD_ID.exec(t.name) : null;
        if (tegdagi) {
          tegdaTopildi += 1;
          tegQiymatlar.add(tegdagi[0]);
          if (t.name && tegMatnlar.size < 8) tegMatnlar.add(t.name);
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
  const kontaktNoyob = new Map<string, Set<string>>();
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
        maydonlarniSana(kontaktHisob, kontaktTariflari, k.custom_fields_values ?? [], kontaktNoyob);
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
      telefonShaklida: 0,
      noyob: 0,
      noyobQiymatlar: [],
      ishonch: 0,
      noyoblik: 0,
      takroriy: false,
      namunalar: [],
    });
  }

  const maydonlar = ishonchBilan(lidHisob);
  const kontaktMaydonlari = ishonchBilan(kontaktHisob);
  const liniyaQiymatlari = new Map<string, Set<string>>([...lidNoyob, ...kontaktNoyob]);

  /**
   * Liniya nomzodi: qiymatlar telefon shaklida, lekin KAM XIL.
   * Mijoz raqami maydoni bu shartdan o'tmaydi — unda har lidda boshqa
   * qiymat bo'ladi va noyob soni namuna hajmiga teng chiqadi.
   */
  const liniyaNomzodlari = [...maydonlar, ...kontaktMaydonlari]
    .filter(
      (m) =>
        m.toldirilgan >= LINIYA.engKamLid &&
        m.noyob > 0 &&
        m.noyob <= LINIYA.engKopNoyob &&
        m.telefonShaklida / m.toldirilgan >= LINIYA.engKamTelefon
    )
    .map((m) => ({
      ...m,
      // Noyob qiymatlarni faqat SHU YERDA ochamiz: nomzod bo'lgani —
      // qiymatlar takrorlanishi, ya'ni bular biznes liniyalari, mijoz
      // raqamlari emas. Mijoz raqamlari maydoni bu filtrga tushmaydi.
      noyobQiymatlar: [...(liniyaQiymatlari.get(m.field_id) ?? [])],
    }));

  return {
    tekshirilganLid,
    voronkalar: voronkaHisob,
    nomzodlar: nomzodlarni(maydonlar),
    takroriyNomzodlar: [
      ...takroriyNomzodlarni(maydonlar),
      ...takroriyNomzodlarni(kontaktMaydonlari),
    ],
    maydonlar,
    kontaktNomzodlari: nomzodlarni(kontaktMaydonlari),
    liniyaNomzodlari,
    liniyaMaydoni: null,
    reklamaLiniyalari: [],
    nomdaTopildi,
    nomNoyob: nomQiymatlar.size,
    nomTakroriy: takroriyMi(nomdaTopildi, nomQiymatlar.size),
    nomNamunalar: [...nomQiymatlar].slice(0, 3),
    nomMatnlari: [...nomMatnlar],
    tegdaTopildi,
    tegNoyob: tegQiymatlar.size,
    tegTakroriy: takroriyMi(tegdaTopildi, tegQiymatlar.size),
    tegNamunalar: [...tegQiymatlar].slice(0, 3),
    tegMatnlari: [...tegMatnlar],
    idMosligi: {
      nomdan: await idlarniSolishtir(workspaceId, [...nomQiymatlar]),
      tegdan: await idlarniSolishtir(workspaceId, [...tegQiymatlar]),
    },
    atribusiya,
  };
}

/**
 * Topilgan ID larni bizdagi Facebook jadvallariga solishtiradi.
 *
 * NEGA: "15–17 xonali son — bu reklama ID si bo'lsa kerak" degan gap
 * taxmin. Bizda Facebook'dan tortilgan haqiqiy ID lar turibdi, ya'ni
 * taxmin qilish SHART EMAS — solishtiramiz va aniq bilamiz.
 *
 * UTM qo'yilmaydigan bozorda bu atribusiyaning yagona ishonchli yo'li:
 * CRM lidida reklama ID si bo'lsa, u to'g'ridan-to'g'ri `ads` jadvaliga
 * ulanadi va "qaysi reklama" ustuni to'ladi.
 */
async function idlarniSolishtir(workspaceId: string, idlar: string[]): Promise<IdMosligi> {
  const bosh: IdMosligi = { tekshirildi: 0, kampaniya: 0, adset: 0, ad: 0, nomalum: 0 };
  if (!idlar.length) return bosh;

  // Ko'p bo'lsa ham hammasi tekshiriladi — bu bitta so'rov.
  try {
    const { rows } = await pool.query<{ manba: string; topildi: string }>(
      `SELECT 'kampaniya' AS manba, fb_campaign_id AS topildi
         FROM campaigns WHERE workspace_id = $1 AND fb_campaign_id = ANY($2::text[])
       UNION ALL
       SELECT 'adset', fb_adset_id
         FROM adsets WHERE workspace_id = $1 AND fb_adset_id = ANY($2::text[])
       UNION ALL
       SELECT 'ad', fb_ad_id
         FROM ads WHERE workspace_id = $1 AND fb_ad_id = ANY($2::text[])`,
      [workspaceId, idlar]
    );

    const topilgan = new Set<string>();
    for (const r of rows) {
      topilgan.add(r.topildi);
      if (r.manba === 'kampaniya') bosh.kampaniya += 1;
      else if (r.manba === 'adset') bosh.adset += 1;
      else bosh.ad += 1;
    }
    bosh.tekshirildi = idlar.length;
    bosh.nomalum = idlar.length - topilgan.size;
    return bosh;
  } catch {
    // Facebook hali sinxronlanmagan bo'lsa jadvallar bo'sh — xato emas.
    return { ...bosh, tekshirildi: idlar.length, nomalum: idlar.length };
  }
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

/** Qayerdan o'qiladi: maxsus maydon, lid nomi yoki teg. */
export type LeadIdManbasi = 'field' | 'name' | 'tag';

/**
 * Matn ichidan Meta Lead ID ni oladi (lid nomi yoki teg).
 *
 * Ba'zi amoCRM–Facebook integratsiyalari uni maxsus maydonga emas,
 * lid NOMIGA yozadi: "Заявка #1504085748405578".
 */
export function extractLeadIdFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = MATNDA_LEAD_ID.exec(text);
  return m ? m[0] : null;
}

/**
 * Sozlangan maydondan qo'ng'iroq liniyasini oladi (faqat raqam).
 *
 * Telefon shakliga mos kelmasa null — noto'g'ri qiymat filtrni
 * jimgina buzishidan ko'ra "liniya yo'q" degani xavfsizroq.
 */
export function extractLine(
  fields: AmoMaydonQiymati[] | null | undefined,
  fieldId: string | null
): string | null {
  if (!fields || !fieldId) return null;
  for (const f of fields) {
    if (f.field_id === undefined || String(f.field_id) !== fieldId) continue;
    const r = raqamlash(f.values?.[0]?.value);
    return r.length >= TELEFON_XONA.min && r.length <= TELEFON_XONA.max ? r : null;
  }
  return null;
}

/**
 * Lid reklama liniyasidan kelganmi.
 *
 * ⚠ Ro'yxat BO'SH bo'lsa — true. Ya'ni sozlanmagan mijozda xulq
 * bugungidek qoladi va hech narsa jimgina yo'qolmaydi. Filtrni
 * yoqish ataylab qilinadigan qadam.
 */
export function reklamaLiniyasimi(
  liniya: string | null,
  reklamaLiniyalari: string[] | null | undefined
): boolean {
  const royxat = (reklamaLiniyalari ?? []).map(raqamlash).filter(Boolean);
  if (!royxat.length) return true;
  if (!liniya) return false;
  return royxat.includes(raqamlash(liniya));
}

/**
 * Lidning Meta Lead ID si — manbaga qarab.
 *
 * Bitta kirish nuqtasi: import ham, webhook ham shu funksiyani
 * chaqiradi, ya'ni ikkita joyda ikki xil mantiq paydo bo'lmaydi.
 */
export function leadIdniOl(
  lid: { name?: string | null; custom_fields_values?: AmoMaydonQiymati[] | null;
         _embedded?: { tags?: Array<{ name?: string }> } },
  manba: LeadIdManbasi | null,
  fieldId: string | null
): string | null {
  switch (manba) {
    case 'name':
      return extractLeadIdFromText(lid.name);
    case 'tag': {
      for (const t of lid._embedded?.tags ?? []) {
        const v = extractLeadIdFromText(t.name);
        if (v) return v;
      }
      return null;
    }
    default:
      return extractLeadId(lid.custom_fields_values, fieldId);
  }
}

/** Test va diagnostika uchun ochiq. */
export const METR = { META_LEAD_ID, MATNDA_LEAD_ID, VORONKADAN, ENG_KAM_ULUSH, LINIYA };
