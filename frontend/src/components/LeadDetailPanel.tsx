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

function EventIcon({ type }: { type: JourneyEvent['eventType'] }) {
  const base = 'flex h-8 w-8 items-center justify-center rounded-full';
  if (type === 'purchase')
    return (
      <span className={`${base} bg-green-100 text-green-600`}>
        <DollarSign className="h-4 w-4" />
      </span>
    );
  if (type === 'click')
    return (
      <span className={`${base} bg-blue-100 text-blue-600`}>
        <MousePointerClick className="h-4 w-4" />
      </span>
    );
  if (type === 'lead')
    return (
      <span className={`${base} bg-indigo-100 text-indigo-600`}>
        <UserPlus className="h-4 w-4" />
      </span>
    );
  return (
    <span className={`${base} bg-gray-100 text-gray-500`}>
      <Eye className="h-4 w-4" />
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
      className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        tab === key
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md transform flex-col bg-white shadow-xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Lead details</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => reprocess.mutate()}
              disabled={reprocess.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reprocess.isPending ? 'animate-spin' : ''}`} />
              Reprocess Lead
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Customer */}
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-sm font-medium text-gray-900">Customer</p>
          <p className="select-none text-sm text-gray-500 blur-sm">+998 90 123 45 67</p>
          {data && (
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
              <span>{data.lead.total_touches} touches</span>
              {data.lead.deal_time_days != null && (
                <span>· {formatDays(data.lead.deal_time_days)} to close</span>
              )}
              <span>· {data.lead.status}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 px-3">
          {tabBtn('journey', 'Journey')}
          {tabBtn('clicks', 'Clicks')}
          {tabBtn('purchases', 'Purchases')}
          {tabBtn('phones', 'Phones')}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {detail.isLoading && <p className="text-sm text-gray-400">Loading…</p>}

          {!detail.isLoading && tab === 'journey' && (
            <ol className="relative space-y-5 before:absolute before:left-4 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-gray-200">
              {journey.length === 0 && <p className="text-sm text-gray-400">No events.</p>}
              {journey.map((e, i) => (
                <li key={e.id} className="relative flex gap-3">
                  <EventIcon type={e.eventType} />
                  <div className="pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize text-gray-900">
                        {e.eventType === 'purchase' ? 'Purchase Won' : e.eventType}
                      </span>
                      {e.eventType === 'click' && i === 0 && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          First click
                        </span>
                      )}
                      {e.eventType === 'click' && i === lastIdx && i !== 0 && (
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                          Last click
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{fmtDate(e.occurredAt)}</p>
                    {e.adName && <p className="text-xs text-gray-600">{e.adName}</p>}
                    {e.eventType === 'purchase' && data && (
                      <p className="text-sm font-semibold text-green-600">
                        {formatCurrency(data.lead.revenue)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
              {data?.lead.status === 'lost' && (
                <li className="relative flex gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <XCircle className="h-4 w-4" />
                  </span>
                  <div className="pt-1 text-sm font-medium text-gray-900">Lost</div>
                </li>
              )}
            </ol>
          )}

          {!detail.isLoading && tab === 'clicks' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="py-2">Date</th>
                  <th className="py-2">Source</th>
                  <th className="py-2">Campaign</th>
                  <th className="py-2">Ad</th>
                </tr>
              </thead>
              <tbody>
                {(data?.clicks ?? []).map((c) => (
                  <tr key={c.id} className="border-t border-gray-50">
                    <td className="py-2 text-gray-600">{fmtDate(c.occurredAt)}</td>
                    <td className="py-2"><SourceBadge source={eventSource(c)} /></td>
                    <td className="py-2 text-gray-700">{c.campaignName ?? '—'}</td>
                    <td className="py-2 text-gray-700">{c.adName ?? '—'}</td>
                  </tr>
                ))}
                {(data?.clicks ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gray-400">No clicks.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {!detail.isLoading && tab === 'purchases' && (
            <div className="space-y-3">
              {data && data.lead.status === 'won' ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div>
                    <p className="text-sm font-semibold text-green-600">
                      {formatCurrency(data.lead.revenue)}
                    </p>
                    <p className="text-xs text-gray-500">{fmtDate(data.lead.won_at)}</p>
                  </div>
                  <SourceBadge source={data.purchases[0] ? eventSource(data.purchases[0]) : 'Direct'} />
                </div>
              ) : (
                <p className="text-sm text-gray-400">No purchases yet.</p>
              )}
            </div>
          )}

          {!detail.isLoading && tab === 'phones' && (
            <div className="space-y-2">
              <p className="select-none text-sm text-gray-600 blur-sm">+998 90 123 45 67</p>
              <p className="select-none text-sm text-gray-600 blur-sm">+998 91 765 43 21</p>
              <p className="text-xs text-gray-400">Phone numbers are stored hashed for privacy.</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
