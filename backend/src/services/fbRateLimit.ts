/* ═══════════════════════════════════════════════════════════════
   Facebook rate limit hisobi

   Har Graph javobida FB limit sarfini sarlavhalarda yuboradi. Ilgari biz
   ularni o'qimasdik, shuning uchun "code 17" kelganda faqat "juda ko'p
   chaqiruv" degan gap qolardi — qancha, qachon bo'shashi noma'lum.

   Uchta sarlavha:
     x-app-usage               — butun app bo'yicha (%)
     x-ad-account-usage        — ad account bo'yicha (%) + tier
     x-business-use-case-usage — biznes/ad account kesimida, eng foydalisi:
                                 call_count va estimated_time_to_regain_access

   Barcha qiymatlar FOIZ (0–100), chaqiruvlar soni emas. Facebook aniq
   sonni bermaydi — faqat limitning necha foizi ishlatilganini.
   ═══════════════════════════════════════════════════════════════ */

export interface FbUsage {
  /** App bo'yicha limitning necha foizi ishlatilgan */
  appCallPct: number | null;
  appCpuPct: number | null;
  /** Ad account bo'yicha foiz va limit qayta tiklanish oynasi (soniya) */
  adAccountPct: number | null;
  adAccountResetSec: number | null;
  /** 'development_access' | 'standard_access' — limit hajmini shu belgilaydi */
  accessTier: string | null;
  /** Business use case kesimidagi eng yuqori foizlar */
  bucCallPct: number | null;
  bucCpuPct: number | null;
  /** Bloklangan bo'lsa: necha daqiqadan keyin ochiladi */
  regainMinutes: number | null;
  /** Oxirgi o'qilgan vaqt */
  at: string | null;
}

const EMPTY: FbUsage = {
  appCallPct: null,
  appCpuPct: null,
  adAccountPct: null,
  adAccountResetSec: null,
  accessTier: null,
  bucCallPct: null,
  bucCpuPct: null,
  regainMinutes: null,
  at: null,
};

let last: FbUsage = { ...EMPTY };

function parse(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Javob sarlavhalaridan limit holatini o'qiydi va saqlaydi.
 * Har Graph chaqiruvidan keyin chaqiriladi; xato bo'lsa ham (FB limit
 * sarlavhalarini xato javobda ham yuboradi).
 */
export function recordUsage(headers: Record<string, unknown> | undefined): void {
  if (!headers) return;

  const app = parse(headers['x-app-usage']);
  const acct = parse(headers['x-ad-account-usage']);
  const buc = parse(headers['x-business-use-case-usage']);

  const next: FbUsage = { ...last, at: new Date().toISOString() };

  if (app) {
    next.appCallPct = numOrNull(app.call_count);
    next.appCpuPct = numOrNull(app.total_cputime);
  }
  if (acct) {
    next.adAccountPct = numOrNull(acct.acc_id_util_pct);
    next.adAccountResetSec = numOrNull(acct.reset_time_duration);
    next.accessTier =
      typeof acct.ads_api_access_tier === 'string' ? acct.ads_api_access_tier : next.accessTier;
  }
  if (buc) {
    // Kalit — biznes yoki ad account ID; qiymat massiv. Eng yomon holatni olamiz.
    let call: number | null = null;
    let cpu: number | null = null;
    let regain: number | null = null;
    for (const entries of Object.values(buc)) {
      if (!Array.isArray(entries)) continue;
      for (const e of entries as Array<Record<string, unknown>>) {
        const c = numOrNull(e.call_count);
        const p = numOrNull(e.total_cputime);
        const r = numOrNull(e.estimated_time_to_regain_access);
        if (c !== null && (call === null || c > call)) call = c;
        if (p !== null && (cpu === null || p > cpu)) cpu = p;
        if (r !== null && (regain === null || r > regain)) regain = r;
      }
    }
    next.bucCallPct = call;
    next.bucCpuPct = cpu;
    next.regainMinutes = regain;
  }

  last = next;
}

/** Oxirgi o'qilgan limit holati. Hech qachon chaqiruv bo'lmagan bo'lsa — bo'sh. */
export function fbUsage(): FbUsage {
  return { ...last };
}

/** Xato xabariga qo'shish uchun qisqa satr. Ma'lumot yo'q bo'lsa — bo'sh. */
export function usageSummary(): string {
  const u = last;
  const bits: string[] = [];
  if (u.bucCallPct !== null) bits.push(`use case ${u.bucCallPct}%`);
  if (u.adAccountPct !== null) bits.push(`ad account ${u.adAccountPct}%`);
  if (u.appCallPct !== null) bits.push(`app ${u.appCallPct}%`);
  if (u.regainMinutes) bits.push(`${u.regainMinutes} daq kutish`);
  if (u.accessTier) bits.push(u.accessTier);
  return bits.join(' · ');
}
