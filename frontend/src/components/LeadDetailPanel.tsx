import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  RefreshCw,
  DollarSign,
  MousePointerClick,
  UserPlus,
  XCircle,
  Eye,
} from 'lucide-react';
import { dashboardApi, attributionApi } from '../services/api';
import type { JourneyEvent } from '../types';
import { formatCurrency, formatDays } from '../utils/format';
import SourceBadge from './SourceBadge';
import {
  Badge,
  Button,
  Card,
  Skeleton,
  SkeletonText,
  TableWrap,
  Table,
  Th,
  Td,
  Tr,
  TableEmpty,
  cn,
} from './ui';

type Tab = 'journey' | 'clicks' | 'purchases' | 'phones';

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function eventSource(e: JourneyEvent): string {
  return e.adName ? 'Meta Ads' : 'Direct';
}

/**
 * Zanjir nuqtasi. Faol (oxirgi) nuqta havorang — "bu yerdasiz".
 * Sotuv har doim yashil: u natija, holat emas.
 */
function EventIcon({
  type,
  active = false,
}: {
  type: JourneyEvent['eventType'];
  active?: boolean;
}) {
  const base =
    'grid h-8 w-8 flex-none place-items-center rounded-full border-[1.5px] bg-surface';

  if (type === 'purchase')
    return (
      <span className={cn(base, 'border-ok/30 bg-ok/12 text-ok')}>
        <DollarSign aria-hidden className="h-4 w-4" />
      </span>
    );

  const tone = active ? 'border-edge bg-tint text-accent' : 'border-line text-ink-2';

  if (type === 'click')
    return (
      <span className={cn(base, tone)}>
        <MousePointerClick aria-hidden className="h-4 w-4" />
      </span>
    );
  if (type === 'lead')
    return (
      <span className={cn(base, tone)}>
        <UserPlus aria-hidden className="h-4 w-4" />
      </span>
    );
  return (
    <span className={cn(base, tone)}>
      <Eye aria-hidden className="h-4 w-4" />
    </span>
  );
}

export default function LeadDetailPanel({
  leadId,
  onClose,
}: {
  leadId: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('journey');
  const queryClient = useQueryClient();
  const open = Boolean(leadId);

  const detail = useQuery({
    queryKey: ['lead-detail', leadId],
    queryFn: () => dashboardApi.leadDetail(leadId as string),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const reprocess = useMutation({
    mutationFn: () => attributionApi.reprocess(leadId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-detail', leadId] });
    },
  });

  const data = detail.data;
  const journey = data?.journey ?? [];
  const lastIdx = journey.length - 1;

  const tabBtn = (key: Tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      aria-selected={tab === key}
      className={cn(
        'border-b-2 px-3 py-2 text-sm font-semibold transition-colors duration-200',
        tab === key
          ? 'border-edge text-accent'
          : 'border-transparent text-ink-2 hover:text-ink'
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-ink/40 transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md transform flex-col',
          'border-l border-line bg-surface shadow-glow-lg',
          'transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Lead details</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={reprocess.isPending}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => reprocess.mutate()}
            >
              Reprocess Lead
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close"
              onClick={onClose}
              icon={<X className="h-5 w-5" />}
              className="px-2"
            />
          </div>
        </div>

        {reprocess.isError && (
          <p className="border-b border-line px-5 py-2 text-xs text-bad">
            Reprocess failed. Try again.
          </p>
        )}

        {/* Customer */}
        <div className="border-b border-line px-5 py-4">
          <p className="text-sm font-semibold text-ink">Customer</p>
          <p className="select-none text-sm text-ink-2 blur-sm">+998 90 123 45 67</p>
          {detail.isLoading && <Skeleton className="mt-2 h-3.5 w-48" />}
          {data && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs tabular-nums text-ink-2">
              <span>{data.lead.total_touches} touches</span>
              {data.lead.deal_time_days != null && (
                <span>· {formatDays(data.lead.deal_time_days)} to close</span>
              )}
              <span>· {data.lead.status}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-line px-3">
          {tabBtn('journey', 'Journey')}
          {tabBtn('clicks', 'Clicks')}
          {tabBtn('purchases', 'Purchases')}
          {tabBtn('phones', 'Phones')}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {detail.isLoading && <SkeletonText lines={5} />}

          {!detail.isLoading && detail.isError && (
            <div className="space-y-3">
              <p className="text-sm text-bad">Could not load this lead.</p>
              <Button variant="secondary" size="sm" onClick={() => detail.refetch()}>
                Retry
              </Button>
            </div>
          )}

          {!detail.isLoading && !detail.isError && tab === 'journey' && (
            <ol className="relative space-y-5 before:absolute before:left-4 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-line">
              {journey.length === 0 && <p className="text-sm text-ink-3">No events.</p>}
              {journey.map((e, i) => (
                <li key={e.id} className="relative flex gap-3">
                  <EventIcon type={e.eventType} active={i === lastIdx} />
                  <div className="pt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold capitalize text-ink">
                        {e.eventType === 'purchase' ? 'Purchase Won' : e.eventType}
                      </span>
                      {e.eventType === 'click' && i === 0 && (
                        <Badge tone="neutral">First click</Badge>
                      )}
                      {e.eventType === 'click' && i === lastIdx && i !== 0 && (
                        <Badge tone="accent">Last click</Badge>
                      )}
                    </div>
                    <p className="text-xs tabular-nums text-ink-3">{fmtDate(e.occurredAt)}</p>
                    {e.adName && <p className="text-xs text-ink-2">{e.adName}</p>}
                    {e.eventType === 'purchase' && data && (
                      <p className="text-sm font-semibold tabular-nums text-ok">
                        {formatCurrency(data.lead.revenue)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
              {data?.lead.status === 'lost' && (
                <li className="relative flex gap-3">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full border-[1.5px] border-bad/28 bg-bad/10 text-bad">
                    <XCircle aria-hidden className="h-4 w-4" />
                  </span>
                  <div className="pt-1 text-sm font-semibold text-ink">Lost</div>
                </li>
              )}
            </ol>
          )}

          {!detail.isLoading && !detail.isError && tab === 'clicks' && (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Source</Th>
                    <Th>Campaign</Th>
                    <Th>Ad</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.clicks ?? []).map((c) => (
                    <Tr key={c.id}>
                      <Td className="tabular-nums text-ink-2">{fmtDate(c.occurredAt)}</Td>
                      <Td>
                        <SourceBadge source={eventSource(c)} />
                      </Td>
                      <Td>{c.campaignName ?? '—'}</Td>
                      <Td>{c.adName ?? '—'}</Td>
                    </Tr>
                  ))}
                  {(data?.clicks ?? []).length === 0 && (
                    <TableEmpty colSpan={4}>No clicks.</TableEmpty>
                  )}
                </tbody>
              </Table>
            </TableWrap>
          )}

          {!detail.isLoading && !detail.isError && tab === 'purchases' && (
            <div className="space-y-3">
              {data && data.lead.status === 'won' ? (
                <Card padding="sm" className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tabular-nums text-ok">
                      {formatCurrency(data.lead.revenue)}
                    </p>
                    <p className="text-xs tabular-nums text-ink-3">{fmtDate(data.lead.won_at)}</p>
                  </div>
                  <SourceBadge
                    source={data.purchases[0] ? eventSource(data.purchases[0]) : 'Direct'}
                  />
                </Card>
              ) : (
                <p className="text-sm text-ink-3">No purchases yet.</p>
              )}
            </div>
          )}

          {!detail.isLoading && !detail.isError && tab === 'phones' && (
            <div className="space-y-2">
              <p className="select-none text-sm text-ink-2 blur-sm">+998 90 123 45 67</p>
              <p className="select-none text-sm text-ink-2 blur-sm">+998 91 765 43 21</p>
              <p className="text-xs text-ink-3">Phone numbers are stored hashed for privacy.</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
