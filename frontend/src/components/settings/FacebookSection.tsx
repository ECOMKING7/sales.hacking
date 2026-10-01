import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Megaphone } from 'lucide-react';
import { facebookApi } from '../../services/api';
import type { AdAccount, FbStatus } from '../../types';
import { Button, Card, CardHeader, EmptyState, SkeletonText, cn, toast } from '../ui';
import { useTr } from '../../lib/til';
import { oauthXabargaObuna } from '../../lib/oauthKanal';
import { CardFooterRow, ConnectionBadge, ErrorRow, LABEL, SELECT, StatRow, errMsg } from './shared';

// ---------- Facebook ----------
export default function FacebookSection() {
  const tr = useTr();
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
    return oauthXabargaObuna((x) => {
      if (x.tur === 'fb') void load();
    });
  }, [load]);

  const connect = async () => {
    try {
      const { url } = await facebookApi.connect(true);
      const w = window.open(url, 'fb-oauth', 'width=600,height=720');
      // Popup bloklangan — joriy oynada, `popup` belgisisiz (aks holda
      // callback'dan keyin asosiy oyna o'zini yopib qo'yardi).
      if (!w) window.location.href = (await facebookApi.connect(false)).url;
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
      toast.ok(tr('Reklama akkaunti saqlandi', 'Ad account saved', 'Рекламный аккаунт сохранён'));
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
        description={tr('Reklama xarajati va yetkazish metrikalari.', 'Ad spend and delivery metrics.', 'Расходы на рекламу и метрики показов.')}
        icon={<Megaphone className="h-5 w-5" />}
        action={<ConnectionBadge connected={Boolean(status?.connected)} />}
      />

      {error && <ErrorRow message={error} onRetry={() => void load()} />}

      {loading ? (
        <SkeletonText lines={3} />
      ) : status?.connected ? (
        <div>
          <dl className="mb-5">
            <StatRow label={tr('Reklama akkaunti', 'Ad account', 'Рекламный аккаунт')} value={status.adAccountId ?? '—'} />
            <StatRow
              label={tr('Token muddati', 'Token expires', 'Токен действует до')}
              value={
                status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '—'
              }
            />
          </dl>

          <div>
            <label htmlFor="fb-ad-account" className={LABEL}>
              {tr('Reklama akkauntini tanlang', 'Select ad account', 'Выберите рекламный аккаунт')}
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
                  {adAccounts.length
                    ? tr('— tanlang —', '— select —', '— выберите —')
                    : tr('— ro‘yxat bo‘sh —', '— list is empty —', '— список пуст —')}
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
                {tr('Saqlash', 'Save', 'Сохранить')}
              </Button>
            </div>
            {!adAccounts.length && (
              <p className="mt-1.5 text-xs text-ink-3">
                {tr(
                  'Ad account topilmadi — Facebook’ni qayta ulang.',
                  'No ad accounts found — reconnect Facebook.'
                , 'Рекламные аккаунты не найдены — переподключите Facebook.')}
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
              {tr('Facebook’ni qayta ulash', 'Reconnect Facebook', 'Переподключить Facebook')}
            </Button>
          </CardFooterRow>
        </div>
      ) : (
        <EmptyState
          icon={<Megaphone />}
          title={tr('Facebook Ads ulanmagan', 'Facebook Ads is not connected', 'Facebook Ads не подключён')}
          hint={tr("xarajat yo'q · ROAS hisoblanmaydi", 'no spend data · ROAS cannot be computed', 'нет данных о расходах · ROAS не рассчитывается')}
          action={
            <Button
              variant="secondary"
              onClick={connect}
              icon={<Megaphone className="h-4 w-4" />}
              iconRight={<ExternalLink className="h-4 w-4" />}
            >
              {tr('Facebook Ads’ni ulash', 'Connect Facebook Ads', 'Подключить Facebook Ads')}
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
