import { useCallback, useEffect, useRef, useState } from 'react';
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
  /* Akkauntlar ro'yxati ALOHIDA holat: u Facebook'dan keladi va 1–5 s
     oladi. Ilgari yuklanayotgan payt ham "ro'yxat bo'sh — qayta ulang"
     chiqardi — ulanish muvaffaqiyatli bo'lsa ham odam xato deb o'ylardi. */
  const [akkYuklanyapti, setAkkYuklanyapti] = useState(false);
  const [akkXato, setAkkXato] = useState<{ matn: string; qaytaUlash: boolean } | null>(null);
  const sorovRaqami = useRef(0);

  const load = useCallback(async () => {
    // Bir nechta load parallel ketishi mumkin (popup xabari + taymerlar):
    // faqat ENG OXIRGISINING javobi ekranga yoziladi.
    const raqam = ++sorovRaqami.current;
    const oxirgimi = () => raqam === sorovRaqami.current;
    setError('');
    try {
      const s = await facebookApi.status();
      if (!oxirgimi()) return;
      setStatus(s);
      setSelected(s.adAccountId ?? '');
      setLoading(false);
      if (!s.connected) return;

      setAkkYuklanyapti(true);
      setAkkXato(null);
      // Yangi token bilan birinchi so'rov ba'zan o'tmaydi — bir marta qayta urinamiz.
      for (let urinish = 0; urinish < 2; urinish++) {
        try {
          const { adAccounts } = await facebookApi.adAccounts();
          if (!oxirgimi()) return;
          setAdAccounts(adAccounts);
          setAkkXato(null);
          break;
        } catch (err) {
          if (!oxirgimi()) return;
          const qaytaUlash = Boolean(
            (err as { response?: { data?: { reconnect?: boolean } } }).response?.data?.reconnect
          );
          if (qaytaUlash || urinish === 1) {
            setAkkXato({
              qaytaUlash,
              matn: qaytaUlash
                ? tr("Facebook ruxsati yo'q yoki bekor qilingan — qayta ulang.", 'Facebook access is missing or was revoked — reconnect Facebook.', 'Доступ Facebook отсутствует или отозван — переподключите Facebook.')
                : tr("Reklama akkauntlari yuklanmadi.", 'Could not load ad accounts.', 'Не удалось загрузить рекламные аккаунты.'),
            });
            break;
          }
          await new Promise((r) => window.setTimeout(r, 1500));
          if (!oxirgimi()) return; // kutish paytida yangi load boshlandi
        }
      }
    } catch (err) {
      if (!oxirgimi()) return;
      setError(errMsg(err, 'Failed to load Facebook status'));
    } finally {
      // Faqat oxirgi so'rov holatni yopadi — eskisi yangisining "yuklanmoqda"sini o'chirmasin.
      if (oxirgimi()) {
        setLoading(false);
        setAkkYuklanyapti(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                  {akkYuklanyapti && !adAccounts.length
                    ? tr('Yuklanmoqda…', 'Loading…', 'Загрузка…')
                    : adAccounts.length
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
            {akkXato ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-bad">
                {akkXato.matn}
                {akkXato.qaytaUlash ? (
                  <button type="button" onClick={connect} className="font-semibold underline">
                    {tr('Qayta ulash', 'Reconnect', 'Переподключить')}
                  </button>
                ) : (
                  <button type="button" onClick={() => void load()} className="font-semibold underline">
                    {tr('Qayta urinish', 'Retry', 'Повторить')}
                  </button>
                )}
              </p>
            ) : akkYuklanyapti && !adAccounts.length ? (
              <p className="mt-1.5 text-xs text-ink-3">
                {tr(
                  "Facebook'dan reklama akkauntlari olinmoqda…",
                  'Fetching ad accounts from Facebook…',
                  'Получаем рекламные аккаунты из Facebook…'
                )}
              </p>
            ) : (
              !adAccounts.length && (
                <p className="mt-1.5 text-xs text-ink-3">
                  {tr(
                    'Ad account topilmadi — Facebook’ni qayta ulang.',
                    'No ad accounts found — reconnect Facebook.'
                  , 'Рекламные аккаунты не найдены — переподключите Facebook.')}
                </p>
              )
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
