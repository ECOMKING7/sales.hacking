/**
 * WEBHOOK HOLATI — "lid tushganda bizga xabar kelyaptimi?"
 *
 * NEGA ALOHIDA BO'LIM. amoCRM'da integratsiyani o'rnatish va webhook
 * obunasi ikki boshqa narsa. Birinchisi bo'lib ikkinchisi bo'lmasa —
 * import ishlaydi, dashboard to'ladi, hamma "ulangan" deb o'ylaydi,
 * lekin yangi lid haqida bizga hech narsa kelmaydi va atribusiya
 * 0% turadi. Hech qayerda xato chiqmaydi.
 *
 * Bu bo'lim aynan o'sha ko'rinmas holatni ko'rinadigan qiladi.
 *
 * Begona webhook'lar ham ko'rsatiladi — mijozning CRM ma'lumoti yana
 * qayerga ketayotganini bilishi uchun. Bu ogohlantirish emas, fakt.
 */
import { useCallback, useEffect, useState } from 'react';
import { Webhook } from 'lucide-react';
import { amocrmApi } from '../../services/api';
import type { WebhookRoyxat } from '../../types';
import { Badge, Button, Card, CardHeader, SkeletonText, toast } from '../ui';
import { CardFooterRow, ErrorRow, StatRow, errMsg } from './shared';

export default function WebhookSection() {
  const [royxat, setRoyxat] = useState<WebhookRoyxat | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setRoyxat(await amocrmApi.webhooks());
    } catch (err) {
      setError(errMsg(err, "Webhook ro'yxati yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tikla = async () => {
    setBusy(true);
    setXabar(null);
    try {
      const n = await amocrmApi.ensureWebhook();
      setXabar({ ok: n.holat !== 'xato', matn: n.xabar });
      if (n.holat !== 'xato') toast.ok('Webhook tekshirildi');
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, "Webhook ta'minlanmadi") });
    } finally {
      setBusy(false);
    }
  };

  /**
   * ⚠ "ISHLAYAPTI" UCHUN IKKI SHART, BITTASI EMAS.
   *
   * Obuna bor bo'lishi yetmaydi — 2026-09-19 da obuna ro'yxatda
   * turardi-yu, bizga hech narsa kelmasdi va bu OYLAB sezilmadi.
   * Shuning uchun yashil belgi faqat REAL SIGNAL kelganda chiqadi.
   */
  const obunaBor = (royxat?.bizniki ?? 0) > 0 && (royxat?.yetishmayotgan.length ?? 1) === 0;
  const signalBor = Boolean(royxat?.signal?.oxirgi);
  const ishlaydi = obunaBor && signalBor;
  const begona = (royxat?.webhooklar ?? []).filter((w) => !w.bizniki && !w.ochirilgan);

  return (
    <Card>
      <CardHeader
        icon={<Webhook className="h-4 w-4" />}
        title="Webhook — CRM bizga xabar beradi"
        description="Yangi lid va etap o'zgarishi shu yo'l bilan keladi"
        action={
          ishlaydi ? (
            <Badge tone="ok" dot>
              Ishlayapti
            </Badge>
          ) : obunaBor ? (
            // Obuna bor, signal yo'q — eng xavfli holat, "yo'q" emas.
            <Badge tone="warn">Signal yo'q</Badge>
          ) : (
            <Badge tone="bad">Ro'yxatda yo'q</Badge>
          )
        }
      />

      {loading ? (
        <SkeletonText lines={3} />
      ) : error ? (
        <ErrorRow message={error} onRetry={() => void load()} />
      ) : (
        <>
          <p
            className={`mb-4 rounded-sm border-[1.5px] px-3 py-2 text-xs ${
              ishlaydi
                ? 'border-ok/30 bg-ok/10 text-ok'
                : 'border-bad/30 bg-bad/10 text-bad'
            }`}
          >
            {royxat?.xulosa}
          </p>

          <dl className="mb-5">
            {/* Eng muhim qator eng tepada: obuna emas, SIGNAL. */}
            <StatRow
              label="Oxirgi signal"
              value={
                royxat?.signal?.oxirgi
                  ? `${vaqtMatni(royxat.signal.oxirgi)}${
                      royxat.signal.turi ? ` — ${royxat.signal.turi}` : ''
                    }`
                  : 'hech qachon kelmagan'
              }
            />
            <StatRow label="Jami qabul qilingan" value={royxat?.signal?.soni ?? 0} />
            <StatRow label="Jami webhook" value={royxat?.jami ?? 0} />
            <StatRow label="Bizniki" value={royxat?.bizniki ?? 0} />
            {(royxat?.yetishmayotgan.length ?? 0) > 0 && (
              <StatRow
                label="Obuna bo'lmagan hodisalar"
                value={royxat?.yetishmayotgan.join(', ')}
              />
            )}
          </dl>

          {begona.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold text-ink-2">
                Boshqa integratsiyalar ham CRM ma'lumotingizni olyapti:
              </p>
              <ul className="space-y-1">
                {begona.map((w) => (
                  <li key={w.id ?? w.manzil} className="text-xs text-ink-2">
                    <span className="text-ink">{hostdan(w.manzil)}</span>
                    {' — '}
                    {w.hodisalar.join(', ') || 'hodisa ko\'rsatilmagan'}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-2">
                Bularni biz qo'shmadik va o'chirmaymiz. Keraksizini amoCRM'ning
                "Veb-kancalar" oynasidan olib tashlashingiz mumkin.
              </p>
            </div>
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

          <CardFooterRow>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void tikla()} disabled={busy}>
                {busy ? 'Tekshirilyapti…' : 'Tekshirish va tiklash'}
              </Button>
              <span className="text-xs text-ink-2">
                Bor bo'lsa hech narsa o'zgarmaydi. Hech narsa o'chirilmaydi.
              </span>
            </div>
          </CardFooterRow>
        </>
      )}
    </Card>
  );
}

/**
 * "hozirgina" / "12 daqiqa oldin" / "3 soat oldin" / "6 kun oldin".
 * Noto'g'ri sana kelsa — o'zini qaytaradi, yiqilmaydi.
 */
function vaqtMatni(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const daq = Math.floor(ms / 60_000);
  if (daq < 1) return 'hozirgina';
  if (daq < 60) return `${daq} daqiqa oldin`;
  const soat = Math.floor(daq / 60);
  if (soat < 24) return `${soat} soat oldin`;
  return `${Math.floor(soat / 24)} kun oldin`;
}

/** `https://host/yo'l?secret=***` → `host`. URL bo'lmasa o'zini qaytaradi. */
function hostdan(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 40);
  }
}
