import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Search } from 'lucide-react';
import { dashboardApi, facebookApi, amocrmApi } from '../services/api';
import KpiCard from '../components/KpiCard';
import SourceDonut from '../components/dashboard/SourceDonut';
import EntityTable, { View, Sel, QuickFilter } from '../components/dashboard/EntityTable';
import TopPerformers from '../components/dashboard/TopPerformers';
import AdAccountSelector from '../components/dashboard/AdAccountSelector';
import DateRangePicker from '../components/dashboard/DateRangePicker';
import ColumnsButton from '../components/dashboard/ColumnsButton';
import BreakdownButton from '../components/dashboard/BreakdownButton';
import { loadVisibleColumns, saveVisibleColumns } from '../components/dashboard/columns';
import { PresetId, rangeForPreset } from '../utils/dateRanges';
import { formatCurrency, formatPercent, formatRoas, formatDays, n } from '../utils/format';
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
  const [campaign, setCampaign] = useState<Sel>(null);
  const [adset, setAdset] = useState<Sel>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('all');
  const [columns, setColumns] = useState<string[]>(loadVisibleColumns);

  const overview = useQuery({
    queryKey: ['overview', range.from, range.to, model],
    queryFn: () => dashboardApi.overview(range.from, range.to),
    staleTime: 5 * 60 * 1000,
  });

  const fbStatus = useQuery({ queryKey: ['fb-status'], queryFn: facebookApi.status });
  const crmStatus = useQuery({ queryKey: ['amocrm-status'], queryFn: amocrmApi.status });
  const setupIncomplete =
    !fbStatus.isLoading &&
    !crmStatus.isLoading &&
    !fbStatus.data?.connected &&
    !crmStatus.data?.connected;

  const d = overview.data;
  const loading = overview.isLoading;
  const metaPct = d && d.revenue > 0 ? Math.round((d.revenueBySource.metaAds / d.revenue) * 100) : 0;

  const cards: KpiSpec[] = [
    { title: 'Amount Spent', value: formatCurrency(d?.amountSpent) },
    { title: 'Revenue', value: formatCurrency(d?.revenue), subtitle: `${metaPct}% from Meta Ads` },
    { title: 'ROAS', value: formatRoas(d?.roas), hero: true },
    { title: 'CAC', value: formatCurrency(d?.cac) },
    { title: 'Conversion Rate', value: formatPercent(d?.conversionRate) },
    { title: 'Deal Time', value: formatDays(d?.dealTime) },
    { title: 'ARPL', value: formatCurrency(d?.arpl) },
    {
      title: 'Revenue Growth',
      value: formatPercent(d?.revenueGrowth),
      subtitle: `${n(d?.revenueGrowth) >= 0 ? '+' : ''}${formatPercent(d?.revenueGrowth)} vs prev`,
      trend: n(d?.revenueGrowth),
    },
  ];

  const updateColumns = (keys: string[]) => {
    setColumns(keys);
    saveVisibleColumns(keys);
  };

  // Drill one level down from the current view.
  const handleDrill = (sel: { id: string; name: string }) => {
    if (view === 'campaigns') {
      setCampaign(sel);
      setAdset(null);
      setView('adsets');
    } else if (view === 'adsets') {
      setAdset(sel);
      setView('ads');
    }
  };

  const switchTab = (target: View) => {
    if (target === 'adsets' && !campaign) return;
    if (target === 'ads' && !adset) return;
    setView(target);
  };

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
        <h1 className="mr-2 text-xl font-bold text-ink">Dashboard</h1>
        <AdAccountSelector />

        {/* View tab switcher */}
        <div className="inline-flex items-center gap-1.5">
          {VIEW_TABS.map((t) => {
            const disabled = (t.id === 'adsets' && !campaign) || (t.id === 'ads' && !adset);
            return (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                disabled={disabled}
                aria-pressed={view === t.id}
                className={chip(view === t.id, disabled)}
              >
                {t.label}
              </button>
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
        campaign={campaign}
        adset={adset}
        search={search}
        filter={filter}
        visibleColumns={columns}
        onDrill={handleDrill}
        onNavigate={setView}
      />

      {/* ── Donut + Top Performers below ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SourceDonut data={d?.revenueBySource} loading={loading} />
        <div className="lg:col-span-2">
          <TopPerformers />
        </div>
      </div>
    </div>
  );
}
