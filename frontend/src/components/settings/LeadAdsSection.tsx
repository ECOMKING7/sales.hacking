/**
 * LEAD ADS — "bu lid qaysi reklamadan keldi?"
 *
 * Instant Form lidida UTM ham, fbclid ham, piksel ham yo'q — odam
 * saytga o'tmaydi. Qoladigan iz: Meta Lead ID yoki lidning o'zi.
 *
 * ASOSIY YO'L — BITTA TUGMA. "Facebook orqali ulash" → ruxsat oynasida
 * sahifalar tanlanadi → backend sahifa tokenlarini oladi va sahifani
 * leadgen webhook'iga obuna qiladi. Mijoz hech qanday token kiritmaydi.
 *
 * ZAXIRA — System User tokeni. Eski mijozlar va maxsus holatlar uchun
 * `<details>` ichida qoladi. Token maydoni HAR DOIM BO'SH boshlanadi:
 * server uni hech qachon qaytarmaydi (§4.1).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2, RefreshCw } from 'lucide-react';
import { facebookApi, leadAdsApi } from '../../services/api';
import type { LeadAdsStatus } from '../../types';
import { Badge, Button, Card, CardHeader, Input, SkeletonText, toast } from '../ui';
import { CardFooterRow, ErrorRow, LABEL, StatRow, errMsg } from './shared';
import { useTr } from '../../lib/til';
import { oauthXabargaObuna } from '../../lib/oauthKanal';

export default function LeadAdsSection() {
  const tr = useTr();
  const [status, setStatus] = useState<LeadAdsStatus | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [yechBusy, setYechBusy] = useState(false);
  const [yangilaBusy, setYangilaBusy] = useState(false);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const popupTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setStatus(await leadAdsApi.status());
    } catch (err) {
      setError(errMsg(err, tr('Lead Ads holati yuklanmadi', 'Failed to load Lead Ads status', 'Не удалось загрузить статус Lead Ads')));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    // Popup callback'i tugagach (BroadcastChannel) — holatni yangilaymiz.
    // Sahifalar obunasi callback'dan keyin FONDA tugaydi — 3 s va 8 s da ham.
    const taymerlar: number[] = [];
    const bekor = oauthXabargaObuna((x) => {
      if (x.tur !== 'fb') return;
      void load();
      taymerlar.push(...[3000, 8000, 15000].map((ms) => window.setTimeout(() => void load(), ms)));
    });
    return () => {
      bekor();
      taymerlar.forEach((t) => window.clearTimeout(t));
      if (popupTimer.current) window.clearInterval(popupTimer.current);
    };
  }, [load]);

  const sahifalar = status?.sahifalar ?? [];
  const obunali = sahifalar.filter((s) => s.leadgenObuna).length;
  const ulangan = obunali > 0 || Boolean(status?.tokenBor);

  /* Facebook ruxsat oynasi popup'da ochiladi. Yopilgach holat qayta
     yuklanadi — callback sahifalarni allaqachon saqlagan bo'ladi. */
  const ula = async () => {
    setXabar(null);
    try {
      const { url } = await facebookApi.connect(true);
      const popup = window.open(url, 'fb-oauth', 'width=600,height=720');
      if (!popup) {
        // Popup bloklangan — joriy oynada, `popup` belgisisiz.
        window.location.href = (await facebookApi.connect(false)).url;
        return;
      }
      if (popupTimer.current) window.clearInterval(popupTimer.current);
      /* Zaxira: BroadcastChannel ishlamasa. ⚠ facebook.com COOP sabab
         `closed` erta true bo'lishi mumkin — shunda bitta ortiqcha
         yuklash bo'ladi, xolos; asosiy signal BroadcastChannel. */
      popupTimer.current = window.setInterval(() => {
        if (popup.closed) {
          if (popupTimer.current) window.clearInterval(popupTimer.current);
          popupTimer.current = null;
          void load();
        }
      }, 1000);
    } catch (err) {
      setXabar({
        ok: false,
        matn: errMsg(err, tr('Facebook ulanishi boshlanmadi', 'Could not start Facebook connect', 'Не удалось начать подключение Facebook')),
      });
    }
  };

  const yangila = async () => {
    setYangilaBusy(true);
    setXabar(null);
    try {
      const r = await leadAdsApi.sahifalarniYangila();
      const n = r.sahifalar.filter((s) => s.leadgenObuna).length;
      toast.ok(
        tr(
          `${r.sahifalar.length} ta sahifa, ${n} tasi ulangan`,
          `${r.sahifalar.length} page(s), ${n} connected`,
          `Страниц: ${r.sahifalar.length}, подключено: ${n}`
        )
      );
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, tr('Sahifalar yangilanmadi', 'Failed to refresh pages', 'Не удалось обновить страницы')) });
    } finally {
      setYangilaBusy(false);
    }
  };

  const saqla = async () => {
    setBusy(true);
    setXabar(null);
    try {
      const r = await leadAdsApi.saveToken(token.trim());
      setToken(''); // Ekranda qoldirmaymiz.
      if (r.sinov) setXabar({ ok: !r.sinov.startsWith('Sinov muvaffaqiyatsiz'), matn: r.sinov });
      toast.ok(tr('Token saqlandi', 'Token saved', 'Токен сохранён'));
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, tr('Token saqlanmadi', 'Token not saved', 'Токен не сохранён')) });
    } finally {
      setBusy(false);
    }
  };

  const ochir = async () => {
    setBusy(true);
    setXabar(null);
    try {
      await leadAdsApi.saveToken('');
      setToken('');
      toast.ok(tr("Token o'chirildi", 'Token removed', 'Токен удалён'));
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, tr("Token o'chirilmadi", 'Token not removed', 'Токен не удалён')) });
    } finally {
      setBusy(false);
    }
  };

  /* Mavjud lidlarni qayta yechish. Bo'lak-bo'lak ishlaydi — server
     bir chaqiruvda 50 tadan ortig'ini ko'rmaydi (Vercel 300s limiti). */
  const yech = async () => {
    setYechBusy(true);
    setXabar(null);
    try {
      const r = await leadAdsApi.yech(50);
      setXabar({
        ok: r.reklamagaBoglandi > 0,
        matn: tr(
          `${r.korildi} lid ko'rildi · ${r.reklamagaBoglandi} tasi reklamaga bog'landi · ${r.reklamasiz} tasida reklama topilmadi`,
          `${r.korildi} leads checked · ${r.reklamagaBoglandi} linked to an ad · ${r.reklamasiz} without an ad`,
          `Проверено лидов: ${r.korildi} · привязано к рекламе: ${r.reklamagaBoglandi} · без рекламы: ${r.reklamasiz}`
        ) + (r.xatolar.length ? ` · ${tr('xato', 'error', 'ошибка')}: ${r.xatolar[0]}` : ''),
      });
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, tr('Qayta yechish bajarilmadi', 'Re-resolve failed', 'Не удалось обработать')) });
    } finally {
      setYechBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Link2 className="h-4 w-4" />}
        title={tr('Lead Ads — lid → reklama', 'Lead Ads — lead → ad', 'Lead Ads — лид → реклама')}
        description={tr(
          'Lead forma lidining qaysi reklamadan kelganini avtomatik aniqlaydi',
          'Automatically identifies which ad each Lead Form lead came from',
          'Автоматически определяет, из какой рекламы пришёл лид из Lead-формы'
        )}
        action={
          ulangan ? (
            <Badge tone="ok" dot>
              {tr('Ulangan', 'Connected', 'Подключено')}
            </Badge>
          ) : (
            <Badge tone="neutral">{tr('Ulanmagan', 'Not connected', 'Не подключено')}</Badge>
          )
        }
      />

      {loading ? (
        <SkeletonText lines={3} />
      ) : error ? (
        <ErrorRow message={error} onRetry={() => void load()} />
      ) : (
        <>
          {/* ── Sahifalar ── */}
          <div className="mb-5">
            <p className={LABEL}>{tr('Facebook sahifalari', 'Facebook Pages', 'Страницы Facebook')}</p>
            {sahifalar.length === 0 ? (
              <div className="rounded-md border-[1.5px] border-dashed border-line-2 px-4 py-4 text-sm text-ink-2">
                <p className="mb-3">
                  {tr(
                    "Hech qanday sahifa ulanmagan. Tugmani bosing va Facebook oynasida Lead formalaringiz turgan sahifalarni tanlang — token kiritish shart emas.",
                    'No pages connected. Click the button and select the Pages that run your Lead Forms in the Facebook window — no token needed.',
                    'Страницы не подключены. Нажмите кнопку и выберите в окне Facebook страницы с вашими Lead-формами — токен вводить не нужно.'
                  )}
                </p>
                <Button
                  onClick={() => void ula()}
                  icon={<Link2 className="h-4 w-4" />}
                  iconRight={<ExternalLink className="h-4 w-4" />}
                >
                  {tr('Facebook orqali ulash', 'Connect with Facebook', 'Подключить через Facebook')}
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-line rounded-md border-[1.5px] border-line">
                {sahifalar.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{s.nom ?? s.id}</p>
                      {s.xato && <p className="truncate text-xs text-bad">{s.xato}</p>}
                    </div>
                    {s.leadgenObuna ? (
                      <Badge tone="ok" dot>
                        {tr('Lidlar keladi', 'Receiving leads', 'Лиды поступают')}
                      </Badge>
                    ) : (
                      <Badge tone="warn">{tr('Obuna yo‘q', 'Not subscribed', 'Нет подписки')}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <dl className="mb-5">
            <StatRow label={tr('Lidlar (jami)', 'Leads (total)', 'Лиды (всего)')} value={status?.lidlar.jami ?? 0} />
            <StatRow label={tr('Meta Lead ID bor', 'With Meta Lead ID', 'С Meta Lead ID')} value={status?.lidlar.leadIdBor ?? 0} />
            <StatRow
              label={tr("Reklamaga bog'langan", 'Linked to an ad', 'Привязано к рекламе')}
              value={status?.lidlar.reklamagaBoglangan ?? 0}
            />
            <StatRow
              label={tr("Meta'dan yechilgan", 'Resolved via Meta', 'Получено из Meta')}
              value={`${status?.yechilgan.reklamaliOk ?? 0} / ${status?.yechilgan.ok ?? 0}`}
            />
            {(status?.yechilgan.xato ?? 0) > 0 && (
              <StatRow label={tr('Yechilmagan (xato)', 'Unresolved (error)', 'Не получено (ошибка)')} value={status?.yechilgan.xato ?? 0} />
            )}
          </dl>

          {status?.oxirgiXato && (
            <p className="mb-4 rounded-sm border-[1.5px] border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">
              {tr('Oxirgi xato', 'Last error', 'Последняя ошибка')}: {status.oxirgiXato}
            </p>
          )}

          {xabar && (
            <p
              className={`mb-3 rounded-sm border-[1.5px] px-3 py-2 text-xs ${
                xabar.ok ? 'border-ok/30 bg-ok/10 text-ok' : 'border-bad/30 bg-bad/10 text-bad'
              }`}
            >
              {xabar.matn}
            </p>
          )}

          {/* ── Zaxira: System User tokeni ── */}
          <details className="rounded-md border-[1.5px] border-line px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-ink-2">
              {tr(
                'Boshqa usul: System User tokeni (ixtiyoriy)',
                'Alternative: System User token (optional)',
                'Другой способ: токен System User (необязательно)'
              )}
            </summary>
            <div className="mt-3">
              <label className={LABEL} htmlFor="lead-ads-token">
                {tr('System User tokeni', 'System User token', 'Токен System User')}
              </label>
              <Input
                id="lead-ads-token"
                type="password"
                autoComplete="off"
                placeholder={
                  status?.tokenBor
                    ? tr('Saqlangan — almashtirish uchun yangisini kiriting', 'Saved — enter a new one to replace', 'Сохранён — введите новый для замены')
                    : 'EAA...'
                }
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-ink-2">
                {tr(
                  'Business Manager → Users → System users → Generate token. Ruxsatlar: ads_read, leads_retrieval, pages_show_list, pages_read_engagement, pages_manage_ads. Token shifrlanib saqlanadi va hech qachon qaytarilmaydi.',
                  'Business Manager → Users → System users → Generate token. Permissions: ads_read, leads_retrieval, pages_show_list, pages_read_engagement, pages_manage_ads. The token is stored encrypted and never returned.',
                  'Business Manager → Users → System users → Generate token. Разрешения: ads_read, leads_retrieval, pages_show_list, pages_read_engagement, pages_manage_ads. Токен хранится в зашифрованном виде и никогда не возвращается.'
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void saqla()} disabled={busy || !token.trim()}>
                  {busy ? tr('Saqlanyapti…', 'Saving…', 'Сохранение…') : tr('Saqlash va sinash', 'Save and test', 'Сохранить и проверить')}
                </Button>
                {status?.tokenBor && (
                  <Button size="sm" variant="ghost" onClick={() => void ochir()} disabled={busy}>
                    {tr("Tokenni o'chirish", 'Remove token', 'Удалить токен')}
                  </Button>
                )}
              </div>
            </div>
          </details>

          <CardFooterRow>
            <div className="flex flex-wrap items-center gap-2">
              {sahifalar.length > 0 && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => void yangila()}
                    loading={yangilaBusy}
                    icon={<RefreshCw className="h-4 w-4" />}
                  >
                    {tr('Sahifalarni yangilash', 'Refresh pages', 'Обновить страницы')}
                  </Button>
                  <Button variant="ghost" onClick={() => void ula()} icon={<ExternalLink className="h-4 w-4" />}>
                    {tr('Sahifa qo‘shish', 'Add pages', 'Добавить страницы')}
                  </Button>
                </>
              )}
              {ulangan && (
                <Button variant="secondary" onClick={() => void yech()} disabled={yechBusy}>
                  {yechBusy
                    ? tr('Yechilyapti…', 'Resolving…', 'Обработка…')
                    : tr('Eski lidlarni yechish', 'Resolve past leads', 'Обработать старые лиды')}
                </Button>
              )}
            </div>
          </CardFooterRow>
        </>
      )}
    </Card>
  );
}
