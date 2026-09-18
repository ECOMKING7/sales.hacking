/* ═══════════════════════════════════════════════════════════════════════
   VORONKA SAHIFASI

   Ads Manager'da yo'q bo'lgan yagona ekran: reklama va pul bitta qatorda.

   Ustunlar ataylab shu tartibda — chapdan o'ngga voronka bo'ylab yuriladi:
     Xarajat → FB natijasi → CRM lidi → Sifatli → Sotuv → Daromad → ROAS

   Ikkita ustun alohida e'tiborga loyiq:
     TAFOVUT   — FB va CRM raqami orasidagi farq. 10% dan yuqorisi qizil.
     DEAL TIME — mediana (o'rtacha emas: bitta 90 kunlik bitim o'rtachani
                 buzadi, medianaga tegmaydi).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock } from 'lucide-react';
import api from '../services/api';
import {
  formatCurrency,
  formatCurrency2,
  formatNumber,
  formatPercent,
  formatRoas,
  n,
} from '../utils/format';
import { Button, Skeleton, TableWrap, Table, Th, Td, Tr, TableEmpty, cn } from '../components/ui';
import CurrencyNote from '../components/CurrencyNote';
import PeriodLabel, { type PeriodWindow } from '../components/PeriodLabel';
import type { CurrencyState } from '../types';

type Level = 'campaigns' | 'adsets' | 'ads';

interface FunnelRow {
  id: string;
  name: string | null;
  status: string | null;
  spend: string | number;
  resultType: string | null;
  fbResults: string | number;
  leads: string | number;
  qualified: string | number;
  won: string | number;
  revenue: string | number;
  stuck: string | number;
  dealMedian: string | number | null;
  dealP90: string | number | null;
  cpl: string | number | null;
  cql: string | number | null;
  cac: string | number | null;
  roas: string | number | null;
  aov: string | number | null;
  qualRate: string | number | null;
  closeRate: string | number | null;
  gapPct: string | number | null;
}

interface FunnelTotals {
  spend: number;
  fbResults: number;
  leads: number;
  qualified: number;
  won: number;
  revenue: number;
  stuck: number;
  cpl: number | null;
  cql: number | null;
  cac: number | null;
  aov: number | null;
  roas: number | null;
  qualRate: number | null;
  closeRate: number | null;
  gapPct: number | null;
}

interface FunnelResponse {
  level: Level;
  stuckDays: number;
  data: FunnelRow[];
  totals: FunnelTotals;
  /** Valyuta holati: kurs bo'lsa ROAS o'girib hisoblanadi, bo'lmasa null. */
  currency?: CurrencyState;
  /** Raqamlar qamragan davr — jadvalda sana filtri yo'q. */
  window?: PeriodWindow;
}

const LEVELS: { key: Level; label: string }[] = [
  { key: 'campaigns', label: 'Kampaniyalar' },
  { key: 'adsets', label: 'Ad set' },
  { key: 'ads', label: 'Reklamalar' },
];

/** Tafovut normasi — metrikalar lug'atidan: 10% gacha maqbul. */
const GAP_LIMIT = 10;

function GapCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-ink-3">—</span>;
  const v = n(value);
  const bad = Math.abs(v) > GAP_LIMIT;
  return (
    <span
      className={cn('inline-flex items-center gap-1 tabular-nums', bad ? 'text-bad' : 'text-ink-2')}
      title={bad ? `Norma ≤${GAP_LIMIT}%. Sabab tekshirilishi kerak.` : undefined}
    >
      {bad && <AlertTriangle aria-hidden className="h-3 w-3" />}
      {v > 0 ? '−' : '+'}
      {Math.abs(v).toFixed(1)}%
    </span>
  );
}

function RoasCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-ink-3">—</span>;
  const v = n(value);
  return (
    <span className={cn('font-semibold tabular-nums', v >= 1 ? 'text-ok' : 'text-bad')}>
      {formatRoas(v)}
    </span>
  );
}

function DealCell({ median, p90 }: { median: unknown; p90: unknown }) {
  if (median === null || median === undefined) return <span className="text-ink-3">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums" title={`90-persentil: ${n(p90).toFixed(0)} kun`}>
      {n(median).toFixed(0)}
      <span className="ml-1 text-xs font-normal text-ink-3">kun</span>
    </span>
  );
}

const COLS = [
  { key: 'name', label: 'Nom', align: 'left' as const },
  { key: 'spend', label: 'Xarajat', align: 'right' as const },
  { key: 'fbResults', label: 'FB natija', align: 'right' as const },
  { key: 'leads', label: 'CRM lid', align: 'right' as const },
  { key: 'gapPct', label: 'Tafovut', align: 'right' as const },
  { key: 'cpl', label: 'CPL', align: 'right' as const },
  { key: 'qualified', label: 'Sifatli', align: 'right' as const },
  { key: 'qualRate', label: 'Sifat %', align: 'right' as const },
  { key: 'cql', label: 'Sifatli narxi', align: 'right' as const },
  { key: 'won', label: 'Sotuv', align: 'right' as const },
  { key: 'closeRate', label: 'Close %', align: 'right' as const },
  { key: 'cac', label: 'CAC', align: 'right' as const },
  { key: 'revenue', label: 'Daromad', align: 'right' as const },
  { key: 'roas', label: 'ROAS', align: 'right' as const },
  { key: 'dealMedian', label: 'Deal time', align: 'right' as const },
  { key: 'stuck', label: 'Qotgan', align: 'right' as const },
];

function cell(row: FunnelRow, key: string) {
  switch (key) {
    case 'name':
      return (
        <span className="font-medium text-ink" title={row.name ?? ''}>
          {row.name ?? '—'}
        </span>
      );
    case 'spend':
      return formatCurrency(row.spend);
    case 'fbResults':
      return (
        <span className="whitespace-nowrap">
          {formatNumber(row.fbResults)}
          {row.resultType && (
            <span className="ml-1 text-xs font-normal text-ink-3">{row.resultType}</span>
          )}
        </span>
      );
    case 'leads':
      return formatNumber(row.leads);
    case 'gapPct':
      return <GapCell value={row.gapPct} />;
    case 'cpl':
      return formatCurrency2(row.cpl);
    case 'qualified':
      return formatNumber(row.qualified);
    case 'qualRate':
      return formatPercent(row.qualRate);
    case 'cql':
      return formatCurrency2(row.cql);
    case 'won':
      return formatNumber(row.won);
    case 'closeRate':
      return formatPercent(row.closeRate);
    case 'cac':
      return formatCurrency2(row.cac);
    case 'revenue':
      return formatCurrency(row.revenue);
    case 'roas':
      return <RoasCell value={row.roas} />;
    case 'dealMedian':
      return <DealCell median={row.dealMedian} p90={row.dealP90} />;
    case 'stuck': {
      const v = n(row.stuck);
      if (v === 0) return <span className="text-ink-3">—</span>;
      return (
        <span className="inline-flex items-center gap-1 tabular-nums text-warn">
          <Clock aria-hidden className="h-3 w-3" />
          {v}
        </span>
      );
    }
    default:
      return null;
  }
}

function totalCell(t: FunnelTotals, key: string, level: Level) {
  switch (key) {
    case 'name':
      return (
        <span className="whitespace-nowrap">
          Jami
          <span className="ml-1.5 text-xs font-normal text-ink-3">
            {LEVELS.find((l) => l.key === level)?.label.toLowerCase()}
          </span>
        </span>
      );
    case 'spend':
      return formatCurrency(t.spend);
    case 'fbResults':
      return formatNumber(t.fbResults);
    case 'leads':
      return formatNumber(t.leads);
    case 'gapPct':
      return <GapCell value={t.gapPct} />;
    case 'cpl':
      return formatCurrency2(t.cpl);
    case 'qualified':
      return formatNumber(t.qualified);
    case 'qualRate':
      return formatPercent(t.qualRate);
    case 'cql':
      return formatCurrency2(t.cql);
    case 'won':
      return formatNumber(t.won);
    case 'closeRate':
      return formatPercent(t.closeRate);
    case 'cac':
      return formatCurrency2(t.cac);
    case 'revenue':
      return formatCurrency(t.revenue);
    case 'roas':
      return <RoasCell value={t.roas} />;
    case 'stuck':
      return n(t.stuck) > 0 ? formatNumber(t.stuck) : <span className="text-ink-3">—</span>;
    default:
      return null;
  }
}

export default function FunnelPage() {
  const [level, setLevel] = useState<Level>('campaigns');

  const query = useQuery({
    queryKey: ['funnel', level],
    queryFn: () =>
      api
        .get<FunnelResponse>('/api/dashboard/funnel', { params: { level, limit: 100 } })
        .then((r) => r.data),
    staleTime: 60 * 1000,
  });

  const rows = query.data?.data ?? [];
  const totals = query.data?.totals;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Voronka</h1>
          <p className="mt-0.5 text-sm text-ink-2">
            Reklama → lid → sifatli lid → sotuv → pul. Facebook va CRM bitta qatorda.
          </p>
          <div className="mt-1">
            <PeriodLabel window={query.data?.window} />
          </div>
        </div>
        <div className="flex gap-1.5">
          {LEVELS.map((l) => (
            <Button
              key={l.key}
              size="sm"
              variant={level === l.key ? 'primary' : 'secondary'}
              onClick={() => setLevel(l.key)}
            >
              {l.label}
            </Button>
          ))}
        </div>
      </header>

      {/* Valyuta qatori. Ikki holat bor va ular boshqacha ko'rinadi:
          kurs bor — ROAS hisoblangan, faqat qaysi kurs ekani aytiladi;
          kurs yo'q — ROAS ustuni bo'sh va bu ogohlantirish. */}
      <CurrencyNote state={query.data?.currency} />

      {/* Tafovut ogohlantirishi — jadval ustida, chunki bu diagnostika
          signali: raqamlarga ishonishdan oldin ko'rilishi kerak. */}
      {totals && n(totals.gapPct) > GAP_LIMIT && (
        <div className="flex items-start gap-2 rounded-md border-[1.5px] border-bad/40 bg-bad/5 px-3 py-2.5 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 flex-none text-bad" />
          <div className="text-ink-2">
            <span className="font-medium text-ink">
              Facebook {formatNumber(totals.fbResults)} natija dedi, CRM'da{' '}
              {formatNumber(totals.leads)} ta — {n(totals.gapPct).toFixed(1)}% yo'qolgan.
            </span>{' '}
            Norma ≤{GAP_LIMIT}%. Tekshirish tartibi: UTM maydoni CRM'ga tushmagan → landing
            hidden input buzilgan → in-app brauzerda localStorage bloklangan → vaqt zonasi
            farqi → ad nomi takrorlangan.
          </div>
        </div>
      )}

      <div className="w-full overflow-hidden rounded-md border-[1.5px] border-line bg-surface">
        <TableWrap className="rounded-none border-0">
          <Table>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <Th key={c.key} numeric={c.align === 'right'}>
                    {c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <Tr key={`s-${i}`}>
                    {COLS.map((c) => (
                      <Td key={c.key}>
                        <Skeleton className="h-3.5 w-full" />
                      </Td>
                    ))}
                  </Tr>
                ))}

              {!query.isLoading && query.isError && (
                <TableEmpty colSpan={COLS.length}>
                  <span className="text-bad">Voronka yuklanmadi.</span>
                  <span className="mt-3 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                      Qayta urinish
                    </Button>
                  </span>
                </TableEmpty>
              )}

              {!query.isLoading && !query.isError && rows.length === 0 && (
                <TableEmpty colSpan={COLS.length}>
                  Ma'lumot yo'q. Facebook sync qiling va CRM'ni ulang.
                </TableEmpty>
              )}

              {!query.isLoading &&
                !query.isError &&
                rows.map((r) => (
                  <Tr key={r.id}>
                    {COLS.map((c) => (
                      <Td key={c.key} numeric={c.align === 'right'}>
                        {cell(r, c.key)}
                      </Td>
                    ))}
                  </Tr>
                ))}
            </tbody>

            {totals && rows.length > 0 && (
              <tfoot>
                <tr className="border-t-[1.5px] border-line bg-surface-2 font-semibold text-ink">
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2.5 text-sm tabular-nums',
                        c.align === 'right' ? 'text-right' : 'text-left'
                      )}
                    >
                      {totalCell(totals, c.key, level)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </Table>
        </TableWrap>
      </div>

      <p className="text-xs text-ink-3">
        Deal time — mediana (o'rtacha emas). Ustiga kursor olib borsangiz 90-persentil chiqadi.
        «Qotgan» — {query.data?.stuckDays ?? 7} kundan ortiq yangi etapda turgan lidlar.
      </p>
    </div>
  );
}
