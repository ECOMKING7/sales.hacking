export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  workspace: Workspace | null;
}

export interface FbStatus {
  connected: boolean;
  adAccountId: string | null;
  expiresAt: string | null;
}

export interface AdAccount {
  id: string;
  accountId: string;
  name: string;
  status: number;
  currency: string;
  businessName?: string | null;
}

export interface AmocrmStatus {
  connected: boolean;
  domain: string | null;
  pipelineId: string | null;
  wonStageId: string | null;
  /** Eski shakl — bitta voronka ichidagi etap ID lari. */
  qualifiedStageIds: string[];
  /**
   * '<voronka>:<etap>' juftliklari. Sotuv va sifatli lid ta'rifi shu
   * yerda: amoCRM'da 142/143 har voronkada takrorlanadi, shuning uchun
   * etap ID si yakka o'zi yetarli emas.
   */
  wonPairs: string[];
  qualifiedPairs: string[];
  /** Voronkaning birinchi (lid) etaplari. */
  leadPairs: string[];
  /** Client ID maxfiy emas, shuning uchun qaytariladi. */
  clientId: string | null;
  /** Secret hech qachon qaytarilmaydi — faqat o'rnatilgani ma'lum. */
  clientSecretConfigured: boolean;
  /** amoCRM'ga joylanadigan to'liq webhook manzili. */
  webhookUrl: string | null;
  tokenExpiresAt: string | null;
}

/**
 * Meta Conversions API holati. Token bu yerda YO'Q va hech qachon
 * bo'lmaydi — faqat .env da bor-yo'qligi (`tokenConfigured`).
 */
export interface MetaCapiStatus {
  enabled: boolean;
  datasetId: string | null;
  currency: string;
  phoneCountryCode: string;
  tokenConfigured: boolean;
  secretKey: string | null;
  /**
   * Bosqich -> Meta hodisa nomi. Standart nom (Lead, Schedule,
   * Purchase) Ads Manager'da darhol ishlaydi; boshqa nom custom
   * bo'lib, Events Manager'da Custom Conversion talab qiladi.
   */
  eventNames: { lead: string; qualified: string; purchase: string };
  standardEvents: string[];
  events: Array<{
    eventName: string;
    status: string;
    count: number;
    lastAt: string | null;
  }>;
}

export interface PipelineStatus {
  id: string | number;
  name: string;
  type: string;
}

export interface Pipeline {
  id: string | number;
  name: string;
  statuses: PipelineStatus[];
}

export interface EntityRow {
  id: string;
  name: string | null;
  status: string | null;
  spend: string | number;
  clicks: string | number;
  impressions: string | number;
  cpc: string | number | null;
  cpm: string | number | null;
  ctr: string | number | null;
  leads: number;
  costPerLead: string | number | null;
  purchases: number;
  costPerPurchase: string | number | null;
  revenue: string | number;
  roas: string | number | null;
  /** Facebook'ning o'z daromad raqami — CRM'niki bilan solishtirish uchun. */
  fbRevenue?: string | number | null;
  thumbnailUrl?: string | null;
  creativeType?: string | null;
  /** Kampaniya maqsadi (OUTCOME_LEADS, OUTCOME_SALES, ...) */
  objective?: string | null;
  /** Natija nima deb hisoblangani: 'lead', 'purchase', 'click', ... */
  resultType?: string | null;
  results?: number | null;
  costPerResult?: string | number | null;
}

/**
 * Jadval ostidagi "jami" qatori. Backend butun ro'yxat bo'yicha hisoblaydi —
 * ko'rinib turgan sahifa bo'yicha emas. O'rtacha ustunlar (cpc, ctr,
 * costPerResult) jamidan qayta hisoblangan, qo'shilgan emas.
 */
export interface EntityTotals {
  rowCount: string | number;
  spend: string | number;
  clicks: string | number;
  impressions: string | number;
  leads: string | number;
  purchases: string | number;
  results: string | number;
  revenue: string | number;
  fbRevenue: string | number;
  cpc: string | number | null;
  cpm: string | number | null;
  ctr: string | number | null;
  costPerLead: string | number | null;
  costPerPurchase: string | number | null;
  costPerResult: string | number | null;
  roas: string | number | null;
  /** Hamma qator bir xil turda bo'lsagina to'ladi; aralashda null. */
  resultType: string | null;
}

/**
 * Valyuta holati. `mismatch` bo'lsa ROAS backend'da `null` qilib yuboriladi:
 * daromad CRM valyutasida, xarajat reklama akkaunti valyutasida — ikkisini
 * bo'lish yolg'on raqam beradi (real holatda ~12 600 barobar shishgan edi).
 */
export interface CurrencyState {
  fb: string | null;
  crm: string | null;
  /** Valyutalar teng emas. */
  mismatch: boolean;
  /** Kurs topilib, ROAS o'girib hisoblandimi. */
  converted: boolean;
  /** 1 fb = rate crm. */
  rate: number | null;
  rateDate: string | null;
  rateSource: string | null;
  reason: string | null;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totals?: EntityTotals;
  currency?: CurrencyState;
  /**
   * Raqamlar qaysi davr va qaysi manbadan. `kunlik` — `ad_insights_daily`
   * dan, tanlangan kunlar bo'yicha; `butun_davr` — eski ustunlardan.
   * Usiz UI "bu raqam qaysi davrniki?" degan savolga javob bera olmaydi.
   */
  vaqt?: {
    rejim: 'kunlik' | 'butun_davr';
    from: string | null;
    to: string | null;
    qamrov: { start: string | null; end: string | null };
    izoh: string;
  };
}

export interface WonDeal {
  id: string;
  customerName: string | null;
  source: string;
  campaignName: string | null;
  adsetName: string | null;
  adName: string | null;
  revenue: string | number;
  dealTime: number | null;
  wonAt: string;
}

export interface JourneyEvent {
  id: string;
  eventType: 'view' | 'click' | 'lead' | 'purchase';
  touchNumber: number | null;
  attributionWeight: string | number | null;
  occurredAt: string | null;
  adName: string | null;
  campaignName: string | null;
}

export type Plan = 'free' | 'pro' | 'agency';

export interface Usage {
  plan: Plan;
  limits: {
    adAccounts: number;
    leadsPerMonth: number | null;
    export: boolean;
    whiteLabel: boolean;
  };
  usage: { leadsThisMonth: number; adAccounts: number };
}

export interface Member {
  user_id: string | null;
  email: string;
  name: string | null;
  role: string;
  status: string;
}

export interface LeadDetailData {
  lead: {
    id: string;
    status: string;
    revenue: string | number;
    total_touches: number;
    deal_time_days: number | null;
    won_at: string | null;
    created_at: string;
  };
  journey: JourneyEvent[];
  clicks: JourneyEvent[];
  purchases: JourneyEvent[];
}

/**
 * amoCRM maydon tahlili — qaysi maydon Meta Lead ID ni saqlaydi.
 *
 * Backend nomga emas, QIYMAT SHAKLIGA qarab topadi (15–17 xonali son),
 * shuning uchun maydon qanday atalganidan qat'i nazar ishlaydi.
 */
export interface FieldRow {
  field_id: string;
  field_name: string;
  field_code: string | null;
  field_type: string | null;
  /** Namunadagi nechta lidda maydon to'ldirilgan. */
  toldirilgan: number;
  /** Shulardan nechtasi Meta Lead ID shaklida. */
  metaShaklida: number;
  /** Shulardan nechtasi telefon shaklida. */
  telefonShaklida: number;
  /** Nechta NOYOB qiymat — liniyani mijoz raqamidan shu ajratadi. */
  noyob: number;
  /** Noyob qiymatlar (faqat liniya nomzodida to'ldiriladi). */
  noyobQiymatlar: string[];
  /** 0–100. */
  ishonch: number;
  /**
   * Noyob qiymatlar ulushi, 0–100. Lead ID da ≈100, forma ID da past.
   * Shakl bilan birga — ikkinchi va hal qiluvchi tekshiruv.
   */
  noyoblik: number;
  /** `true` — qiymatlar takrorlanadi, ya'ni har lidga tegishli ID emas. */
  takroriy: boolean;
  namunalar: string[];
}

/**
 * Voronka kesimi. Namuna HAR VORONKADAN alohida olinadi — birinchi
 * versiyada "oxirgi 250 lid" olingandi va hajmi katta voronka namunani
 * to'ldirib, boshqasi umuman ko'rinmay qolgandi.
 */
export interface FieldPipelineRow {
  id: string;
  nom: string;
  jami: number;
  /** created_by = 0 — integratsiya yaratgan, odam emas. */
  avtomatik: number;
  utm_term: number;
  utm_campaign: number;
  fbclid: number;
  leadIdTopildi: number;
}

/** Topilgan ID lar Facebook'ning qaysi obyektiga mos keldi. */
export interface IdMatch {
  tekshirildi: number;
  kampaniya: number;
  adset: number;
  ad: number;
  nomalum: number;
}

export interface FieldReport {
  tekshirilganLid: number;
  voronkalar: FieldPipelineRow[];
  nomzodlar: FieldRow[];
  /**
   * Shakli mos, lekin qiymati takrorlanadi — ehtimol forma/reklama ID si.
   * Nomzod emas, lekin ko'rsatiladi: sababsiz yo'qolgan maydon
   * "kod topmadi" deb tushuniladi.
   */
  takroriyNomzodlar: FieldRow[];
  maydonlar: FieldRow[];
  /** Kontakt maydonlarida topilgan nomzodlar. */
  kontaktNomzodlari: FieldRow[];
  /** Qo'ng'iroq liniyasi nomzodlari: telefon shaklida, lekin kam xil. */
  liniyaNomzodlari: FieldRow[];
  liniyaMaydoni: string | null;
  reklamaLiniyalari: string[];
  /** Lid NOMIDA 15–17 xonali son uchragan lidlar soni. */
  nomdaTopildi: number;
  /** Noyob qiymatlar soni — Lead ID mi yoki forma/ad ID si, shundan bilinadi. */
  nomNoyob: number;
  /** `true` — nomdagi sonlar takrorlanadi, ya'ni Lead ID emas. */
  nomTakroriy: boolean;
  nomNamunalar: string[];
  tegdaTopildi: number;
  tegNoyob: number;
  /** `true` — teglardagi sonlar takrorlanadi. */
  tegTakroriy: boolean;
  tegNamunalar: string[];
  /** Teglarning to'liq matni — ichida reklama nomi bo'lishi mumkin. */
  tegMatnlari: string[];
  nomMatnlari: string[];
  /** Topilgan ID lar bizdagi Facebook jadvallariga mos keldimi. */
  idMosligi: { nomdan: IdMatch; tegdan: IdMatch };
  /** Lead ID qayerdan o'qiladi: maxsus maydon, lid nomi yoki teg. */
  manba: 'field' | 'name' | 'tag';
  atribusiya: {
    utm_term: number;
    utm_campaign: number;
    utm_content: number;
    utm_source: number;
    fbclid: number;
  };
  tanlangan: string | null;
}


/** Lead Ads bo'limi holati (`GET /api/workspace/lead-ads`). */
export interface LeadAdsStatus {
  tokenBor: boolean;
  lidlar: { jami: number; leadIdBor: number; reklamagaBoglangan: number };
  yechilgan: { ok: number; reklamaliOk: number; xato: number };
  oxirgiXato: string | null;
}


/** `GET /api/workspace/amocrm-webhooks` — faqat o'qiydi. */
export interface WebhookRoyxat {
  jami: number;
  bizniki: number;
  yetishmayotgan: string[];
  xulosa: string;
  webhooklar: Array<{
    id: number | null;
    manzil: string;
    bizniki: boolean;
    hodisalar: string[];
    ochirilgan: boolean;
  }>;
}

/** `POST /api/workspace/amocrm-webhook` — ta'minlash natijasi. */
export interface WebhookTamin {
  holat: 'bor' | 'qoshildi' | 'xato';
  manzil: string | null;
  hodisalar: string[];
  begona: Array<{ host: string; hodisalar: string[] }>;
  xabar: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   TELEGRAM — hisobot va sotuv xabari

   ⚠ Bot tokeni bu tiplarda YO'Q va bo'lmaydi: u faqat serverning
   .env ida (§4.1). Frontend faqat "sozlangan / sozlanmagan" ni biladi.
   ═══════════════════════════════════════════════════════════════════════ */

export interface TelegramMetrika {
  kalit: string;
  yorliq: string;
  tur: string;
}

export interface TelegramChat {
  id: string;
  chat_id: string;
  nom: string | null;
  tur: string | null;
  /** 'HH:MM:SS' yoki null — hisobot o'chirilgan. */
  hisobot_vaqti: string | null;
  vaqt_zonasi: string;
  hisobot_davri: string;
  metrikalar: string[];
  tafsilot: string;
  tafsilot_soni: number;
  sotuv_xabari: boolean;
  faol: boolean;
  oxirgi_xato: string | null;
  oxirgi_yuborildi: string | null;
  oxirgi_hisobot: string | null;
}

export interface TelegramHolat {
  botSozlangan: boolean;
  botNomi: string | null;
  webhook: {
    manzil: string | null;
    kutilayotgan: number;
    oxirgiXato: string | null;
    /** `allowed_updates` — bo'sh bo'lsa "hammasi". */
    turlar: string[];
    /** Kerakli, lekin obuna bo'linmagan turlar. Kanal shu yerdan buziladi. */
    yetishmayotgan: string[];
  };
  chatlar: TelegramChat[];
  metrikalar: TelegramMetrika[];
  davrlar: string[];
  tafsilotlar: string[];
}

export interface TelegramKod {
  kod: string;
  daqiqa: number;
  botNomi: string | null;
  havola: string | null;
  guruhUchun: string;
}
