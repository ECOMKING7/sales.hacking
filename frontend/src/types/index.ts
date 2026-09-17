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

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totals?: EntityTotals;
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
