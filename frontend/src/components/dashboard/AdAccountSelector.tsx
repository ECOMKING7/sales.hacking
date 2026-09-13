import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Check, CircleDot, Megaphone } from 'lucide-react';
import { facebookApi } from '../../services/api';
import type { AdAccount } from '../../types';
import { Button, Skeleton, cn } from '../ui';

export default function AdAccountSelector() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const status = useQuery({ queryKey: ['fb-status'], queryFn: facebookApi.status });
  const accounts = useQuery({
    queryKey: ['fb-ad-accounts'],
    queryFn: facebookApi.fbAdAccounts,
    enabled: open && Boolean(status.data?.connected),
  });

  const selectedId = status.data?.adAccountId ?? null;
  const list: AdAccount[] = accounts.data?.adAccounts ?? [];
  const selected = list.find((a) => (a.accountId || a.id) === selectedId);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = async (acc: AdAccount) => {
    await facebookApi.selectAdAccount(acc.accountId || acc.id);
    setOpen(false);
    // Refetch everything tied to the active ad account.
    queryClient.invalidateQueries({ queryKey: ['fb-status'] });
    queryClient.invalidateQueries({ queryKey: ['overview'] });
    queryClient.invalidateQueries({ queryKey: ['entities'] });
    queryClient.invalidateQueries({ queryKey: ['top-campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['top-adsets'] });
  };

  const label = selected?.name ?? (selectedId ? selectedId : 'No ad account');

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        icon={
          <span
            aria-hidden
            className="grid h-6 w-6 flex-none place-items-center rounded-sm border-[1.5px] border-edge bg-tint text-accent"
          >
            <Megaphone className="h-3.5 w-3.5" />
          </span>
        }
        iconRight={<ChevronDown className="h-4 w-4" />}
        className={cn(
          'border-line-2 text-ink hover:border-edge hover:text-accent',
          open && 'border-edge text-accent shadow-glow-xs'
        )}
      >
        <span className="max-w-[180px] truncate">{label}</span>
        {selectedId && (
          <span className="font-mono text-xs tabular-nums text-ink-3">({selectedId})</span>
        )}
      </Button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-80 rounded-md border-[1.5px] border-line-2 bg-surface p-2 shadow-glow-sm">
          {!status.data?.connected ? (
            <p className="px-3 py-4 text-center text-sm text-ink-3">
              Facebook not connected. Connect it in Settings to list ad accounts.
            </p>
          ) : accounts.isError ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-bad">Could not load ad accounts.</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => accounts.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : accounts.isLoading ? (
            <div className="space-y-2 p-2" role="status" aria-label="Yuklanmoqda">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-ink-3">No ad accounts found.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto" role="listbox">
              {list.map((a) => {
                const id = a.accountId || a.id;
                const isSel = id === selectedId;
                return (
                  <li key={a.id} role="option" aria-selected={isSel}>
                    <button
                      type="button"
                      onClick={() => choose(a)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-sm border-[1.5px] border-transparent px-3 py-2 text-left transition-colors duration-150',
                        isSel
                          ? 'border-edge bg-tint text-accent'
                          : 'text-ink hover:bg-tint hover:text-accent'
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        <span className="block truncate font-mono text-xs text-ink-3">
                          {id} · {a.currency}
                          {a.businessName ? ` · ${a.businessName}` : ''}
                        </span>
                      </span>
                      <span className="flex flex-none items-center gap-2">
                        <CircleDot
                          aria-hidden
                          className={cn(
                            'h-3.5 w-3.5',
                            a.status === 1 ? 'text-ok' : 'text-ink-3'
                          )}
                        />
                        {isSel && <Check aria-hidden className="h-4 w-4 text-accent" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
