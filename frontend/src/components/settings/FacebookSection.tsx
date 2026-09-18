import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Megaphone } from 'lucide-react';
import { facebookApi } from '../../services/api';
import type { AdAccount, FbStatus } from '../../types';
import { Button, Card, CardHeader, EmptyState, SkeletonText, cn } from '../ui';
import { CardFooterRow, ConnectionBadge, ErrorRow, LABEL, SELECT, StatRow, errMsg } from './shared';

// ---------- Facebook ----------
export default function FacebookSection() {
  const [status, setStatus] = useState<FbStatus | null>(null);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await facebookApi.status();
      setStatus(s);
      setSelected(s.adAccountId ?? '');
      if (s.connected) {
        try {
          const { adAccounts } = await facebookApi.adAccounts();
          setAdAccounts(adAccounts);
        } catch {
          /* ad accounts need a live FB token */
        }
      }
    } catch (err) {
      setError(errMsg(err, 'Failed to load Facebook status'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    try {
      const { url } = await facebookApi.connect();
      window.open(url, '_blank', 'width=600,height=700');
    } catch (err) {
      setError(errMsg(err, 'Failed to start Facebook connect'));
    }
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await facebookApi.selectAdAccount(selected);
      await load();
    } catch (err) {
      setError(errMsg(err, 'Failed to select ad account'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg">
      <CardHeader
        title="Facebook Ads"
        description="Ad spend and delivery metrics."
        icon={<Megaphone className="h-5 w-5" />}
        action={<ConnectionBadge connected={Boolean(status?.connected)} />}
      />

      {error && <ErrorRow message={error} onRetry={() => void load()} />}

      {loading ? (
        <SkeletonText lines={3} />
      ) : status?.connected ? (
        <div>
          <dl className="mb-5">
            <StatRow label="Ad account" value={status.adAccountId ?? '—'} />
            <StatRow
              label="Token expires"
              value={
                status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '—'
              }
            />
          </dl>

          <div>
            <label htmlFor="fb-ad-account" className={LABEL}>
              Select ad account
            </label>
            {/* Mobilda ustma-ust, keng ekranda yonma-yon. Tugma qisqarmaydi
                va balandligi select bilan bir xil (ikkalasi ham h-10). */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id="fb-ad-account"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className={cn(SELECT, 'min-w-0 sm:flex-1')}
              >
                <option value="">
                  {adAccounts.length ? '— tanlang —' : '— ro‘yxat bo‘sh —'}
                </option>
                {adAccounts.map((a) => (
                  <option key={a.id} value={a.accountId || a.id}>
                    {a.name} ({a.accountId || a.id})
                  </option>
                ))}
              </select>
              <Button
                onClick={save}
                loading={busy}
                disabled={!selected}
                className="flex-none sm:w-28"
              >
                Save
              </Button>
            </div>
            {!adAccounts.length && (
              <p className="mt-1.5 text-xs text-ink-3">
                Ad account topilmadi — tokenni yangilash kerak bo‘lishi mumkin.
              </p>
            )}
          </div>

          <CardFooterRow>
            <Button
              variant="ghost"
              size="sm"
              onClick={connect}
              icon={<ExternalLink className="h-4 w-4" />}
            >
              Reconnect Facebook
            </Button>
          </CardFooterRow>
        </div>
      ) : (
        <EmptyState
          icon={<Megaphone />}
          title="Facebook Ads ulanmagan"
          hint="xarajat yo'q · ROAS hisoblanmaydi"
          action={
            <Button
              variant="secondary"
              onClick={connect}
              icon={<Megaphone className="h-4 w-4" />}
              iconRight={<ExternalLink className="h-4 w-4" />}
            >
              Connect Facebook Ads
            </Button>
          }
        />
      )}
    </Card>
  );
}

// ---------- AmoCRM: qo'lda ulash (xususiy integratsiya) ----------
/**
 * amoCRM xususiy ("Личная") integratsiyani amoMarket'ning install oqimi
 * orqali ulashga ruxsat bermaydi — consent sahifasi "Нет доступных
 * аккаунтов" deb qaytaradi. Buning o'rniga integratsiya sozlamalarida
 * 20 daqiqa amal qiladigan "Код авторизации" beriladi. Shu forma o'sha
 * kodni backend'ga yuboradi; backend uni tokenga almashtiradi.
 *
 * Kod bir martalik — xato bo'lsa amoCRM'dan yangisini olish kerak.
 */
/** Mijoz o'z amoCRM'ida bajaradigan qadamlar — formadan oldin turadi. */
