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

type Model = 'first_click' | 'last_click';

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

  const cards = [
    { title: 'Amount Spent', value: formatCurrency(d?.amountSpent) },
    { title: 'Revenue', value: formatCurrency(d?.revenue), subtitle: `${metaPct}% from Meta Ads` },
    { title: 'ROAS', value: formatRoas(d?.roas) },
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
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Setup incomplete — connect Facebook Ads and your CRM to see real data.
          </div>
          <Link
            to="/onboarding"
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Finish setup
          </Link>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold text-gray-900">Dashboard</h1>
        <AdAccountSelector />

        {/* View tab switcher */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {VIEW_TABS.map((t) => {
            const disabled = (t.id === 'adsets' && !campaign) || (t.id === 'ads' && !adset);
            return (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                disabled={disabled}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === t.id
                    ? 'bg-indigo-600 text-white'
                    : disabled
                      ? 'cursor-not-allowed text-gray-300'
                      : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-48 rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              filter === p.id
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button className="rounded-full px-3 py-1 text-sm font-medium text-indigo-600 hover:underline">
          + See more
        </button>

        <div className="ml-auto inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['first_click', 'last_click'] as Model[]).map((m) => (
            <button
              key={m}
              onClick={() => setModel(m)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                model === m ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {m === 'first_click' ? 'First click' : 'Last click'}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards (full width) ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <KpiCard
            key={c.title}
            title={c.title}
            value={c.value}
            subtitle={c.subtitle}
            trend={c.trend}
            loading={loading}
          />
        ))}
      </div>

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
