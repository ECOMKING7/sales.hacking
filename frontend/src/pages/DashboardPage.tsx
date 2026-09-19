import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Search, X } from 'lucide-react';
import { dashboardApi, facebookApi, amocrmApi } from '../services/api';
import KpiCard from '../components/KpiCard';
import PeriodLabel from '../components/PeriodLabel';
import SourceDonut from '../components/dashboard/SourceDonut';
import EntityTable, { View, QuickFilter } from '../components/dashboard/EntityTable';
import TopPerformers from '../components/dashboard/TopPerformers';
import AdAccountSelector from '../components/dashboard/AdAccountSelector';
import DateRangePicker from '../components/dashboard/DateRangePicker';
import ColumnsButton from '../components/dashboard/ColumnsButton';
import BreakdownButton from '../components/dashboard/BreakdownButton';
import { loadVisibleColumns, saveVisibleColumns } from '../components/dashboard/columns';
import { PresetId, rangeForPreset } from '../utils/dateRanges';
import { formatMoney, formatPercent, formatRoas, formatDays, n } from '../utils/format';
import { Button, Input, cn } from '../components/ui';

type Model = 'first_click' | 'last_click';

interface KpiSpec {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  /** Sahifadagi yagona asosiy javob — ROAS */
  hero?: boolean;
}

const PILLS: Array<{ id: QuickFilter; label: string }> = [
  { id: 'all', label: 'All ads' },
  { id: 'active', label: 'Active ads' },
  { id: 'delivery', label: 'Had delivery' },
];

const VIEW_TABS: Array<{ id: View; label: string }> = [
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'adsets', label: 'Ad sets' },
  { id: 'ads', label: 'Ads' },
];

/** Tanlagich chipi — tanlangani havorang, tanlanmagani neytral. */
const chip = (active: boolean, disabled = false) =>
  cn(
    'rounded-sm border-[1.5px] px-3 py-1.5 text-sm font-semibold',
    'transition-[box-shadow,background-color,border-color,color] duration-200',
    active
      ? 'border-edge bg-tint text-accent'
      : disabled
        ? 'cursor-not-allowed border-line text-ink-3'
        : 'border-line text-ink-2 hover:text-accent'
  );

export default function DashboardPage() {
  const [preset, setPreset] = useState<PresetId>('last30');
  const [range, setRange] = useState(() => rangeForPreset('last30'));
  const [model, setModel] = useState<Model>('last_click');

  const [view, setView] = useState<View>('campaigns');

  // Tanlangan kampaniya/ad set'lar — Ads Manager naqshi. Map, Set emas:
  // yorliqdagi chip tanlangan yagona element NOMINI ko'rsatadi, id emas.
  const [selCampaigns, setSelCampaigns] = useState<Map<string, string>>(new Map());
  const [selAdsets, setSelAdsets] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('all');
  const [columns, setColumns] = useState<string[]>(loadVisibleColumns);

  const fbStatus = useQuery({ queryKey: ['fb-status'], queryFn: facebookApi.status });
  const adAccountId = fbStatus.data?.adAccountId ?? null;

  const overview = useQuery({
    // Ad account kalitga kiradi: aks holda akkaunt almashtirilganda React Query
    // eski javobni qaytaraveradi (staleTime 5 daqiqa) va dashboard boshqa
    // akkauntning raqamlarini ko'rsatadi.
    queryKey: ['overview', adAccountId, range.from, range.to, model],
    queryFn: () => dashboardApi.overview(range.from, range.to),
    staleTime: 5 * 60 * 1000,
  });

  // Akkaunt almashganda: drill holati eski akkauntning kampaniya/adset'iga
  // ishora qilib turardi — shuning uchun "No ads found" chiqardi. Tozalaymiz
  // va butun keshni bekor qilamiz.
  const queryClient = useQueryClient();
  const prevAccount = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevAccount.current === undefined) {
      prevAccount.current = adAccountId;
      return;
    }
    if (prevAccount.current === adAccountId) return;
    prevAccount.current = adAccountId;
    setView('campaigns');
    setSelCampaigns(new Map());
    setSelAdsets(new Map());
    setSearch('');
    void queryClient.invalidateQueries();
  }, [adAccountId, queryClient]);

  const crmStatus = useQuery({ queryKey: ['amocrm-status'], queryFn: amocrmApi.status });
  const setupIncomplete =
    !fbStatus.isLoading &&
    !crmStatus.isLoading &&
    !fbStatus.data?.connected &&
    !crmStatus.data?.connected;

  const d = overview.data;
  const loading = overview.isLoading;
  const metaPct = d && d.revenue > 0 ? Math.round((d.revenueBySource.metaAds / d.revenue) * 100) : 0;

  /**
   * Ikki valyuta, ikki manba. Chalkashtirmaslik uchun har raqam qaysi
   * tomondan kelganiga qarab belgilanadi:
   *   fbVal  — Facebook aytgan pul: xarajat va undan kelib chiqqan hamma narsa
   *   crmVal — CRM aytgan pul: daromad va undan kelib chiqqan hamma narsa
   * Hali ma'lum bo'lmasa (sinxrondan oldin) — null, belgisiz raqam chiqadi.
   */
  const fbVal = d?.currency?.fb ?? null;
  const crmVal = d?.currency?.crm ?? null;

  const cards: KpiSpec[] = [
    { title: 'Amount Spent', value: formatMoney(d?.amountSpent, fbVal) },
    {
      title: 'Revenue',
      value: formatMoney(d?.revenue, crmVal),
      subtitle: `${metaPct}% from Meta Ads`,
    },
    {
      title: 'ROAS',
      value: formatRoas(d?.roas),
      // Valyuta mos kelmasa qiymat "—" bo'ladi; sababsiz "—" esa
      // "ma'lumot yo'q" deb tushuniladi, shuning uchun sabab shu yerda.
      subtitle: d?.currency?.mismatch ? d.currency.reason ?? undefined : undefined,
      hero: true,
    },
    // CAC = xarajat / sotuv → xarajat valyutasida.
    { title: 'CAC', value: formatMoney(d?.cac, fbVal) },
    { title: 'Conversion Rate', value: formatPercent(d?.conversionRate) },
    { title: 'Deal Time', value: formatDays(d?.dealTime) },
    // ARPL = daromad / lid → daromad valyutasida. Bu yerda `$` turgan edi.
    { title: 'ARPL', value: formatMoney(d?.arpl, crmVal) },
    {
      title: 'Revenue Growth',
      value: formatPercent(d?.revenueGrowth),
      // Yagona sanaga bog'liq katak: tanlangan oraliq ↔ undan oldingi
      // teng oraliq. Qolgan kataklar butun davr.
      subtitle: `tanlangan oraliq vs oldingi`,
      trend: n(d?.revenueGrowth),
    },
  ];

  const updateColumns = (keys: string[]) => {
    setColumns(keys);
    saveVisibleColumns(keys);
  };

  const campaignIds = [...selCampaigns.keys()];
  const adsetIds = [...selAdsets.keys()];

  /** Hozirgi ko'rinishdagi tanlov to'plami. Ads darajasida tanlash yig'ilmaydi
   *  — undan pastda daraja yo'q, shuning uchun bo'sh Map beriladi. */
  const currentSelection =
    view === 'campaigns' ? selCampaigns : view === 'adsets' ? selAdsets : new Map<string, string>();

  const setCurrent = (next: Map<string, string>) => {
    if (view === 'campaigns') {
      setSelCampaigns(next);
      // Kampaniya tanlovi o'zgarsa, eski ad set tanlovi endi boshqa
      // kampaniyaga tegishli bo'lishi mumkin — tozalaymiz, aks holda
      // "Ads" yorlig'i mos kelmaydigan reklamalarni ko'rsatardi.
      setSelAdsets(new Map());
    } else if (view === 'adsets') {
      setSelAdsets(next);
    }
  };

  const toggleRow = (row: { id: string; name: string }, checked: boolean) => {
    const next = new Map(currentSelection);
    if (checked) next.set(row.id, row.name);
    else next.delete(row.id);
    setCurrent(next);
  };

  const toggleAll = (rows: Array<{ id: string; name: string }>, checked: boolean) => {
    const next = new Map(currentSelection);
    for (const r of rows) {
      if (checked) next.set(r.id, r.name);
      else next.delete(r.id);
    }
    setCurrent(next);
  };

  // Nom bosilganda: faqat o'shani tanlab, bir daraja pastga o'tamiz —
  // Ads Manager ham shunday qiladi.
  const handleDrill = (sel: { id: string; name: string }) => {
    if (view === 'campaigns') {
      setSelCampaigns(new Map([[sel.id, sel.name]]));
      setSelAdsets(new Map());
      setView('adsets');
    } else if (view === 'adsets') {
      setSelAdsets(new Map([[sel.id, sel.name]]));
      setView('ads');
    }
  };

  /**
   * Filtrga mos BARCHA elementni tanlaydi — sahifalardan tashqari ham.
   *
   * Sarlavhadagi katakcha faqat ko'rinib turgan 50 qatorni belgilaydi.
   * Ro'yxat 247 ta bo'lsa, foydalanuvchi "hammasini tanladim" deb o'ylab
   * qolishi mumkin. Shuning uchun alohida, ataylab bosiladigan amal.
   */
  const selectAllMatching = async () => {
    if (view === 'ads') return; // ads darajasida tanlov ishlatilmaydi
    const params: Record<string, string> = { level: view };
    if (view === 'adsets' && campaignIds.length > 0) params.campaignIds = campaignIds.join(',');
    const all = await dashboardApi.entityIds(params);
    setCurrent(new Map(all.map((r) => [r.id, r.name ?? '—'])));
  };

  const clearSelection = (level: View) => {
    if (level === 'campaigns') {
      setSelCampaigns(new Map());
      setSelAdsets(new Map());
    } else if (level === 'adsets') {
      setSelAdsets(new Map());
    }
  };

  /** Yorliq yozuvi: bitta tanlansa nomi, ko'p bo'lsa soni. */
  const tabChipLabel = (sel: Map<string, string>) =>
    sel.size === 1 ? [...sel.values()][0] : `${sel.size} tanlandi`;

  return (
    <div className="space-y-5">
      {setupIncomplete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-[1.5px] border-warn/30 bg-warn/12 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-warn">
            <AlertTriangle aria-hidden className="h-4 w-4 flex-none" />
            Setup incomplete — connect Facebook Ads and your CRM to see real data.
          </div>
          <Link
            to="/onboarding"
            className="inline-flex h-8 items-center rounded-sm border-[1.5px] border-edge bg-surface px-3 text-xs font-semibold text-accent transition-shadow duration-200 hover:shadow-glow-xs"
          >
            Finish setup
          </Link>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2">
          <h1 className="text-xl font-bold text-ink">Dashboard</h1>
          {/* Raqamlar butun davrni qamraydi — sana yozilmasa
              foydalanuvchi buni "shu oy" deb o'qiydi. */}
          <PeriodLabel window={d?.window} />
        </div>
        <AdAccountSelector />

        {/* Yorliqlar + tanlov chiplari (Ads Manager naqshi).
            Yorliq hech qachon bloklanmaydi: hech narsa tanlanmagan bo'lsa
            shu darajaning hammasi ko'rinadi. */}
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {VIEW_TABS.map((t) => {
            const sel = t.id === 'campaigns' ? selCampaigns : t.id === 'adsets' ? selAdsets : null;
            return (
              <div key={t.id} className="inline-flex items-center">
                <button
                  onClick={() => setView(t.id)}
                  aria-pressed={view === t.id}
                  className={cn(chip(view === t.id), sel && sel.size > 0 && 'rounded-r-none')}
                >
                  {t.label}
                </button>
                {sel && sel.size > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-r-sm border-[1.5px] border-l-0 border-edge bg-tint px-2 py-1.5 text-sm font-semibold text-accent"
                    title={[...sel.values()].join(', ')}
                  >
                    <span className="max-w-[10rem] truncate">{tabChipLabel(sel)}</span>
                    <button
                      onClick={() => clearSelection(t.id)}
                      aria-label={`${t.label} tanlovini tozalash`}
                      className="rounded-[3px] text-accent/70 hover:text-accent"
                    >
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="w-48">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            aria-label="Search by name"
            icon={<Search className="h-4 w-4" />}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* ⚠ Sana tanlagichi hozircha FAQAT "Revenue Growth" ga ta'sir
              qiladi. Xarajat, natija va daromad butun davr bo'yicha
              keladi, chunki `campaigns.spend` vaqt bo'yicha bo'linmagan
              (bitta ustun, oxirgi sync qiymati).

              Tanlagich olib tashlanmadi: o'sish ko'rsatkichi unga
              tayanadi. Lekin hech narsani filtrlamayotgan boshqaruv —
              jim yolg'on, shuning uchun yorliq ochiq yozib qo'yilgan.
              To'liq yechim: kunlik buketlar (ad_insights_daily). */}
          <span
            className="hidden text-xs text-ink-3 sm:inline"
            title="Xarajat va daromad butun davr bo'yicha. Sana oralig'i faqat o'sish ko'rsatkichiga ta'sir qiladi."
          >
            sana → faqat o'sish
          </span>
          <DateRangePicker
            value={range}
            preset={preset}
            onChange={(r, p) => {
              setRange(r);
              setPreset(p);
            }}
          />
          <ColumnsButton visible={columns} onChange={updateColumns} />
          <BreakdownButton />
        </div>
      </div>

      {/* ── Quick-filter pills + attribution model ── */}
      <div className="flex flex-wrap items-center gap-2">
        {PILLS.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            aria-pressed={filter === p.id}
            className={chip(filter === p.id)}
          >
            {p.label}
          </button>
        ))}
        <Button variant="ghost" size="sm">
          + See more
        </Button>

        <div className="ml-auto inline-flex items-center gap-1.5">
          {(['first_click', 'last_click'] as Model[]).map((m) => (
            <button
              key={m}
              onClick={() => setModel(m)}
              aria-pressed={model === m}
              className={chip(model === m)}
            >
              {m === 'first_click' ? 'First click' : 'Last click'}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards (full width) ── */}
      {overview.isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border-[1.5px] border-line bg-surface px-4 py-3">
          <p className="text-sm text-bad">Failed to load overview metrics.</p>
          <Button variant="secondary" size="sm" onClick={() => void overview.refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map((c) => (
            <KpiCard
              key={c.title}
              title={c.title}
              value={c.value}
              subtitle={c.subtitle}
              trend={c.trend}
              loading={loading}
              hero={c.hero}
            />
          ))}
        </div>
      )}

      {/* ── Full-width data table ── */}
      <EntityTable
        view={view}
        campaignIds={campaignIds}
        adsetIds={adsetIds}
        search={search}
        filter={filter}
        visibleColumns={columns}
        selected={currentSelection}
        onToggle={toggleRow}
        onToggleAll={toggleAll}
        onSelectAllMatching={selectAllMatching}
        onClearSelection={() => clearSelection(view)}
        onDrill={handleDrill}
      />

      {/* ── Donut + Top Performers below ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SourceDonut data={d?.revenueBySource} loading={loading} crmCurrency={crmVal} />
        <div className="lg:col-span-2">
          <TopPerformers crmCurrency={crmVal} />
        </div>
      </div>
    </div>
  );
}
