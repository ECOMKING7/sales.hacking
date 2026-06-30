import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { dashboardApi } from '../services/api';
import type { WonDeal } from '../types';
import { formatCurrency, formatDays, n } from '../utils/format';
import SourceBadge from '../components/SourceBadge';
import LeadDetailPanel from '../components/LeadDetailPanel';

const LIMIT = 20;

export default function PurchasesPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState<string | null>(null);

  const params: Record<string, string | number> = { page, limit: LIMIT };
  if (search) params.search = search;

  const query = useQuery({
    queryKey: ['won-deals', page, search],
    queryFn: () => dashboardApi.wonDeals(params),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  // Total won revenue for the period (independent of pagination).
  const overview = useQuery({
    queryKey: ['overview-total'],
    queryFn: () => dashboardApi.overview(),
    staleTime: 5 * 60 * 1000,
  });

  const deals: WonDeal[] = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const exportCsv = () => {
    const headers = ['Customer', 'Source', 'Campaign', 'Ad Set', 'Ad', 'Revenue', 'Deal Time (days)', 'Won At'];
    const rows = deals.map((d) => [
      d.customerName ?? '',
      d.source,
      d.campaignName ?? '',
      d.adsetName ?? '',
      d.adName ?? '',
      String(n(d.revenue)),
      d.dealTime ?? '',
      d.wonAt,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'purchases.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-sm text-gray-500">
            Total revenue:{' '}
            <span className="font-semibold text-gray-900">
              {overview.isLoading ? '…' : formatCurrency(overview.data?.revenue)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={submitSearch} className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or phone…"
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </form>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Campaign</th>
                <th className="px-4 py-2.5 font-medium">Ad Set</th>
                <th className="px-4 py-2.5 font-medium">Ad</th>
                <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                <th className="px-4 py-2.5 text-right font-medium">Deal Time</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!query.isLoading && deals.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No purchases found.
                  </td>
                </tr>
              )}

              {!query.isLoading &&
                deals.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedLead(d.id)}
                    className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <span className="select-none font-medium text-gray-900 blur-sm">
                        {d.customerName ?? 'Customer'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><SourceBadge source={d.source} /></td>
                    <td className="px-4 py-3 text-gray-700">{d.campaignName ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{d.adsetName ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{d.adName ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(d.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {d.dealTime != null ? formatDays(d.dealTime) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
          <span>
            {total} {total === 1 ? 'deal' : 'deals'}
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

      <LeadDetailPanel leadId={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
