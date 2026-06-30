import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, TopMetric } from '../../services/api';
import type { EntityRow } from '../../types';
import { formatCurrency, formatRoas, formatNumber, n } from '../../utils/format';

const METRICS: TopMetric[] = ['roas', 'revenue', 'sales'];
const LABELS: Record<TopMetric, string> = { roas: 'ROAS', revenue: 'Revenue', sales: 'Sales' };

function metricValue(row: EntityRow, metric: TopMetric): number {
  if (metric === 'roas') return n(row.roas);
  if (metric === 'revenue') return n(row.revenue);
  return n(row.purchases);
}

function metricLabel(row: EntityRow, metric: TopMetric): string {
  if (metric === 'roas') return formatRoas(row.roas);
  if (metric === 'revenue') return formatCurrency(row.revenue);
  return `${formatNumber(row.purchases)} sales`;
}

function TopList({
  title,
  fetcher,
  keyPrefix,
}: {
  title: string;
  fetcher: (m: TopMetric) => Promise<EntityRow[]>;
  keyPrefix: string;
}) {
  const [metric, setMetric] = useState<TopMetric>('roas');
  const query = useQuery({
    queryKey: [keyPrefix, metric],
    queryFn: () => fetcher(metric),
    staleTime: 5 * 60 * 1000,
  });

  const rows = query.data ?? [];
  const max = Math.max(1, ...rows.map((r) => metricValue(r, metric)));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                metric === m ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">No data</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate pr-2 text-gray-700">{r.name ?? '—'}</span>
                <span className="font-medium text-gray-900">{metricLabel(r, metric)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className="h-1.5 rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, (metricValue(r, metric) / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TopPerformers() {
  return (
    <div className="space-y-6">
      <TopList title="Top Campaigns" keyPrefix="top-campaigns" fetcher={dashboardApi.topCampaigns} />
      <TopList title="Top Ad Sets" keyPrefix="top-adsets" fetcher={dashboardApi.topAdsets} />
    </div>
  );
}
