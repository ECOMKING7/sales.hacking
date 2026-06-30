import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Check, CircleDot } from 'lucide-react';
import { facebookApi } from '../../services/api';
import type { AdAccount } from '../../types';

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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded bg-[#1877F2] text-[10px] font-bold text-white">
          f
        </span>
        <span className="max-w-[180px] truncate">{label}</span>
        {selectedId && <span className="text-xs text-gray-400">({selectedId})</span>}
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          {!status.data?.connected ? (
            <p className="px-3 py-4 text-center text-sm text-gray-400">
              Facebook not connected. Connect it in Settings to list ad accounts.
            </p>
          ) : accounts.isLoading ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-gray-400">No ad accounts found.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {list.map((a) => {
                const id = a.accountId || a.id;
                const isSel = id === selectedId;
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => choose(a)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-gray-100"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {a.name}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {id} · {a.currency}
                          {a.businessName ? ` · ${a.businessName}` : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <CircleDot
                          className={`h-3.5 w-3.5 ${a.status === 1 ? 'text-green-500' : 'text-gray-300'}`}
                        />
                        {isSel && <Check className="h-4 w-4 text-indigo-600" />}
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
