import { useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { metaCapiApi } from '../../services/api';
import type { MetaCapiStatus } from '../../types';
import { Badge, Button, Card, CardHeader, Input, SkeletonText, cn, toast } from '../ui';
import { CardFooterRow, ErrorRow, LABEL, StatRow, errMsg } from './shared';

export default function MetaCapiSection() {
  const [status, setStatus] = useState<MetaCapiStatus | null>(null);
  const [datasetId, setDatasetId] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [currency, setCurrency] = useState('');
  const [evLead, setEvLead] = useState('');
  const [evQual, setEvQual] = useState('');
  const [evPurchase, setEvPurchase] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await metaCapiApi.status();
      setStatus(s);
      setDatasetId(s.datasetId ?? '');
      setCountryCode(s.phoneCountryCode);
      setCurrency(s.currency);
      setEvLead(s.eventNames.lead);
      setEvQual(s.eventNames.qualified);
      setEvPurchase(s.eventNames.purchase);
    } catch (err) {
      setError(errMsg(err, 'Meta CAPI holati yuklanmadi'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (
    patch: Parameters<typeof metaCapiApi.save>[0],
    /** Bajarilgach chiqadigan matn. Har tugma o'z natijasini aytadi. */
    xabar = 'Saqlandi'
  ) => {
    setBusy(true);
    setError('');
    setWarning('');
    try {
      const res = await metaCapiApi.save(patch);
      if (res.warning) setWarning(res.warning);
      await load();
      toast.ok(xabar);
    } catch (err) {
      setError(errMsg(err, 'Saqlanmadi'));
    } finally {
      setBusy(false);
    }
  };

  const sent = status?.events.filter((e) => e.status === 'ok') ?? [];
  const failed = status?.events.filter((e) => e.status === 'error') ?? [];

  return (
    <Card padding="lg">
      <CardHeader
        title="Meta Conversions API"
        description="amoCRM natijasini Meta algoritmiga qaytaradi."
        icon={<Send className="h-5 w-5" />}
        action={
          status?.enabled ? (
            <Badge tone="ok" dot>
              Yoqilgan
            </Badge>
          ) : (
            <Badge tone="neutral">O'chirilgan</Badge>
          )
        }
      />

      {error && <ErrorRow message={error} onRetry={() => void load()} />}
      {warning && <p className="mb-4 text-sm text-warn">{warning}</p>}

      {loading ? (
        <SkeletonText lines={3} />
      ) : (
        <div>
          <p className="mb-4 text-xs leading-relaxed text-ink-2">
            Yo'nalish: <b>amoCRM → Meta</b>. Bu dashboard'ga to'g'ridan-to'g'ri raqam
            qo'shmaydi — Meta hodisani o'zi reklamaga bog'laydi va u keyin{' '}
            <code>fb_purchases</code> / <code>fb_revenue</code> ustunlarida qaytadi.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input
                label="Dataset ID (piksel)"
                placeholder="1234567890"
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                hint="Events Manager → Data sources → Settings"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <Input
              label="Telefon kodi"
              placeholder="998"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              hint="E.164 uchun"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          <div className="mt-3 sm:w-40">
            <Input
              label="Valyuta"
              placeholder="UZS"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              autoComplete="off"
            />
          </div>

          {/* §3.1: hodisa nomlari kodda emas. Meta'da standart nom
              Ads Manager'da darhol ishlaydi, custom nom esa avval
              Custom Conversion talab qiladi — shuning uchun tanlov. */}
          <div className="mt-5">
            <span className={LABEL}>Meta hodisa nomlari</span>
            <p className="mt-1 mb-2.5 text-xs leading-relaxed text-ink-3">
              Bosqich uchta va ular <b>hamma mijozda bir xil</b>: lid tushdi,
              sifatli lid, sotuv. Qaysi CRM etapi qaysi bosqichga kirishini
              2-qadamda o'zingiz belgilaysiz — bu yerdagi nomlar esa faqat
              Meta'ga qanday atalib yuborilishini bildiradi.
            </p>
            <p className="mb-2.5 text-xs leading-relaxed text-ink-3">
              O'zgartirish <b>bitta holatda</b> kerak: saytingizdagi piksel ham
              <span className="font-mono"> Purchase</span> yuborayotgan bo'lsa,
              ikkala oqim Ads Manager'da bitta ustunda qo'shilib ketadi va
              sotuvlar ikki barobar ko'rinadi. O'shanda CRM oqimiga boshqa nom
              bering.
            </p>
            <p className="mb-2.5 text-xs leading-relaxed text-ink-3">
              <span className="font-mono">Lead</span> va{' '}
              <span className="font-mono">Purchase</span> — standart nomlar, Ads
              Manager'da darhol optimizatsiya maqsadi qilib tanlanadi.{' '}
              <span className="font-mono">QualifiedLead</span> — custom: Facebook'da
              «sifatli lid» degan standart hodisa yo'q, shuning uchun unga
              optimallashish uchun Events Manager'da <b>Custom Conversion</b>{' '}
              yaratish kerak. Standart nom tanlab ma'noni buzgandan ko'ra, to'g'ri
              nom qo'yib bitta qo'shimcha qadam qilgan ma'qul.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['Lid tushdi', evLead, setEvLead, 'capi-ev-lead'],
                  ['Sifatli lid', evQual, setEvQual, 'capi-ev-qual'],
                  ['Sotuv', evPurchase, setEvPurchase, 'capi-ev-purchase'],
                ] as const
              ).map(([label, value, setter, id]) => (
                <div key={id}>
                  <label htmlFor={id} className={LABEL}>
                    {label}
                  </label>
                  <input
                    id={id}
                    list="capi-standard-events"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className={cn(
                      'h-10 w-full rounded-sm border-[1.5px] border-line-2 bg-surface px-3.5',
                      'text-sm text-ink placeholder:text-ink-3',
                      'transition-[box-shadow,border-color] duration-200',
                      'focus:border-edge focus:shadow-glow-md focus:outline-none'
                    )}
                  />
                  {!status?.standardEvents.includes(value) && value.trim() !== '' && (
                    <p className="mt-1.5 text-xs text-warn">custom — Custom Conversion kerak</p>
                  )}
                </div>
              ))}
            </div>

            <datalist id="capi-standard-events">
              {(status?.standardEvents ?? []).map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <dl className="mt-5">
            <StatRow
              label="Token (.env)"
              value={
                status?.tokenConfigured ? (
                  <span className="text-ok">o'rnatilgan</span>
                ) : (
                  <span className="text-bad">yo'q</span>
                )
              }
            />
            <StatRow
              label="Yuborilgan hodisalar"
              value={sent.length ? sent.map((e) => `${e.eventName} ${e.count}`).join(' · ') : '—'}
            />
            {failed.length > 0 && (
              <StatRow
                label="Xatolar"
                value={
                  <span className="text-bad">
                    {failed.map((e) => `${e.eventName} ${e.count}`).join(' · ')}
                  </span>
                }
              />
            )}
          </dl>

          <CardFooterRow>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() =>
                  void persist({
                    datasetId: datasetId.trim() || null,
                    phoneCountryCode: countryCode.trim() || undefined,
                    currency: currency.trim() || undefined,
                    eventLead: evLead.trim() || undefined,
                    eventQualified: evQual.trim() || undefined,
                    eventPurchase: evPurchase.trim() || undefined,
                  })
                }
                loading={busy}
                className="sm:w-28"
              >
                Save
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void persist(
                    { enabled: !status?.enabled },
                    status?.enabled ? "CAPI o'chirildi" : 'CAPI yoqildi'
                  )
                }
                disabled={busy || (!status?.enabled && !datasetId.trim())}
              >
                {status?.enabled ? 'O‘chirish' : 'Yoqish'}
              </Button>
            </div>
          </CardFooterRow>
        </div>
      )}
    </Card>
  );
}

// ---------- Pixel ----------
