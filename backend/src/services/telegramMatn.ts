/* ═══════════════════════════════════════════════════════════════════════
   TELEGRAM MATNLARI — toza funksiyalar, bazasiz va tarmoqsiz

   Nega alohida fayl: bu yerdagi hamma narsa testlanadi. Xabar matni
   mijozning direktori o'qiydigan yagona narsa — undagi xato raqam
   dashboarddagidan qimmatroq, chunki uni hech kim tekshirmaydi.

   ⚠ VALYUTA. Xarajat FB valyutasida (ko'pincha USD), daromad CRM
   valyutasida (UZS). Ikkalasini bitta qatorga yozib, belgisini
   ko'rsatmaslik — aynan `currencyGuard.ts` da tuzatilgan xatoning
   telegram varianti. Shuning uchun HAR pul qatorida valyuta yoziladi.
   ═══════════════════════════════════════════════════════════════════════ */

/** Telegram HTML rejimi uchun. Faqat shu uchtasi ekranlanadi. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 1234567.5 -> "1 234 568". Ajratgich — oddiy probel (Telegram'da barqaror). */
export function sonFormat(n: number, kasr = 0): string {
  if (!Number.isFinite(n)) return '—';
  const s = n.toFixed(kasr);
  const [butun, ulush] = s.split('.');
  const guruhlangan = butun.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return ulush ? `${guruhlangan}.${ulush}` : guruhlangan;
}

/**
 * Pul. UZS da tiyin ma'nosiz (39 000 000.00 faqat joy egallaydi),
 * USD/EUR da esa ikki xona kerak — $13.29 bilan $13 farqi 2%.
 */
export function pulFormat(n: number, valyuta: string | null): string {
  const v = (valyuta ?? '').toUpperCase();
  const kasr = v === 'UZS' || v === 'KZT' || v === 'UZB' ? 0 : 2;
  return `${sonFormat(n, kasr)}${v ? ` ${v}` : ''}`;
}

/* ═══════════════════════════════════════════════════════════════════════
   METRIKALAR KATALOGI

   Bazada faqat KALIT saqlanadi (`telegram_chats.metrikalar`). Yorliq va
   hisoblash shu yerda. Ya'ni yangi metrika qo'shish = shu ro'yxatga bir
   qator; migratsiya ham, frontendda qo'lda ro'yxat ham kerak emas
   (frontend ro'yxatni API'dan oladi).
   ═══════════════════════════════════════════════════════════════════════ */

export interface HisobotMalumot {
  /* FB tomoni — fbValyuta da */
  sarf: number;
  korishlar: number;
  bosishlar: number;
  /* CRM tomoni */
  lidlar: number;
  sifatli: number;
  sotuvlar: number;
  daromad: number; // crmValyuta da
  dealTimeOrtacha: number | null; // kun
  /* Kontekst */
  fbValyuta: string | null;
  crmValyuta: string | null;
  /** Xarajat CRM valyutasiga o'girilgan (kurs bo'lsa). ROAS shundan. */
  sarfCrmda: number | null;
  /** Valyuta to'sig'i sababi — ROAS hisoblanmasa nima uchun. */
  valyutaSababi: string | null;
  /** FB "lid" dedi, CRM'da nechta — farq (§7 majburiy). */
  fbLidlar: number;
}

type Tur = 'pul_fb' | 'pul_crm' | 'son' | 'foiz' | 'kun' | 'karra';

export interface MetrikaTarif {
  kalit: string;
  yorliq: string;
  tur: Tur;
  /** null = hisoblab bo'lmaydi (nolga bo'linish, valyuta to'sig'i). */
  hisobla: (d: HisobotMalumot) => number | null;
}

function bol(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export const METRIKALAR: MetrikaTarif[] = [
  { kalit: 'sarf', yorliq: 'Sarf', tur: 'pul_fb', hisobla: (d) => d.sarf },
  { kalit: 'lidlar', yorliq: 'Lidlar', tur: 'son', hisobla: (d) => d.lidlar },
  { kalit: 'cpl', yorliq: 'CPL', tur: 'pul_fb', hisobla: (d) => bol(d.sarf, d.lidlar) },
  { kalit: 'sifatli', yorliq: 'Sifatli lid', tur: 'son', hisobla: (d) => d.sifatli },
  {
    kalit: 'sifatli_ulush',
    yorliq: 'Sifatli %',
    tur: 'foiz',
    hisobla: (d) => {
      const r = bol(d.sifatli, d.lidlar);
      return r === null ? null : r * 100;
    },
  },
  {
    kalit: 'sifatli_narx',
    yorliq: 'Sifatli lid narxi',
    tur: 'pul_fb',
    hisobla: (d) => bol(d.sarf, d.sifatli),
  },
  { kalit: 'sotuvlar', yorliq: 'Sotuvlar', tur: 'son', hisobla: (d) => d.sotuvlar },
  { kalit: 'daromad', yorliq: 'Daromad', tur: 'pul_crm', hisobla: (d) => d.daromad },
  {
    kalit: 'cac',
    yorliq: 'CAC',
    tur: 'pul_fb',
    hisobla: (d) => bol(d.sarf, d.sotuvlar),
  },
  {
    kalit: 'ortacha_chek',
    yorliq: "O'rtacha chek",
    tur: 'pul_crm',
    hisobla: (d) => bol(d.daromad, d.sotuvlar),
  },
  {
    kalit: 'roas',
    yorliq: 'ROAS',
    tur: 'karra',
    /* ⚠ SARF EMAS, SARF_CRMDA. Xarajat USD, daromad UZS bo'lsa
       to'g'ridan-to'g'ri bo'lish 12 600 marta shishgan son beradi —
       bu bir marta sodir bo'lgan (roas: 6558, haqiqiysi ≈23).
       Kurs yo'q bo'lsa sarfCrmda null va ROAS ko'rsatilmaydi. */
    hisobla: (d) => (d.sarfCrmda === null ? null : bol(d.daromad, d.sarfCrmda)),
  },
  {
    kalit: 'deal_time',
    yorliq: 'Sotuv vaqti',
    tur: 'kun',
    hisobla: (d) => d.dealTimeOrtacha,
  },
  {
    kalit: 'ctr',
    yorliq: 'CTR',
    tur: 'foiz',
    hisobla: (d) => {
      const r = bol(d.bosishlar, d.korishlar);
      return r === null ? null : r * 100;
    },
  },
  {
    kalit: 'cpm',
    yorliq: 'CPM',
    tur: 'pul_fb',
    hisobla: (d) => {
      const r = bol(d.sarf, d.korishlar);
      return r === null ? null : r * 1000;
    },
  },
  { kalit: 'cpc', yorliq: 'CPC', tur: 'pul_fb', hisobla: (d) => bol(d.sarf, d.bosishlar) },
  { kalit: 'korishlar', yorliq: "Ko'rishlar", tur: 'son', hisobla: (d) => d.korishlar },
  { kalit: 'bosishlar', yorliq: 'Bosishlar', tur: 'son', hisobla: (d) => d.bosishlar },
];

export const METRIKA_KALITLARI = METRIKALAR.map((m) => m.kalit);

export const STANDART_METRIKALAR = ['sarf', 'lidlar', 'cpl', 'sotuvlar', 'daromad', 'roas'];

/**
 * Noma'lum kalitlarni tashlab yuboradi va KATALOG TARTIBIDA qaytaradi.
 *
 * Nega tartib katalogdan: foydalanuvchi belgilagan tartib tasodifiy
 * bo'ladi (nima birinchi bosilgan), va hisobot har kuni boshqacha
 * ko'rinsa o'qilmaydi. Katalog tartibi — voronka tartibi: sarf → lid →
 * sifatli → sotuv → pul.
 */
export function metrikalarniTozala(xom: unknown): string[] {
  const kirish = Array.isArray(xom) ? xom.map(String) : [];
  const tanlangan = new Set(kirish);
  const natija = METRIKALAR.filter((m) => tanlangan.has(m.kalit)).map((m) => m.kalit);
  return natija.length ? natija : [...STANDART_METRIKALAR];
}

function qiymatMatni(m: MetrikaTarif, d: HisobotMalumot): string {
  const q = m.hisobla(d);
  if (q === null || !Number.isFinite(q)) {
    // ⚠ null ≠ 0. Nol — "reklama hech narsa bermadi"; chiziqcha —
    // "hisoblab bo'lmaydi". Ikkisini aralashtirish operatorni
    // noto'g'ri qarorga olib boradi.
    return '—';
  }
  switch (m.tur) {
    case 'pul_fb':
      return pulFormat(q, d.fbValyuta);
    case 'pul_crm':
      return pulFormat(q, d.crmValyuta);
    case 'foiz':
      return `${sonFormat(q, 2)}%`;
    case 'kun':
      return `${sonFormat(q, 1)} kun`;
    case 'karra':
      return `${sonFormat(q, 2)}x`;
    default:
      return sonFormat(q);
  }
}

export interface TafsilotQator {
  nom: string;
  sarf: number;
  lidlar: number;
  sotuvlar: number;
  daromad: number;
}

export interface HisobotKirish {
  akkaunt: string;
  davrNomi: string;
  since: string;
  until: string;
  metrikalar: string[];
  malumot: HisobotMalumot;
  tafsilotSarlavha: string | null;
  tafsilot: TafsilotQator[];
  /**
   * Raqamlar qaysi vaqt zonasida bo'lingani. Yetkazish zonasidan
   * farq qilsa ko'rsatiladi — aks holda mijoz "kecha" ni o'z soatiga
   * qarab tushunadi va Ads Manager bilan solishtirganda farq chiqadi.
   */
  zonaIzoh?: string | null;
}

/**
 * Hisobot matni.
 *
 * Tuzilishi ataylab qat'iy: sarlavha → metrikalar → tafsilot →
 * tafovut. Har kuni bir xil joyda bir xil narsa tursa, odam uni
 * o'qimay ham "bugun boshqacha" ekanini payqaydi.
 */
export function hisobotMatni(k: HisobotKirish): string {
  const d = k.malumot;
  const qatorlar: string[] = [];

  qatorlar.push(`📊 <b>${esc(k.akkaunt)}</b> — ${esc(k.davrNomi)}`);
  qatorlar.push(
    `<i>${esc(k.since)}${k.since === k.until ? '' : ` → ${esc(k.until)}`}</i>`
  );
  qatorlar.push('');

  for (const kalit of k.metrikalar) {
    const m = METRIKALAR.find((x) => x.kalit === kalit);
    if (!m) continue;
    qatorlar.push(`${esc(m.yorliq)}: <b>${esc(qiymatMatni(m, d))}</b>`);
  }

  /* ⚠ §7 MAJBURIY: FB nechta lid dedi, CRM'da nechta bor.
     Farq — integratsiyaning sog'ligi. Uni yashirish "hammasi joyida"
     degan yolg'on beradi; aynan shu farq 3 oy ko'rinmay turgan. */
  if (d.fbLidlar > 0 || d.lidlar > 0) {
    const farq = d.lidlar - d.fbLidlar;
    if (farq !== 0) {
      const ulush = d.fbLidlar > 0 ? Math.round((farq / d.fbLidlar) * 100) : null;
      qatorlar.push('');
      qatorlar.push(
        `⚠️ FB: ${sonFormat(d.fbLidlar)} lid · CRM: ${sonFormat(d.lidlar)} — ` +
          `tafovut ${farq > 0 ? '+' : ''}${sonFormat(farq)}` +
          (ulush === null ? '' : ` (${ulush > 0 ? '+' : ''}${ulush}%)`)
      );
    }
  }

  if (d.valyutaSababi) {
    qatorlar.push('');
    qatorlar.push(`ℹ️ ${esc(d.valyutaSababi)}`);
  }

  if (k.zonaIzoh) {
    qatorlar.push('');
    qatorlar.push(`<i>${esc(k.zonaIzoh)}</i>`);
  }

  if (k.tafsilot.length > 0 && k.tafsilotSarlavha) {
    qatorlar.push('');
    qatorlar.push(`<b>${esc(k.tafsilotSarlavha)}</b>`);
    for (const t of k.tafsilot) {
      qatorlar.push(
        `• ${esc(qisqart(t.nom, 40))} — ${esc(pulFormat(t.sarf, d.fbValyuta))} · ` +
          `${sonFormat(t.lidlar)} lid · ${sonFormat(t.sotuvlar)} sotuv` +
          (t.daromad > 0 ? ` · ${esc(pulFormat(t.daromad, d.crmValyuta))}` : '')
      );
    }
  }

  return qatorlar.join('\n');
}

/** Uzun reklama nomlari telegramda qatorni buzadi. */
export function qisqart(s: string, n: number): string {
  const t = String(s ?? '').trim();
  if (t.length <= n) return t || '(nomsiz)';
  return `${t.slice(0, n - 1)}…`;
}

/* ═══════════════════════════════════════════════════════════════════════
   SOTUV XABARI
   ═══════════════════════════════════════════════════════════════════════ */

export interface SotuvKirish {
  akkaunt: string;
  summa: number;
  valyuta: string | null;
  kampaniya: string | null;
  guruh: string | null;
  reklama: string | null;
  crmLeadId: string | null;
  dealTimeKun: number | null;
  /** lead_id | utm | fbclid | contact | null */
  moslikUsuli: string | null;
}

const USUL_NOMI: Record<string, string> = {
  lead_id: 'Meta Lead ID',
  utm: 'UTM',
  fbclid: 'fbclid',
  contact: 'telefon/email',
};

/**
 * "Bu reklama guruhidan, bu kampaniyadan, bu videodan $X sotuv bo'ldi."
 *
 * ⚠ REKLAMA TOPILMASA — YOLG'ON YOZMAYMIZ. Atribusiya yo'q lid ham
 * sotuv, lekin uni biror reklamaga yozib qo'yish butun mahsulotning
 * ma'nosini yo'qotadi. Shunda xabar sababni aytadi.
 */
export function sotuvMatni(k: SotuvKirish): string {
  const q: string[] = [];
  q.push(`💰 <b>Sotuv — ${esc(pulFormat(k.summa, k.valyuta))}</b>`);
  q.push(`<i>${esc(k.akkaunt)}</i>`);
  q.push('');

  if (k.reklama || k.kampaniya || k.guruh) {
    q.push(`Kampaniya: <b>${esc(k.kampaniya ?? '—')}</b>`);
    q.push(`Reklama guruhi: <b>${esc(k.guruh ?? '—')}</b>`);
    q.push(`Reklama: <b>${esc(k.reklama ?? '—')}</b>`);
  } else {
    q.push('🔍 <b>Reklama aniqlanmadi</b>');
    q.push(
      k.moslikUsuli
        ? 'Lid reklamaga bog\'langan, lekin reklama bazada topilmadi.'
        : "Bu lidda reklama izi yo'q (UTM, fbclid, Meta Lead ID — hech biri)."
    );
  }

  q.push('');
  const qism: string[] = [];
  if (k.crmLeadId) qism.push(`Lid #${esc(k.crmLeadId)}`);
  if (k.dealTimeKun !== null) qism.push(`${sonFormat(k.dealTimeKun, 0)} kun`);
  if (k.moslikUsuli) qism.push(USUL_NOMI[k.moslikUsuli] ?? k.moslikUsuli);
  if (qism.length) q.push(`<i>${qism.join(' · ')}</i>`);

  return q.join('\n');
}
