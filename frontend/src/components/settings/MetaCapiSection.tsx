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
  // Token faqat KIRITISH uchun. Server uni hech qachon qaytarmaydi,
  // shuning uchun bu maydon har doim bo'sh boshlanadi.
  const [token, setToken] = useState('');
  const [evPurchase, setEvPurchase] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  /* Sinov hodisasi. Sozlama emas — saqlanmaydi, faqat shu seansda yashaydi. */
  const [testKod, setTestKod] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testJavob, setTestJavob] = useState<{ ok: boolean; matn: string } | null>(null);

  const sinov = async () => {
    setTestBusy(true);
    setTestJavob(null);
    try {
      const r = await metaCapiApi.test(testKod.trim());
      setTestJavob({
        ok: r.yuborildi,
        matn: r.yuborildi
          ? `"${r.event_name}" yuborildi. Events Manager > Test Events da ko'rinishi kerak. Meta javobi: ${r.javob}`
          : `Yuborilmadi. Meta sababi: ${r.javob}`,
      });
    } catch (err) {
      setTestJavob({ ok: false, matn: errMsg(err, 'Sinov bajarilmadi') });
    } finally {
      setTestBusy(false);
    }
  };

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
      // Token maydoni saqlangach tozalanadi — ekranda qolib ketmasin.
      if (patch.token) setToken('');
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

          <div className="mt-5">
            <label htmlFor="capi-token" className={LABEL}>
              Access token
            </label>
            <p className="mb-2 text-xs leading-relaxed text-ink-3">
              Events Manager → dataset → Settings → Conversions API →{' '}
              <b>Generate access token</b>. Token AES-256 bilan shifrlanib
              saqlanadi, ekranda qaytib ko'rsatilmaydi va log'ga tushmaydi —
              xuddi Facebook va amoCRM tokenlari kabi.
            </p>
            <input
              id="capi-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={status?.tokenConfigured ? '•••••• (o\'rnatilgan)' : 'EAAG...'}
              className={cn(
                'h-10 w-full rounded-sm border-[1.5px] border-line-2 bg-surface px-3.5',
                'font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-3',
                'transition-[box-shadow,border-color] duration-200',
                'focus:border-edge focus:shadow-glow-md focus:outline-none'
              )}
            />
            <p className="mt-1.5 text-xs text-ink-3">
              Bo'sh qoldirsangiz mavjud token o'zgarmaydi.
            </p>
          </div>

          <dl className="mt-5">
            <StatRow
              label="Token"
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
                    token: token.trim() || undefined,
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

          {/* ── Sinov ──
              Birinchi haqiqiy hodisa real lid etap o'zgartirgandagina
              ketadi — soatlar yoki kunlar keyin. Va CAPI xatolari JIM:
              hodisa ketmasa hech kim bilmaydi. Shuning uchun shu tugma
              bor: hozir yuboradi va Meta nima deganini aynan ko'rsatadi. */}
          <div className="border-t border-line pt-4">
            <label className={LABEL} htmlFor="capi-test-code">
              Sinov hodisasi
            </label>
            <p className="mb-2 text-xs leading-relaxed text-ink-3">
              Events Manager → Dataset → <span className="text-ink-2">Test Events</span>{' '}
              tabidagi kodni kiriting (masalan <span className="font-mono">TEST12345</span>).
              Hodisa faqat o'sha tabda ko'rinadi, haqiqiy statistikaga{' '}
              <span className="font-medium">tushmaydi</span> va dedup jadvaliga
              yozilmaydi.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="capi-test-code"
                value={testKod}
                onChange={(e) => setTestKod(e.target.value)}
                placeholder="TEST12345"
                className="w-44 font-mono"
              />
              <Button
                variant="secondary"
                onClick={() => void sinov()}
                loading={testBusy}
                disabled={testBusy || testKod.trim().length < 4 || !status?.enabled}
              >
                Sinov yuborish
              </Button>
              {!status?.enabled && (
                <span className="text-xs text-ink-3">
                  Avval CAPI yoqilishi kerak
                </span>
              )}
            </div>

            {testJavob && (
              <p
                className={cn(
                  'mt-2 break-words border-[1.5px] px-3 py-2 text-xs leading-relaxed',
                  testJavob.ok
                    ? 'border-ok/40 bg-ok/5 text-ink-2'
                    : 'border-bad/40 bg-bad/5 text-ink-2'
                )}
              >
                {testJavob.matn}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- Pixel ----------
