import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { dashboardApi, TopMetric } from '../../services/api';
import type { EntityRow } from '../../types';
import { formatMoney, formatRoas, formatNumber, n } from '../../utils/format';
import { Button, Card, EmptyState, Skeleton, cn } from '../ui';

const METRICS: TopMetric[] = ['roas', 'revenue', 'sales'];
const LABELS: Record<TopMetric, string> = { roas: 'ROAS', revenue: 'Revenue', sales: 'Sales' };

function metricValue(row: EntityRow, metric: TopMetric): number {
  if (metric === 'roas') return n(row.roas);
  if (metric === 'revenue') return n(row.revenue);
  return n(row.purchases);
}

function metricLabel(row: EntityRow, metric: TopMetric, crmCurrency: string | null): string {
  if (metric === 'roas') return formatRoas(row.roas);
  // Revenue — CRM valyutasida, xarajat valyutasida EMAS.
  if (metric === 'revenue') return formatMoney(row.revenue, crmCurrency);
  return `${formatNumber(row.purchases)} sales`;
}

function TopList({
  title,
  fetcher,
  keyPrefix,
  crmCurrency,
}: {
  title: string;
  fetcher: (m: TopMetric) => Promise<EntityRow[]>;
  keyPrefix: string;
  crmCurrency: string | null;
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
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <div className="flex gap-1" role="group" aria-label={`${title} metric`}>
          {METRICS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              aria-pressed={metric === m}
              className={cn(
                'rounded-sm border-[1.5px] border-transparent px-2 py-0.5 text-xs font-semibold transition-colors duration-150',
                metric === m
                  ? 'border-edge bg-tint text-accent'
                  : 'text-ink-2 hover:bg-tint hover:text-accent'
              )}
            >
              {LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-3" role="status" aria-label="Yuklanmoqda">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="py-4 text-center">
          <p className="text-sm text-bad">Could not load {title.toLowerCase()}.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => query.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<TrendingUp />}
          title="No data"
          hint={`${LABELS[metric]} · tanlangan oraliqda natija yo'q`}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate pr-2 text-ink-2">{r.name ?? '—'}</span>
                <span className="flex-none font-medium tabular-nums text-ink">
                  {metricLabel(r, metric, crmCurrency)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-1.5 rounded-full bg-edge"
                  style={{ width: `${Math.min(100, (metricValue(r, metric) / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** `crmCurrency` — Revenue ustuni CRM valyutasida ko'rsatiladi. */
export default function TopPerformers({ crmCurrency }: { crmCurrency: string | null }) {
  return (
    <div className="space-y-6">
      <TopList
        title="Top Campaigns"
        keyPrefix="top-campaigns"
        fetcher={dashboardApi.topCampaigns}
        crmCurrency={crmCurrency}
      />
      <TopList
        title="Top Ad Sets"
        keyPrefix="top-adsets"
        fetcher={dashboardApi.topAdsets}
        crmCurrency={crmCurrency}
      />
    </div>
  );
}
