import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ArrowUpDown } from 'lucide-react';
import { dashboardApi } from '../../services/api';
import type { EntityRow } from '../../types';
import {
  formatCurrency,
  formatCurrency2,
  formatNumber,
  formatRoas,
  roasColor,
  n,
} from '../../utils/format';

type View = 'campaigns' | 'adsets' | 'ads';
type Sel = { id: string; name: string } | null;

const COLUMNS: Array<{ key: string; label: string; sortKey?: string; align?: 'right' }> = [
  { key: 'name', label: 'Name', sortKey: 'name' },
  { key: 'status', label: 'Delivery' },
  { key: 'spend', label: 'Spent', sortKey: 'spend', align: 'right' },
  { key: 'cpc', label: 'CPC', align: 'right' },
  { key: 'leads', label: 'Leads', sortKey: 'leads', align: 'right' },
  { key: 'costPerLead', label: 'Cost/lead', align: 'right' },
  { key: 'purchases', label: 'Purchases', sortKey: 'purchases', align: 'right' },
  { key: 'costPerPurchase', label: 'Cost/purchase', align: 'right' },
  { key: 'revenue', label: 'Revenue', sortKey: 'revenue', align: 'right' },
  { key: 'roas', label: 'ROAS', sortKey: 'roas', align: 'right' },
];

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

export default function EntityTable() {
  const [view, setView] = useState<View>('campaigns');
  const [campaign, setCampaign] = useState<Sel>(null);
  const [adset, setAdset] = useState<Sel>(null);
  const [sort, setSort] = useState('spend');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [activeOnly, setActiveOnly] = useState(false);

  const params: Record<string, string> = { sort, order, limit: '50' };

  const query = useQuery({
    queryKey: ['entities', view, campaign?.id, adset?.id, sort, order, activeOnly],
    queryFn: () => {
      if (view === 'adsets' && campaign) return dashboardApi.campaignAdsets(campaign.id, params);
      if (view === 'ads' && adset) return dashboardApi.adsetAds(adset.id, params);
      return dashboardApi.campaigns(
        activeOnly ? { ...params, status: 'ACTIVE' } : params
      );
    },
    staleTime: 5 * 60 * 1000,
  });

  let rows: EntityRow[] = query.data?.data ?? [];
  // Client-side "active only" for adset/ad levels (backend filters only campaigns).
  if (activeOnly && view !== 'campaigns') {
    rows = rows.filter((r) => (r.status ?? '').toUpperCase() === 'ACTIVE');
  }

  const toggleSort = (key?: string) => {
    if (!key) return;
    if (sort === key) setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    else {
      setSort(key);
      setOrder('desc');
    }
  };

  const onRowClick = (row: EntityRow) => {
    if (view === 'campaigns') {
      setCampaign({ id: row.id, name: row.name ?? '—' });
      setView('adsets');
    } else if (view === 'adsets') {
      setAdset({ id: row.id, name: row.name ?? '—' });
      setView('ads');
    }
  };

  const tab = (label: string, v: View, disabled = false) => (
    <button
      onClick={() => !disabled && setView(v)}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        view === v
          ? 'bg-indigo-600 text-white'
          : disabled
            ? 'cursor-not-allowed text-gray-300'
            : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
        <div className="flex items-center gap-1">
          {tab('Campaigns', 'campaigns')}
          {tab('Ad sets', 'adsets', !campaign)}
          {tab('Ads', 'ads', !adset)}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          Active only
        </label>
      </div>

      {/* Breadcrumb */}
      {view !== 'campaigns' && (
        <div className="flex items-center gap-1 px-4 py-2 text-xs text-gray-500">
          <button onClick={() => setView('campaigns')} className="hover:text-indigo-600">
            Campaigns
          </button>
          {campaign && (
            <>
              <ChevronRight className="h-3 w-3" />
              <button
                onClick={() => setView('adsets')}
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
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.sortKey)}
                  className={`px-4 py-2.5 font-medium ${c.align === 'right' ? 'text-right' : ''} ${
                    c.sortKey ? 'cursor-pointer select-none hover:text-gray-700' : ''
                  }`}
                >
                  <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                    {c.label}
                    {c.sortKey && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                    {sort === c.sortKey && <span className="text-indigo-600">{order === 'desc' ? '↓' : '↑'}</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                    </td>
                  ))}
                </tr>
              ))}

            {!query.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-gray-400">
                  No data
                </td>
              </tr>
            )}

            {!query.isLoading &&
              rows.map((r) => {
                const clickable = view !== 'ads';
                return (
                  <tr
                    key={r.id}
                    onClick={() => clickable && onRowClick(r)}
                    className={`border-b border-gray-50 ${clickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {r.thumbnailUrl && (
                          <img src={r.thumbnailUrl} alt="" className="h-8 w-8 rounded object-cover" />
                        )}
                        {r.name ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3"><DeliveryBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-right">{formatCurrency(r.spend)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency2(r.cpc)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(r.leads)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency2(r.costPerLead)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(r.purchases)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency2(r.costPerPurchase)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.revenue)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roasColor(r.roas)}`}>
                        {formatRoas(n(r.roas))}
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
