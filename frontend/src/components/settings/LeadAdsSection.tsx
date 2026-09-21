/**
 * LEAD ADS — "bu lid qaysi reklamadan keldi?"
 *
 * NEGA ALOHIDA BO'LIM. Instant Form orqali kelgan lidda UTM ham,
 * fbclid ham, piksel ham yo'q — odam saytga umuman o'tmaydi. Qoladigan
 * yagona iz Meta Lead ID, lekin u reklamani aytmaydi: uni Meta'dan
 * so'rash kerak, va bu chaqiruv `ads_management` + sahifa huquqlarini
 * talab qiladi. OAuth orqali olinadigan tokenimizda faqat `ads_read`.
 *
 * Shuning uchun mijoz o'z System User tokenini shu yerga kiritadi.
 *
 * Token MAYDONI HAR DOIM BO'SH BOSHLANADI: server uni hech qachon
 * qaytarmaydi (§4.1). Ekranda faqat "bor/yo'q" ko'rinadi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { leadAdsApi } from '../../services/api';
import type { LeadAdsStatus } from '../../types';
import { Badge, Button, Card, CardHeader, Input, SkeletonText, toast } from '../ui';
import { CardFooterRow, ErrorRow, LABEL, StatRow, errMsg } from './shared';

export default function LeadAdsSection() {
  const [status, setStatus] = useState<LeadAdsStatus | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [yechBusy, setYechBusy] = useState(false);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setStatus(await leadAdsApi.status());
    } catch (err) {
      setError(errMsg(err, 'Lead Ads holati yuklanmadi'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saqla = async () => {
    setBusy(true);
    setXabar(null);
    try {
      const r = await leadAdsApi.saveToken(token.trim());
      setToken(''); // Ekranda qoldirmaymiz.
      if (r.sinov) setXabar({ ok: !r.sinov.startsWith('Sinov muvaffaqiyatsiz'), matn: r.sinov });
      toast.ok('Token saqlandi');
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, 'Token saqlanmadi') });
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
      toast.ok("Token o'chirildi");
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, "Token o'chirilmadi") });
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
        matn: `${r.korildi} lid ko'rildi · ${r.reklamagaBoglandi} tasi reklamaga bog'landi · ${r.reklamasiz} tasida reklama topilmadi${
          r.xatolar.length ? ` · xato: ${r.xatolar[0]}` : ''
        }. ${r.izoh}`,
      });
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, 'Qayta yechish bajarilmadi') });
    } finally {
      setYechBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Link2 className="h-4 w-4" />}
        title="Lead Ads — lid → reklama"
        description="Meta Lead ID orqali qaysi reklama lid keltirganini aniqlaydi"
        action={
          status?.tokenBor ? (
            <Badge tone="ok" dot>
              Token bor
            </Badge>
          ) : (
            <Badge tone="neutral">Token yo'q</Badge>
          )
        }
      />

      {loading ? (
        <SkeletonText lines={3} />
      ) : error ? (
        <ErrorRow message={error} onRetry={() => void load()} />
      ) : (
        <>
          <dl className="mb-5">
            <StatRow label="Lidlar (jami)" value={status?.lidlar.jami ?? 0} />
            <StatRow label="Meta Lead ID bor" value={status?.lidlar.leadIdBor ?? 0} />
            <StatRow
              label="Reklamaga bog'langan"
              value={status?.lidlar.reklamagaBoglangan ?? 0}
            />
            <StatRow
              label="Meta'dan yechilgan"
              value={`${status?.yechilgan.reklamaliOk ?? 0} / ${status?.yechilgan.ok ?? 0}`}
            />
            {(status?.yechilgan.xato ?? 0) > 0 && (
              <StatRow label="Yechilmagan (xato)" value={status?.yechilgan.xato ?? 0} />
            )}
          </dl>

          {status?.oxirgiXato && (
            <p className="mb-4 rounded-sm border-[1.5px] border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">
              Oxirgi xato: {status.oxirgiXato}
            </p>
          )}

          <div>
            <label className={LABEL} htmlFor="lead-ads-token">
              System User tokeni
            </label>
            <Input
              id="lead-ads-token"
              type="password"
              autoComplete="off"
              placeholder={status?.tokenBor ? 'Saqlangan — almashtirish uchun yangisini kiriting' : 'EAA...'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-ink-2">
              Business Manager → Users → System users → Generate token. Kerakli
              ruxsatlar: ads_read, ads_management, pages_show_list,
              pages_read_engagement, leads_retrieval. Token shifrlanib saqlanadi
              va hech qachon qaytarilmaydi.
            </p>
          </div>

          {xabar && (
            <p
              className={`mt-3 rounded-sm border-[1.5px] px-3 py-2 text-xs ${
                xabar.ok
                  ? 'border-ok/30 bg-ok/10 text-ok'
                  : 'border-bad/30 bg-bad/10 text-bad'
              }`}
            >
              {xabar.matn}
            </p>
          )}

          <CardFooterRow>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void saqla()} disabled={busy || !token.trim()}>
                {busy ? 'Saqlanyapti…' : 'Saqlash va sinash'}
              </Button>
              {status?.tokenBor && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => void yech()}
                    disabled={yechBusy}
                  >
                    {yechBusy ? 'Yechilyapti…' : 'Eski lidlarni yechish'}
                  </Button>
                  <Button variant="ghost" onClick={() => void ochir()} disabled={busy}>
                    Tokenni o'chirish
                  </Button>
                </>
              )}
            </div>
          </CardFooterRow>
        </>
      )}
    </Card>
  );
}
