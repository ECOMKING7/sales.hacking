import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import type {
  AuthResponse,
  User,
  Workspace,
  FbStatus,
  AdAccount,
  AmocrmStatus,
  MetaCapiStatus,
  Pipeline,
  EntityRow,
  Paginated,
  WonDeal,
  LeadDetailData,
  Usage,
  Member,
  CurrencyState,
  FieldReport,
  LeadAdsStatus,
  TelegramHolat,
  TelegramChat,
  TelegramKod,
  WebhookRoyxat,
  WebhookTamin,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
});

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear auth and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ---- Auth ----
export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/api/auth/login', { email, password }).then((r) => r.data),
  register: (name: string, email: string, password: string) =>
    api.post<AuthResponse>('/api/auth/register', { name, email, password }).then((r) => r.data),
  me: () =>
    api.get<{ user: User; workspaces: Workspace[] }>('/api/auth/me').then((r) => r.data),
  logout: () => api.post('/api/auth/logout').then((r) => r.data),
};

// ---- Facebook ----
export const facebookApi = {
  connect: () => api.get<{ url: string }>('/api/auth/facebook/connect').then((r) => r.data),
  status: () => api.get<FbStatus>('/api/workspace/fb-status').then((r) => r.data),
  adAccounts: () =>
    api.get<{ adAccounts: AdAccount[] }>('/api/workspace/ad-accounts').then((r) => r.data),
  fbAdAccounts: () =>
    api.get<{ adAccounts: AdAccount[] }>('/api/workspace/fb-ad-accounts').then((r) => r.data),
  selectAdAccount: (adAccountId: string) =>
    api.post('/api/workspace/select-ad-account', { adAccountId }).then((r) => r.data),
};

// ---- AmoCRM ----
export const amocrmApi = {
  connect: () => api.get<{ url: string }>('/api/auth/amocrm/connect').then((r) => r.data),
  /**
   * Xususiy integratsiyani qo'lda ulash. Kalitlar ixtiyoriy: yuborilsa
   * shu workspace uchun saqlanadi (har mijozning o'z integratsiyasi),
   * yuborilmasa .env dagi umumiy kalitlar ishlatiladi.
   */
  manualConnect: (payload: {
    code: string;
    domain: string;
    clientId?: string;
    clientSecret?: string;
  }) =>
    api
      .post<{ success: boolean; domain: string }>('/api/auth/amocrm/manual', payload)
      .then((r) => r.data),
  status: () => api.get<AmocrmStatus>('/api/workspace/amocrm-status').then((r) => r.data),

  /** Webhook ro'yxati — faqat o'qiydi. */
  webhooks: () =>
    api.get<WebhookRoyxat>('/api/workspace/amocrm-webhooks').then((r) => r.data),

  /**
   * ⚠ CRM ga YOZADI: o'z webhook'imizni ro'yxatdan o'tkazadi.
   * Idempotent — bor bo'lsa hech narsa yozilmaydi. Hech narsa o'chirilmaydi.
   */
  ensureWebhook: () =>
    api.post<WebhookTamin>('/api/workspace/amocrm-webhook').then((r) => r.data),
  pipelines: () =>
    api.get<{ pipelines: Pipeline[] }>('/api/workspace/amocrm-pipelines').then((r) => r.data),
  savePipeline: (payload: {
    pipelineId: string;
    wonStageId: string;
    wonPairs?: string[];
    qualifiedPairs?: string[];
    leadPairs?: string[];
  }) => api.post('/api/workspace/amocrm-pipeline', payload).then((r) => r.data),
  /**
   * Maydon tahlili: qaysi amoCRM maydoni Meta Lead ID ni saqlaydi va
   * UTM/fbclid nechta lidda to'ldirilgan. Faqat o'qish.
   */
  fields: () => api.get<FieldReport>('/api/workspace/amocrm-fields').then((r) => r.data),
  saveLeadIdField: (payload: {
    fieldId: string | null;
    source?: 'field' | 'name' | 'tag';
    lineField?: string | null;
    adLines?: string[];
  }) =>
    api
      .post<{ success: boolean; fieldId: string | null }>(
        '/api/workspace/amocrm-lead-id-field',
        payload
      )
      .then((r) => r.data),
};

// ---- Meta Conversions API ----
export const leadAdsApi = {
  status: () => api.get<LeadAdsStatus>('/api/workspace/lead-ads').then((r) => r.data),
  /** '' — tokenni o'chiradi. Javobdagi `sinov` — saqlangach darhol qilingan sinov natijasi. */
  saveToken: (token: string) =>
    api
      .post<{ success: boolean; tokenBor: boolean; sinov?: string }>(
        '/api/workspace/lead-ads/token',
        { token }
      )
      .then((r) => r.data),
  yech: (limit = 50) =>
    api
      .post<{
        korildi: number;
        yechildi: number;
        reklamagaBoglandi: number;
        reklamasiz: number;
        xatolar: string[];
        izoh: string;
      }>(`/api/workspace/lead-ads/yech?limit=${limit}`)
      .then((r) => r.data),
};

export const metaCapiApi = {
  status: () => api.get<MetaCapiStatus>('/api/workspace/meta-capi').then((r) => r.data),
  save: (payload: {
    datasetId?: string | null;
    enabled?: boolean;
    currency?: string;
    phoneCountryCode?: string;
    secretKey?: string | null;
    /** Meta CAPI tokeni. Shifrlanib saqlanadi, qaytarilmaydi. '' — o'chirish. */
    token?: string;
    eventLead?: string;
    eventQualified?: string;
    eventPurchase?: string;
  }) =>
    api
      .post<{ success: boolean; warning: string | null }>('/api/workspace/meta-capi', payload)
      .then((r) => r.data),

  /**
   * Sinov hodisasi. Hech narsani saqlamaydi — Meta'ga bitta hodisa
   * yuboradi va javobini aynan qaytaradi. `testEventCode` Events
   * Manager > Test Events tabidan olinadi; usiz hodisa haqiqiy
   * statistikaga tushib ketardi.
   */
  test: (testEventCode: string, stage?: 'lead' | 'qualified' | 'purchase') =>
    api
      .post<{
        yuborildi: boolean;
        javob: string;
        event_name: string;
        dataset_id: string;
        test_event_code: string;
      }>('/api/workspace/meta-capi/test', { testEventCode, stage })
      .then((r) => r.data),
};

// ---- Dashboard ----
export interface DashboardOverview {
  amountSpent: number;
  /**
   * null — hisoblab bo'lmadi. Sana tanlanganda CRM ko'rsatkichlari shunday:
   * xarajat tanlangan kunlarniki, daromad esa butun davrniki — ikkisini
   * bo'lish ma'nosiz raqam beradi. 0 bilan aralashtirmang.
   */
  revenue: number | null;
  /** null — valyutalar mos emas yoki sana rejimi. 0 bilan aralashtirmang. */
  roas: number | null;
  currency?: CurrencyState;
  cac: number | null;
  conversionRate: number | null;
  dealTime: number | null;
  arpl: number | null;
  vaqt?: {
    rejim: 'kunlik' | 'butun_davr';
    from: string | null;
    to: string | null;
    qamrov: { start: string | null; end: string | null };
    izoh: string;
  };
  revenueGrowth: number;
  revenueBySource: { metaAds: number; direct: number; igOrganic: number; fbOrganic: number };
  /** Raqamlar qamragan davr (FB insights date_start/date_stop). */
  window?: { start: string | null; end: string | null };
}

export type TopMetric = 'roas' | 'revenue' | 'sales';

export const dashboardApi = {
  overview: (from?: string, to?: string) =>
    api
      .get<DashboardOverview>('/api/dashboard/overview', { params: { from, to } })
      .then((r) => r.data),
  campaigns: (params?: Record<string, string>) =>
    api
      .get<Paginated<EntityRow>>('/api/dashboard/campaigns', { params })
      .then((r) => r.data),
  // Ko'p tanlash: `campaignIds` / `adsetIds` — vergul bilan ajratilgan ro'yxat.
  // Bo'sh bo'lsa filtr qo'llanmaydi va hammasi qaytadi.
  adsets: (params?: Record<string, string>) =>
    api.get<Paginated<EntityRow>>('/api/dashboard/adsets', { params }).then((r) => r.data),
  ads: (params?: Record<string, string>) =>
    api.get<Paginated<EntityRow>>('/api/dashboard/ads', { params }).then((r) => r.data),
  // Sahifalashsiz id + nom — "barcha N tasini tanlash" uchun.
  entityIds: (params: Record<string, string>) =>
    api
      .get<{ ids: Array<{ id: string; name: string | null }> }>('/api/dashboard/entity-ids', {
        params,
      })
      .then((r) => r.data.ids),
  campaignAdsets: (campaignId: string, params?: Record<string, string>) =>
    api
      .get<Paginated<EntityRow>>(`/api/dashboard/campaigns/${campaignId}/adsets`, { params })
      .then((r) => r.data),
  adsetAds: (adsetId: string, params?: Record<string, string>) =>
    api
      .get<Paginated<EntityRow>>(`/api/dashboard/adsets/${adsetId}/ads`, { params })
      .then((r) => r.data),
  topCampaigns: (metric: TopMetric) =>
    api
      .get<{ data: EntityRow[] }>('/api/dashboard/top-campaigns', { params: { metric } })
      .then((r) => r.data.data),
  topAdsets: (metric: TopMetric) =>
    api
      .get<{ data: EntityRow[] }>('/api/dashboard/top-adsets', { params: { metric } })
      .then((r) => r.data.data),
  topAds: (metric: TopMetric) =>
    api
      .get<{ data: EntityRow[] }>('/api/dashboard/top-ads', { params: { metric } })
      .then((r) => r.data.data),
  wonDeals: (params?: Record<string, string | number>) =>
    api
      .get<Paginated<WonDeal>>('/api/dashboard/won-deals', { params })
      .then((r) => r.data),
  leadDetail: (leadId: string) =>
    api.get<LeadDetailData>(`/api/dashboard/leads/${leadId}`).then((r) => r.data),
};

// ---- Sync / import ----
export interface ImportChunk {
  success: boolean;
  page: number;
  /** null — tugadi. */
  nextPage: number | null;
  leads: number;
  updated: number;
  qualified: number;
  won: number;
  contacts: number;
  amoRequests: number;
  errors: number;
}

export const syncApi = {
  /**
   * amoCRM tarixini import qiladi — bitta chaqiruv = bitta sahifa (250 lid).
   * Serverless funksiya uzoq ishlay olmaydi, shuning uchun sahifalarni
   * chaqiruvchi aylantiradi.
   */
  amocrmImport: (payload: { days?: number; page?: number }) =>
    api.post<ImportChunk>('/api/sync/amocrm-import', payload).then((r) => r.data),
};

// ---- Workspace / SaaS ----
export const workspaceApi = {
  usage: () => api.get<Usage>('/api/workspace/usage').then((r) => r.data),
  members: () =>
    api.get<{ members: Member[] }>('/api/workspace/members').then((r) => r.data.members),
  invite: (email: string, role?: string) =>
    api.post('/api/workspace/invite', { email, role }).then((r) => r.data),
  removeMember: (userId: string) =>
    api.delete(`/api/workspace/members/${userId}`).then((r) => r.data),
  list: () =>
    api.get<{ workspaces: (Workspace & { role: string })[] }>('/api/workspace/list').then((r) => r.data),
  create: (name: string) =>
    api.post<{ token: string; workspace: Workspace }>('/api/workspace/create', { name }).then((r) => r.data),
  switch: (id: string) =>
    api.post<{ token: string; workspace: Workspace }>(`/api/workspace/switch/${id}`).then((r) => r.data),
};

// ---- Attribution ----
export const attributionApi = {
  reprocess: (leadId: string, model?: string) =>
    api
      .post(`/api/attribution/reprocess/${leadId}`, model ? { model } : {})
      .then((r) => r.data),
};

// ---- Telegram: hisobot + sotuv xabari ----
// Bot tokeni bu yerdan O'TMAYDI — u faqat serverning .env ida (§4.1).
export const telegramApi = {
  status: () => api.get<TelegramHolat>('/api/workspace/telegram').then((r) => r.data),
  /** Bir martalik ulanish kodi (15 daqiqa). */
  kod: () => api.post<TelegramKod>('/api/workspace/telegram/kod').then((r) => r.data),
  /** Telegram'ga webhook manzilini aytadi. Idempotent. */
  webhook: () =>
    api
      .post<{ ok: boolean; manzil: string; xato: string | null }>(
        '/api/workspace/telegram/webhook'
      )
      .then((r) => r.data),
  yangila: (id: string, payload: Partial<TelegramChat>) =>
    api.patch<TelegramChat>(`/api/workspace/telegram/chat/${id}`, payload).then((r) => r.data),
  ochir: (id: string) =>
    api.delete(`/api/workspace/telegram/chat/${id}`).then((r) => r.data),
  /** Aynan rejali hisobotning o'zini yuboradi — boshqa matn emas. */
  sinov: (id: string) =>
    api
      .post<{ success: boolean; xato: string | null }>(
        `/api/workspace/telegram/chat/${id}/sinov`
      )
      .then((r) => r.data),
};
