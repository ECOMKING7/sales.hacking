import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { dashboardApi } from '../services/api';
import type { WonDeal } from '../types';
import { formatCurrency, formatDays, n } from '../utils/format';
import SourceBadge from '../components/SourceBadge';
import LeadDetailPanel from '../components/LeadDetailPanel';
import {
  Button,
  Input,
  Skeleton,
  TableWrap,
  Table,
  Th,
  Td,
  Tr,
  TableEmpty,
} from '../components/ui';

const LIMIT = 20;
const COLS = 7;

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Purchases</h1>
          <p className="mt-1.5 font-mono text-label uppercase tracking-[0.1em] text-ink-3">
            Total revenue
          </p>
          {overview.isLoading ? (
            <Skeleton className="mt-1.5 h-7 w-32" />
          ) : overview.isError ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <p className="text-sm text-bad">Failed to load total revenue.</p>
              <Button variant="secondary" size="sm" onClick={() => void overview.refetch()}>
                Qayta urinish
              </Button>
            </div>
          ) : (
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink">
              {formatCurrency(overview.data?.revenue)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <form onSubmit={submitSearch} className="w-56">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or phone…"
              aria-label="Search name or phone"
              icon={<Search className="h-4 w-4" />}
            />
          </form>
          <Button
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            icon={<Download className="h-4 w-4" />}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Source</Th>
              <Th>Campaign</Th>
              <Th>Ad Set</Th>
              <Th>Ad</Th>
              <Th numeric>Revenue</Th>
              <Th numeric>Deal Time</Th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <Tr key={i}>
                  {Array.from({ length: COLS }).map((_, j) => (
                    <Td key={j}>
                      <Skeleton className="h-3.5 w-full" />
                    </Td>
                  ))}
                </Tr>
              ))}

            {!query.isLoading && query.isError && (
              <TableEmpty colSpan={COLS}>
                <span className="text-bad">Failed to load purchases.</span>
                <span className="mt-3 block">
                  <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                    Qayta urinish
                  </Button>
                </span>
              </TableEmpty>
            )}

            {!query.isLoading && !query.isError && deals.length === 0 && (
              <TableEmpty colSpan={COLS}>No purchases found.</TableEmpty>
            )}

            {!query.isLoading &&
              !query.isError &&
              deals.map((d) => (
                <Tr
                  key={d.id}
                  onClick={() => setSelectedLead(d.id)}
                  selected={selectedLead === d.id}
                  className="cursor-pointer"
                >
                  <Td>
                    <span className="select-none font-medium text-ink blur-sm">
                      {d.customerName ?? 'Customer'}
                    </span>
                  </Td>
                  <Td>
                    <SourceBadge source={d.source} />
                  </Td>
                  <Td className="text-ink-2">{d.campaignName ?? '—'}</Td>
                  <Td className="text-ink-2">{d.adsetName ?? '—'}</Td>
                  <Td className="text-ink-2">{d.adName ?? '—'}</Td>
                  <Td numeric>{formatCurrency(d.revenue)}</Td>
                  <Td numeric className="text-ink-2">
                    {d.dealTime != null ? formatDays(d.dealTime) : '—'}
                  </Td>
                </Tr>
              ))}
          </tbody>
        </Table>
      </TableWrap>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
        <span className="tabular-nums">
          {total} {total === 1 ? 'deal' : 'deals'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            icon={<ChevronLeft className="h-4 w-4" />}
          >
            Prev
          </Button>
          <span className="tabular-nums">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            iconRight={<ChevronRight className="h-4 w-4" />}
          >
            Next
          </Button>
        </div>
      </div>

      <LeadDetailPanel leadId={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
