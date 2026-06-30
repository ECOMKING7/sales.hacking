import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/api';
import KpiCard from '../components/KpiCard';
import SourceDonut from '../components/dashboard/SourceDonut';
import EntityTable from '../components/dashboard/EntityTable';
import TopPerformers from '../components/dashboard/TopPerformers';
import {
  formatCurrency,
  formatPercent,
  formatRoas,
  formatDays,
  n,
} from '../utils/format';

type Preset = '7d' | '30d' | 'month';
type Timeline = 'sales' | 'campaign';
type Model = 'first_click' | 'last_click';

function rangeFor(preset: Preset): { from: string; to: string } {
  const to = new Date();
  let from: Date;
  if (preset === '7d') from = new Date(to.getTime() - 7 * 86_400_000);
  else if (preset === 'month') from = new Date(to.getFullYear(), to.getMonth(), 1);
  else from = new Date(to.getTime() - 30 * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [timeline, setTimeline] = useState<Timeline>('sales');
  const [model, setModel] = useState<Model>('last_click');

  const range = useMemo(() => rangeFor(preset), [preset]);

  const overview = useQuery({
    queryKey: ['overview', range.from, range.to, model],
    queryFn: () => dashboardApi.overview(range.from, range.to),
    staleTime: 5 * 60 * 1000,
  });

  const d = overview.data;
  const loading = overview.isLoading;
  const metaPct = d && d.revenue > 0 ? Math.round((d.revenueBySource.metaAds / d.revenue) * 100) : 0;

  const cards = [
    { title: 'Amount Spent', value: formatCurrency(d?.amountSpent) },
    {
      title: 'Revenue',
      value: formatCurrency(d?.revenue),
      subtitle: `${metaPct}% from Meta Ads`,
    },
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

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={timeline}
            onChange={setTimeline}
            options={[
              { value: 'sales', label: 'Sales Timeline' },
              { value: 'campaign', label: 'Campaign Performance' },
            ]}
          />
          <Segmented
            value={model}
            onChange={setModel}
            options={[
              { value: 'first_click', label: 'First click' },
              { value: 'last_click', label: 'Last click' },
            ]}
          />
          <Segmented
            value={preset}
            onChange={setPreset}
            options={[
              { value: '7d', label: 'Last 7d' },
              { value: '30d', label: 'Last 30d' },
              { value: 'month', label: 'This month' },
            ]}
          />
        </div>
      </div>

      {/* KPI cards */}
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

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="space-y-6 xl:col-span-3">
          <EntityTable />
        </div>
        <div className="space-y-6">
          <SourceDonut data={d?.revenueBySource} loading={loading} />
          <TopPerformers />
        </div>
      </div>
    </div>
  );
}
