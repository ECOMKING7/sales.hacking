import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
  Play,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import Checkbox from './Checkbox';
import { dashboardApi } from '../../services/api';
import type { EntityRow, EntityTotals } from '../../types';
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

/**
 * Qidiruv yoki filtr yoqilganda server jami'si mos kelmaydi — u butun ro'yxat
 * bo'yicha. Shunda ko'rinib turgan qatorlardan o'zimiz hisoblaymiz.
 *
 * O'rtacha ustunlar (cpc, ctr, cost per result) QO'SHILMAYDI — jamidan qayta
 * hisoblanadi, aks holda raqam noto'g'ri chiqadi.
 */
function totalsFromRows(rows: EntityRow[]): EntityTotals {
  const sum = (pick: (r: EntityRow) => unknown) =>
    rows.reduce((acc, r) => acc + n(pick(r) as string | number | null), 0);

  const spend = sum((r) => r.spend);
  const clicks = sum((r) => r.clicks);
  const impressions = sum((r) => r.impressions);
  const leads = sum((r) => r.leads);
  const purchases = sum((r) => r.purchases);
  const results = sum((r) => r.results);
  const revenue = sum((r) => r.revenue);
  const fbRevenue = sum((r) => r.fbRevenue);

  const per = (total: number, count: number) => (count > 0 ? total / count : null);
  const types = new Set(rows.map((r) => r.resultType).filter(Boolean));

  return {
    rowCount: rows.length,
    spend,
    clicks,
    impressions,
    leads,
    purchases,
    results,
    revenue,
    fbRevenue,
    cpc: per(spend, clicks),
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    costPerLead: per(spend, leads),
    costPerPurchase: per(spend, purchases),
    costPerResult: per(spend, results),
    roas: spend > 0 ? revenue / spend : null,
    resultType: types.size === 1 ? [...types][0]! : null,
  };
}

/**
 * Jami qatoridagi bitta katak. Matnli ustunlar (nom, status) bo'sh qoladi —
 * ularning jami'si yo'q.
 */
function renderTotal(t: EntityTotals, key: string) {
  switch (key) {
    case 'spend':
      return formatCurrency(t.spend);
    case 'cpc':
      return formatCurrency2(t.cpc);
    case 'cpm':
      return formatCurrency2(t.cpm);
    case 'ctr':
      return formatPercent(t.ctr);
    case 'clicks':
      return formatNumber(t.clicks);
    case 'impressions':
      return formatNumber(t.impressions);
    case 'results':
      return (
        <span className="whitespace-nowrap">
          {formatNumber(t.results)}
          <span className="ml-1 text-xs font-normal text-ink-3">
            {/* Turlar aralash bo'lsa aniq nom yozib bo'lmaydi: 500 lid + 40
                sotuvning yig'indisi "540 lid" emas. */}
            {t.resultType ?? 'natija'}
          </span>
        </span>
      );
    case 'costPerResult':
      return formatCurrency2(t.costPerResult);
    case 'leads':
      return formatNumber(t.leads);
    case 'costPerLead':
      return formatCurrency2(t.costPerLead);
    case 'purchases':
      return formatNumber(t.purchases);
    case 'costPerPurchase':
      return formatCurrency2(t.costPerPurchase);
    case 'revenue':
      return formatCurrency(t.revenue);
    case 'roas':
      return (
        <span className={cn('tabular-nums', n(t.roas) >= 1 ? 'text-ok' : 'text-bad')}>
          {formatRoas(n(t.roas))}
        </span>
      );
    default:
      return null;
  }
}

export type QuickFilter = 'all' | 'active' | 'delivery';

interface Props {
  view: View;
  /** Tanlangan ota-onalar. Bo'sh bo'lsa filtr yo'q — hammasi ko'rinadi. */
  campaignIds: string[];
  adsetIds: string[];
  search: string;
  filter: QuickFilter;
  visibleColumns: string[];
  /** Shu ko'rinishda tanlangan qatorlar (id → nom). */
  selected: Map<string, string>;
  onToggle: (row: { id: string; name: string }, checked: boolean) => void;
  onToggleAll: (rows: Array<{ id: string; name: string }>, checked: boolean) => void;
  /** Filtrga mos BARCHA elementni tanlash (sahifalardan tashqari ham). */
  onSelectAllMatching: () => void | Promise<void>;
  onClearSelection: () => void;
  onDrill: (sel: { id: string; name: string }) => void;
}

export default function EntityTable({
  view,
  campaignIds,
  adsetIds,
  search,
  filter,
  visibleColumns,
  selected,
  onToggle,
  onToggleAll,
  onSelectAllMatching,
  onClearSelection,
  onDrill,
}: Props) {
  const [sort, setSort] = useState('spend');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // A stale page number from a previous view/search/filter would otherwise be
  // sent to the API as-is, showing an empty page even though matches exist.
  useEffect(() => {
    setPage(1);
  }, [view, campaignIds.join(','), adsetIds.join(','), search, filter]);

  const params: Record<string, string> = {
    sort,
    order,
    limit: String(LIMIT),
    page: String(page),
  };

  const campaignKey = campaignIds.join(',');
  const adsetKey = adsetIds.join(',');

  const query = useQuery({
    queryKey: ['entities', view, campaignKey, adsetKey, sort, order, page],
    queryFn: () => {
      // Eng aniq filtr yutadi: ad set tanlangan bo'lsa kampaniya filtri
      // ortiqcha va backend ham shu tartibni qo'llaydi.
      if (view === 'adsets') {
        return dashboardApi.adsets({ ...params, ...(campaignKey && { campaignIds: campaignKey }) });
      }
      if (view === 'ads') {
        if (adsetKey) return dashboardApi.ads({ ...params, adsetIds: adsetKey });
        return dashboardApi.ads({ ...params, ...(campaignKey && { campaignIds: campaignKey }) });
      }
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

  // Filtrlash mijoz tomonida ketadi, server jami'si esa butun ro'yxat bo'yicha.
  // Shuning uchun filtr yoqilgan bo'lsa ko'rinayotgan qatorlardan hisoblaymiz —
  // aks holda jadval 3 qator ko'rsatib, pastda 100 qatorning puli turardi.
  const filtered = Boolean(search) || filter !== 'all';
  const serverTotals = query.data?.totals;
  const totals: EntityTotals | null = filtered
    ? totalsFromRows(rows)
    : serverTotals ?? null;
  const showTotals = totals !== null && rows.length > 0;

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

  const [selectingAll, setSelectingAll] = useState(false);
  const selectableRows = rows.map((r) => ({ id: r.id, name: r.name ?? '—' }));
  const someChecked = selectableRows.some((r) => selected.has(r.id));
  const allChecked = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));

  return (
    <div className="w-full overflow-hidden rounded-md border-[1.5px] border-line bg-surface">
      {/* Tanlov paneli — Ads Manager naqshi.
          Sarlavhadagi katakcha faqat KO'RINIB TURGAN qatorlarni belgilaydi.
          Ro'yxat undan uzun bo'lsa, foydalanuvchi buni bilmasligi mumkin va
          "hammasini tanladim" deb o'ylab qoladi. Panel farqni ochiq aytadi. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-tint/50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-ink">
            {selected.size} ta {entityLabel} tanlandi
          </span>

          {allChecked && total > selected.size && (
            <Button
              variant="secondary"
              size="sm"
              loading={selectingAll}
              onClick={async () => {
                setSelectingAll(true);
                try {
                  await onSelectAllMatching();
                } finally {
                  setSelectingAll(false);
                }
              }}
            >
              Barcha {total} tasini tanlash
            </Button>
          )}

          <span aria-hidden className="h-4 w-px bg-line" />

          <Button
            variant="ghost"
            size="sm"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={onClearSelection}
          >
            Tanlovni bekor qilish
          </Button>
        </div>
      )}

      <TableWrap className="rounded-none border-0">
        <Table>
          <thead>
            <tr>
              <Th className="w-10">
                <Checkbox
                  checked={allChecked}
                  indeterminate={someChecked && !allChecked}
                  onChange={(v) => onToggleAll(selectableRows, v)}
                  label="Hammasini tanlash"
                />
              </Th>
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
                  <Td>
                    <Skeleton className="h-3.5 w-4" />
                  </Td>
                  {cols.map((c) => (
                    <Td key={c.key}>
                      <Skeleton className="h-3.5 w-full" />
                    </Td>
                  ))}
                </Tr>
              ))}

            {!query.isLoading && query.isError && (
              <TableEmpty colSpan={cols.length + 1}>
                <span className="text-bad">Could not load {entityLabel}.</span>
                <span className="mt-3 flex justify-center">
                  <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                    Retry
                  </Button>
                </span>
              </TableEmpty>
            )}

            {!query.isLoading && !query.isError && rows.length === 0 && (
              <TableEmpty colSpan={cols.length + 1}>No {entityLabel} found.</TableEmpty>
            )}

            {!query.isLoading &&
              !query.isError &&
              rows.map((r) => (
                <Tr
                  key={r.id}
                  onClick={() => rowClickable && onDrill({ id: r.id, name: r.name ?? '—' })}
                  className={cn(
                    rowClickable && 'cursor-pointer',
                    selected.has(r.id) && 'bg-tint/60'
                  )}
                >
                  {/* Checkbox qator bosilishini to'xtatadi: aks holda belgilash
                      bir vaqtda pastga o'tib ketardi. */}
                  <Td onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(r.id)}
                      onChange={(v) => onToggle({ id: r.id, name: r.name ?? '—' }, v)}
                      label={`Tanlash: ${r.name ?? r.id}`}
                    />
                  </Td>
                  {cols.map((c) => (
                    <Td key={c.key} numeric={c.align === 'right'}>
                      {renderCell(r, c.key, c.key === 'name' && rowClickable)}
                    </Td>
                  ))}
                </Tr>
              ))}
          </tbody>

          {/* Jami qatori — Ads Manager'dagi kabi jadval oxirida, qalin chiziq
              bilan ajratilgan. Sahifalashda o'zgarmaydi: server butun ro'yxat
              bo'yicha hisoblaydi. */}
          {showTotals && totals && (
            <tfoot>
              <tr className="border-t-[1.5px] border-line bg-surface-2 font-semibold text-ink">
                <td className="px-3 py-2.5" />
                {cols.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-2.5 text-sm tabular-nums',
                      c.align === 'right' ? 'text-right' : 'text-left'
                    )}
                  >
                    {i === 0 ? (
                      <span className="whitespace-nowrap">
                        Jami
                        <span className="ml-1.5 text-xs font-normal text-ink-3">
                          {filtered
                            ? `${rows.length} ta ${entityLabel} (filtr)`
                            : `${total} ta ${entityLabel}`}
                        </span>
                      </span>
                    ) : (
                      renderTotal(totals, c.key)
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
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
