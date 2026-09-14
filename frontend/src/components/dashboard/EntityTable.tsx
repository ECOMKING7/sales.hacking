import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronRight, ChevronLeft, ArrowUpDown, Play, Image as ImageIcon } from 'lucide-react';
import { dashboardApi } from '../../services/api';
import type { EntityRow } from '../../types';
import {
  formatCurrency,
  formatCurrency2,
  formatNumber,
  formatPercent,
  formatRoas,
  n,
} from '../../utils/format';
import {
  Badge,
  Button,
  Skeleton,
  TableWrap,
  Table,
  Th,
  Td,
  Tr,
  TableEmpty,
  cn,
} from '../ui';
import { ALL_COLUMNS } from './columns';

export type View = 'campaigns' | 'adsets' | 'ads';
export type Sel = { id: string; name: string } | null;

const LIMIT = 50;

function DeliveryBadge({ status }: { status: string | null }) {
  const active = (status ?? '').toUpperCase() === 'ACTIVE';
  return (
    <Badge tone={active ? 'ok' : 'neutral'} dot>
      {status ?? '—'}
    </Badge>
  );
}

/**
 * Kreativ kataklari. Facebook thumbnail'ni har doim ham bermaydi (ads_read
 * bilan kreativ so'rovi yiqilishi mumkin), shuning uchun rasm yo'q bo'lsa
 * turi bo'yicha ikonka chiziladi — ustun bo'sh qolmaydi.
 */
function CreativeTile({ url, type }: { url?: string | null; type?: string | null }) {
  const [broken, setBroken] = useState(false);

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-8 w-8 flex-none rounded-sm border border-line bg-surface-2 object-cover"
      />
    );
  }

  const Icon = type === 'video' ? Play : ImageIcon;
  return (
    <span
      aria-hidden
      title={type ?? 'kreativ'}
      className="grid h-8 w-8 flex-none place-items-center rounded-sm border border-line bg-surface-2 text-ink-3"
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function renderCell(row: EntityRow, key: string, drillable: boolean) {
  switch (key) {
    case 'name':
      return (
        <div className="flex items-center gap-2">
          {/* Ad darajasida har doim 32×32 katak turadi: rasm bo'lsa rasm,
              bo'lmasa kreativ turi ikonkasi. Ilgari thumbnail yo'q bo'lsa
              hech narsa chiqmasdi va ustun bir tekis emas edi. */}
          {(row.thumbnailUrl || row.creativeType) && (
            <CreativeTile url={row.thumbnailUrl} type={row.creativeType} />
          )}
          <span
            className={
              drillable
                ? 'font-semibold text-accent hover:underline'
                : 'font-medium text-ink'
            }
          >
            {row.name ?? '—'}
          </span>
          {drillable && <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-3" />}
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
      return <span className="text-ink-3">—</span>;
    case 'results':
      // Raqamning yonida natija turi turadi: "542 lead" — aks holda turli
      // maqsadli kampaniyalar ustunida "542" nimani anglatishi noma'lum.
      return (
        <span className="whitespace-nowrap">
          {formatNumber(row.results ?? 0)}
          {row.resultType && (
            <span className="ml-1 text-xs font-normal text-ink-3">{row.resultType}</span>
          )}
        </span>
      );
    case 'costPerResult':
      return formatCurrency2(row.costPerResult);
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
      // Natija rangi: 1x — pulni qaytarish chegarasi. Havorang ishlatilmaydi.
      return (
        <span
          className={cn(
            'font-semibold tabular-nums',
            n(row.roas) >= 1 ? 'text-ok' : 'text-bad'
          )}
        >
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

  // A stale page number from a previous view/search/filter would otherwise be
  // sent to the API as-is, showing an empty page even though matches exist.
  useEffect(() => {
    setPage(1);
  }, [view, campaign?.id, adset?.id, search, filter]);

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
    <div className="w-full overflow-hidden rounded-md border-[1.5px] border-line bg-surface">
      {/* Breadcrumb */}
      {view !== 'campaigns' && (
        <div className="flex items-center gap-1 border-b border-line px-4 py-2 text-xs text-ink-2">
          <button onClick={() => onNavigate('campaigns')} className="hover:text-accent">
            Campaigns
          </button>
          {campaign && (
            <>
              <ChevronRight aria-hidden className="h-3 w-3 text-ink-3" />
              <button
                onClick={() => onNavigate('adsets')}
                className={view === 'adsets' ? 'font-medium text-ink' : 'hover:text-accent'}
              >
                {campaign.name}
              </button>
            </>
          )}
          {adset && view === 'ads' && (
            <>
              <ChevronRight aria-hidden className="h-3 w-3 text-ink-3" />
              <span className="font-medium text-ink">{adset.name}</span>
            </>
          )}
        </div>
      )}

      <TableWrap className="rounded-none border-0">
        <Table>
          <thead>
            <tr>
              {cols.map((c) => {
                const isSorted = sort === c.sortKey && Boolean(c.sortKey);
                return (
                  <Th
                    key={c.key}
                    numeric={c.align === 'right'}
                    onClick={() => toggleSort(c.sortKey)}
                    aria-sort={
                      isSorted ? (order === 'desc' ? 'descending' : 'ascending') : undefined
                    }
                    className={cn(
                      c.sortKey && 'cursor-pointer select-none hover:text-ink-2',
                      isSorted && 'text-accent'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1',
                        c.align === 'right' && 'flex-row-reverse'
                      )}
                    >
                      {c.label}
                      {c.sortKey && (
                        <ArrowUpDown
                          aria-hidden
                          className={cn('h-3 w-3', isSorted ? 'text-accent' : 'text-ink-3')}
                        />
                      )}
                      {isSorted && (
                        <span aria-hidden className="text-accent">
                          {order === 'desc' ? '↓' : '↑'}
                        </span>
                      )}
                    </span>
                  </Th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {query.isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <Tr key={`s-${i}`}>
                  {cols.map((c) => (
                    <Td key={c.key}>
                      <Skeleton className="h-3.5 w-full" />
                    </Td>
                  ))}
                </Tr>
              ))}

            {!query.isLoading && query.isError && (
              <TableEmpty colSpan={cols.length}>
                <span className="text-bad">Could not load {entityLabel}.</span>
                <span className="mt-3 flex justify-center">
                  <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                    Retry
                  </Button>
                </span>
              </TableEmpty>
            )}

            {!query.isLoading && !query.isError && rows.length === 0 && (
              <TableEmpty colSpan={cols.length}>No {entityLabel} found.</TableEmpty>
            )}

            {!query.isLoading &&
              !query.isError &&
              rows.map((r) => (
                <Tr
                  key={r.id}
                  onClick={() => rowClickable && onDrill({ id: r.id, name: r.name ?? '—' })}
                  className={rowClickable ? 'cursor-pointer' : undefined}
                >
                  {cols.map((c) => (
                    <Td key={c.key} numeric={c.align === 'right'}>
                      {renderCell(r, c.key, c.key === 'name' && rowClickable)}
                    </Td>
                  ))}
                </Tr>
              ))}
          </tbody>
        </Table>
      </TableWrap>

      {/* Footer: results count + pagination */}
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-2">
        <span>
          Results from <span className="font-medium tabular-nums text-ink">{total}</span>{' '}
          {entityLabel}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<ChevronLeft className="h-4 w-4" />}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </Button>
          <span className="whitespace-nowrap tabular-nums">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            iconRight={<ChevronRight className="h-4 w-4" />}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
