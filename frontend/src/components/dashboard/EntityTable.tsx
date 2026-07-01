import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronRight, ChevronLeft, ArrowUpDown } from 'lucide-react';
import { dashboardApi } from '../../services/api';
import type { EntityRow } from '../../types';
import {
  formatCurrency,
  formatCurrency2,
  formatNumber,
  formatPercent,
  formatRoas,
  roasColor,
  n,
} from '../../utils/format';
import { ALL_COLUMNS } from './columns';

export type View = 'campaigns' | 'adsets' | 'ads';
export type Sel = { id: string; name: string } | null;

const LIMIT = 50;

function DeliveryBadge({ status }: { status: string | null }) {
  const active = (status ?? '').toUpperCase() === 'ACTIVE';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
      {status ?? '—'}
    </span>
  );
}

function renderCell(row: EntityRow, key: string, drillable: boolean) {
  switch (key) {
    case 'name':
      return (
        <div className="flex items-center gap-2">
          {row.thumbnailUrl && (
            <img src={row.thumbnailUrl} alt="" className="h-8 w-8 rounded object-cover" />
          )}
          <span
            className={
              drillable
                ? 'font-medium text-indigo-600 hover:underline'
                : 'font-medium text-gray-900'
            }
          >
            {row.name ?? '—'}
          </span>
          {drillable && <ChevronRight className="h-3.5 w-3.5 text-gray-300" />}
        </div>
      );
    case 'status':
      return <DeliveryBadge status={row.status} />;
    case 'spend':
      return formatCurrency(row.spend);
    case 'cpc':
      return formatCurrency2(row.cpc);
    case 'cpm':
      return formatCurrency2(row.cpm);
    case 'ctr':
      return formatPercent(row.ctr);
    case 'clicks':
      return formatNumber(row.clicks);
    case 'impressions':
      return formatNumber(row.impressions);
    case 'reach':
    case 'frequency':
      return <span className="text-gray-300">—</span>;
    case 'leads':
      return formatNumber(row.leads);
    case 'costPerLead':
      return formatCurrency2(row.costPerLead);
    case 'purchases':
      return formatNumber(row.purchases);
    case 'costPerPurchase':
      return formatCurrency2(row.costPerPurchase);
    case 'revenue':
      return formatCurrency(row.revenue);
    case 'roas':
      return (
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roasColor(row.roas)}`}>
          {formatRoas(n(row.roas))}
        </span>
      );
    default:
      return null;
  }
}

export type QuickFilter = 'all' | 'active' | 'delivery';

interface Props {
  view: View;
  campaign: Sel;
  adset: Sel;
  search: string;
  filter: QuickFilter;
  visibleColumns: string[];
  onDrill: (sel: { id: string; name: string }) => void;
  onNavigate: (view: View) => void;
}

export default function EntityTable({
  view,
  campaign,
  adset,
  search,
  filter,
  visibleColumns,
  onDrill,
  onNavigate,
}: Props) {
  const [sort, setSort] = useState('spend');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const params: Record<string, string> = {
    sort,
    order,
    limit: String(LIMIT),
    page: String(page),
  };

  const query = useQuery({
    queryKey: ['entities', view, campaign?.id, adset?.id, sort, order, page],
    queryFn: () => {
      if (view === 'adsets' && campaign) return dashboardApi.campaignAdsets(campaign.id, params);
      if (view === 'ads' && adset) return dashboardApi.adsetAds(adset.id, params);
      return dashboardApi.campaigns(params);
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const allRows: EntityRow[] = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const rows = allRows.filter((r) => {
    if (search && !(r.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'active' && (r.status ?? '').toUpperCase() !== 'ACTIVE') return false;
    if (filter === 'delivery' && n(r.impressions) <= 0) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const cols = ALL_COLUMNS.filter((c) => c.always || visibleColumns.includes(c.key));
  const entityLabel = view === 'campaigns' ? 'campaigns' : view === 'adsets' ? 'ad sets' : 'ads';

  const toggleSort = (key?: string) => {
    if (!key) return;
    if (sort === key) setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    else {
      setSort(key);
      setOrder('desc');
    }
    setPage(1);
  };

  const rowClickable = view !== 'ads';

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Breadcrumb */}
      {view !== 'campaigns' && (
        <div className="flex items-center gap-1 border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
          <button onClick={() => onNavigate('campaigns')} className="hover:text-indigo-600">
            Campaigns
          </button>
          {campaign && (
            <>
              <ChevronRight className="h-3 w-3" />
              <button
                onClick={() => onNavigate('adsets')}
                className={view === 'adsets' ? 'text-gray-900' : 'hover:text-indigo-600'}
              >
                {campaign.name}
              </button>
            </>
          )}
          {adset && view === 'ads' && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-gray-900">{adset.name}</span>
            </>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.sortKey)}
                  className={`whitespace-nowrap px-4 py-2.5 font-medium ${
                    c.align === 'right' ? 'text-right' : ''
                  } ${c.sortKey ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                >
                  <span
                    className={`inline-flex items-center gap-1 ${
                      c.align === 'right' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    {c.label}
                    {c.sortKey && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                    {sort === c.sortKey && (
                      <span className="text-indigo-600">{order === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {cols.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                    </td>
                  ))}
                </tr>
              ))}

            {!query.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-4 py-10 text-center text-gray-400">
                  No {entityLabel} found.
                </td>
              </tr>
            )}

            {!query.isLoading &&
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => rowClickable && onDrill({ id: r.id, name: r.name ?? '—' })}
                  className={`border-b border-gray-50 ${
                    rowClickable ? 'cursor-pointer hover:bg-gray-50' : ''
                  }`}
                >
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}
                    >
                      {renderCell(r, c.key, c.key === 'name' && rowClickable)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Footer: results count + pagination */}
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
        <span>
          Results from <span className="font-medium text-gray-900">{total}</span> {entityLabel}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
