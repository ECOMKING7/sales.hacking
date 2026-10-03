import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, X } from 'lucide-react';
import { billingApi } from '../services/api';
import { Badge, Button, Card, Input, Modal, Skeleton, toast } from '../components/ui';
import { useTr, type Tr } from '../lib/til';
import { PaymeBrauzerXato, paymeKartaBoshla, paymeKartaTasdiqla } from '../lib/paymeKarta';
import type { BillingMalumot, PullikPlan } from '../types';

/* ─────────────────────────────────────────────────────────────
   TARIFLAR VA TO'LOV.
   Narxlar backend'dan (env) — kodda qotirilmaydi. Narxi yo'q tarif
   "Tez orada" bo'lib turadi va sotilmaydi.
   Avto-yechish: karta tokeni (Payme/Click) saqlanadi, har oy shu sanada
   yechiladi, 7 kun oldin email keladi.
   ───────────────────────────────────────────────────────────── */

interface PlanKarta {
  id: 'free' | PullikPlan;
  nom: string;
  highlight?: boolean;
  f: { ad: number; lid: string; export: boolean; wl: boolean };
}

const PLANLAR: PlanKarta[] = [
  { id: 'free', nom: 'Free', f: { ad: 1, lid: '500', export: false, wl: false } },
  { id: 'pro', nom: 'Pro', highlight: true, f: { ad: 3, lid: '5 000', export: true, wl: false } },
  { id: 'agency', nom: 'Agency', f: { ad: 10, lid: '∞', export: true, wl: true } },
];

const som = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const sana = (s: string | Date | null | undefined) => (s ? new Date(s).toLocaleDateString('ru-RU') : '—');

/** Backend bilan bir xil qoida: +1 oy, oy oxiri qisqichi (31-yanvar → 28/29-fevral). */
function birOyKeyin(d: Date): Date {
  const oxirgiKun = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), oxirgiKun));
}

const status403 = (e: unknown) => (e as { response?: { status?: number } }).response?.status === 403;

function xatoMatni(e: unknown, tr: Tr): string {
  if (e instanceof PaymeBrauzerXato) return e.message;
  const r = (e as { response?: { data?: { error?: string }; status?: number } }).response;
  if (r?.status === 403)
    return tr("Faqat workspace egasi to'lovni boshqara oladi", 'Only the workspace owner can manage billing', 'Оплатой управляет только владелец');
  if (r?.status === 429) return r.data?.error ?? tr("Juda ko'p urinish", 'Too many attempts', 'Слишком много попыток');
  return r?.data?.error ?? tr("Xato — qayta urinib ko'ring", 'Error — try again', 'Ошибка — попробуйте ещё раз');
}

function Cell({ on }: { on: boolean }) {
  return on ? <Check className="h-4 w-4 flex-none text-ok" /> : <X className="h-4 w-4 flex-none text-ink-3" />;
}

function HolatQatori({ b, tr }: { b: BillingMalumot; tr: Tr }) {
  const o = b.obuna;
  if (!o || o.billing_status === 'none' || o.billing_status === 'expired') {
    return (
      <p className="text-sm text-ink-2">
        {tr('Joriy tarif', 'Current plan', 'Текущий тариф')}: <span className="font-semibold capitalize">{o?.plan ?? 'free'}</span>
        {o?.billing_status === 'expired' && (
          <span className="ml-2 text-warn">{tr('· obuna tugagan', '· subscription ended', '· подписка закончилась')}</span>
        )}
      </p>
    );
  }
  const nom = o.billing_plan ? o.billing_plan.charAt(0).toUpperCase() + o.billing_plan.slice(1) : o.plan;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
      <span>
        <span className="font-semibold">{nom}</span> · {tr('gacha faol', 'active until', 'активна до')} {sana(o.paid_until)}
      </span>
      {o.billing_status === 'past_due' ? (
        <Badge tone="bad">
          {tr("To'lov o'tmadi · qayta urinish", 'Payment failed · retry', 'Платёж не прошёл · повтор')} {sana(o.billing_next_attempt_at)}
        </Badge>
      ) : o.auto_renew ? (
        <Badge tone="ok">{tr('Avto-yangilash yoqilgan', 'Auto-renew on', 'Автопродление вкл.')}</Badge>
      ) : (
        <Badge tone="warn">{tr("Avto-yangilash o'chirilgan", 'Auto-renew off', 'Автопродление выкл.')}</Badge>
      )}
    </div>
  );
}

/* ───────────── Oyna: karta → SMS → (rozilik → to'lash) ─────────────
   plan = null — faqat kartani almashtirish (pul yechilmaydi). */

type Qadam = 'karta' | 'sms' | 'tasdiq';

function TolovOynasi({ plan, b, onClose }: { plan: PullikPlan | null; b: BillingMalumot; onClose: () => void }) {
  const tr = useTr();
  const qc = useQueryClient();
  const narx = plan ? b.narxlar[plan] ?? 0 : 0;
  const saqlangan = plan && b.karta?.verified ? b.karta : null;
  const o = b.obuna;
  const joriyDavrBor =
    plan && o && o.billing_plan && o.billing_plan !== plan && o.paid_until && new Date(o.paid_until) > new Date();

  const [qadam, setQadam] = useState<Qadam>(saqlangan ? 'tasdiq' : 'karta');
  const [prov, setProv] = useState<'payme' | 'click'>(b.provayderlar.payme ? 'payme' : 'click');
  const [raqam, setRaqam] = useState('');
  const [muddat, setMuddat] = useState('');
  const [kod, setKod] = useState('');
  const [telefon, setTelefon] = useState<string | null>(null);
  const [paymeToken, setPaymeToken] = useState<string | null>(null);
  /** Payme'da SMS tasdiqlangan, faqat serverga saqlash qoldi — qayta tasdiqlash shart emas. */
  const [paymeTasdiqlandi, setPaymeTasdiqlandi] = useState(false);
  const [rozi, setRozi] = useState(false);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const raqamToza = raqam.replace(/\D/g, '');
  const muddatToza = muddat.replace(/\D/g, '');
  const kartaTayyor = raqamToza.length === 16 && muddatToza.length === 4;

  async function smsYubor() {
    setXato(null);
    setBand(true);
    try {
      if (prov === 'payme') {
        const r = await paymeKartaBoshla(b.provayderlar.payme!, raqamToza, muddatToza);
        setPaymeToken(r.token);
        setPaymeTasdiqlandi(false);
        setTelefon(r.telefon);
      } else {
        const r = await billingApi.clickKarta(raqamToza, muddatToza);
        setTelefon(r.telefon);
      }
      setKod('');
      setQadam('sms');
    } catch (e) {
      setXato(xatoMatni(e, tr));
    } finally {
      setBand(false);
    }
  }

  async function smsTasdiqla() {
    setXato(null);
    setBand(true);
    try {
      if (prov === 'payme') {
        if (!paymeTasdiqlandi) {
          await paymeKartaTasdiqla(b.provayderlar.payme!, paymeToken!, kod);
          setPaymeTasdiqlandi(true);
        }
        await billingApi.paymeKarta(paymeToken!);
      } else {
        await billingApi.clickTasdiq(kod);
      }
      await qc.invalidateQueries({ queryKey: ['billing'] });
      if (!plan) {
        toast.ok(tr('Karta almashtirildi', 'Card updated', 'Карта обновлена'));
        onClose();
        return;
      }
      setQadam('tasdiq');
    } catch (e) {
      setXato(xatoMatni(e, tr));
    } finally {
      setBand(false);
    }
  }

  async function tola() {
    if (!plan) return;
    setXato(null);
    setBand(true);
    try {
      const r = await billingApi.obuna(plan, rozi, narx);
      if (r.status === 202 || r.jarayonda) {
        toast.info(
          tr("To'lov ishlov berilmoqda — sahifa o'zi yangilanadi", 'Payment is processing — the page will update', 'Платёж обрабатывается — страница обновится'),
          7000
        );
      } else {
        toast.ok(tr("To'lov o'tdi — obuna faol", 'Paid — subscription active', 'Оплачено — подписка активна'), 6000);
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ['billing'] }), qc.invalidateQueries({ queryKey: ['usage'] })]);
      onClose();
    } catch (e) {
      setXato(xatoMatni(e, tr));
      // Narx o'zgargan bo'lsa (409) — yangi narxni ko'rsatish uchun ma'lumot yangilanadi.
      void qc.invalidateQueries({ queryKey: ['billing'] });
    } finally {
      setBand(false);
    }
  }

  const keyingiSana = birOyKeyin(new Date());
  const somTr = tr("so'm", 'UZS', 'сум');

  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-ink">
        {plan
          ? `${plan === 'pro' ? 'Pro' : 'Agency'} · ${som(narx)} ${tr("so'm / oy", 'UZS / month', 'сум / мес')}`
          : tr('Kartani almashtirish', 'Change card', 'Сменить карту')}
      </h2>

      {qadam === 'karta' && (
        // Payme talabi: formada action yo'q, inputlarda name yo'q.
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (kartaTayyor && !band) void smsYubor();
          }}
        >
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={tr("To'lov tizimi", 'Payment provider', 'Платёжная система')}>
            {(['payme', 'click'] as const).map((p) => {
              const bor = p === 'payme' ? Boolean(b.provayderlar.payme) : b.provayderlar.click;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={!bor || band}
                  aria-pressed={prov === p}
                  onClick={() => setProv(p)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    prov === p ? 'border-accent bg-tint text-ink' : 'border-line-2 text-ink-2'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {p === 'payme' ? 'Payme' : 'Click'}
                  {!bor && <span className="block text-xs font-normal">{tr('tez orada', 'coming soon', 'скоро')}</span>}
                </button>
              );
            })}
          </div>
          <Input
            label={tr('Karta raqami', 'Card number', 'Номер карты')}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
            value={raqam}
            onChange={(e) => setRaqam(e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '))}
            icon={<CreditCard className="h-4 w-4" />}
          />
          <Input
            label={tr('Amal qilish muddati (OO/YY)', 'Expiry (MM/YY)', 'Срок (ММ/ГГ)')}
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={muddat}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '').slice(0, 4);
              setMuddat(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
            }}
          />
          <p className="text-xs text-ink-3">
            {tr(
              "Uzcard / Humo. Karta raqami bizning serverda saqlanmaydi — faqat to'lov tizimi bergan token saqlanadi.",
              'Uzcard / Humo. Your card number is never stored on our servers — only the payment provider token.',
              'Uzcard / Humo. Номер карты не хранится у нас — только токен платёжной системы.'
            )}
          </p>
          <Button type="submit" fullWidth loading={band} disabled={!kartaTayyor}>
            {tr('SMS kod olish', 'Get SMS code', 'Получить SMS-код')}
          </Button>
        </form>
      )}

      {qadam === 'sms' && (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if ((kod.length >= 4 || paymeTasdiqlandi) && !band) void smsTasdiqla();
          }}
        >
          <p className="text-sm text-ink-2">
            {tr('SMS kod yuborildi', 'SMS code sent to', 'SMS-код отправлен на')} {telefon ?? ''}
          </p>
          {!paymeTasdiqlandi && (
            <Input
              label={tr('SMS kod', 'SMS code', 'SMS-код')}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={kod}
              onChange={(e) => setKod(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={band} onClick={() => setQadam('karta')}>
              {tr('Orqaga', 'Back', 'Назад')}
            </Button>
            <Button type="submit" fullWidth loading={band} disabled={kod.length < 4 && !paymeTasdiqlandi}>
              {paymeTasdiqlandi ? tr('Qayta saqlash', 'Save again', 'Сохранить ещё раз') : tr('Tasdiqlash', 'Confirm', 'Подтвердить')}
            </Button>
          </div>
        </form>
      )}

      {qadam === 'tasdiq' && plan && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl bg-surface-2 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-2">{tr('Karta', 'Card', 'Карта')}</span>
              <span className="font-semibold text-ink">{b.karta?.masked ?? '—'}</span>
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-ink-2">{tr('Hozir yechiladi', 'Charged now', 'Спишется сейчас')}</span>
              <span className="font-semibold tabular-nums text-ink">{som(narx)} {somTr}</span>
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-ink-2">{tr('Keyingi yechish', 'Next charge', 'Следующее списание')}</span>
              <span className="tabular-nums text-ink">{sana(keyingiSana)}</span>
            </div>
          </div>
          {joriyDavrBor && (
            <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-ink-2">
              {tr(
                `Yangi tarif bugundan boshlanadi. Joriy tarifning ${sana(o!.paid_until)} gacha qolgan kunlari hisobga olinmaydi.`,
                `The new plan starts today. Remaining days of your current plan (until ${sana(o!.paid_until)}) are not credited.`,
                `Новый тариф начнётся сегодня. Остаток текущего тарифа (до ${sana(o!.paid_until)}) не засчитывается.`
              )}
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-2">
            <input type="checkbox" className="mt-1" checked={rozi} onChange={(e) => setRozi(e.target.checked)} />
            <span>
              {tr(
                `Har oy kartamdan ${som(narx)} so'm avtomatik yechilishiga roziman. Yechishdan 7 kun oldin email keladi, avto-yangilashni istalgan payt o'chirishim mumkin.`,
                `I agree to be charged ${som(narx)} UZS automatically every month. I'll get an email 7 days before each charge and can turn auto-renew off anytime.`,
                `Согласен на ежемесячное автосписание ${som(narx)} сум. За 7 дней до списания придёт email, автопродление можно отключить в любой момент.`
              )}{' '}
              <Link to="/terms" className="text-accent underline" target="_blank">
                {tr('Shartlar', 'Terms', 'Условия')}
              </Link>
            </span>
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setQadam('karta')} disabled={band}>
              {tr('Boshqa karta', 'Other card', 'Другая карта')}
            </Button>
            <Button fullWidth loading={band} disabled={!rozi} onClick={() => void tola()}>
              {tr("To'lash", 'Pay', 'Оплатить')} · {som(narx)} {somTr}
            </Button>
          </div>
        </div>
      )}

      {xato && (
        <p className="mt-4 text-sm text-bad" role="alert">
          {xato}
        </p>
      )}
    </Card>
  );
}

/* ───────────── Sahifa ───────────── */

type Oyna = { tur: 'obuna'; plan: PullikPlan } | { tur: 'karta' } | null;

export default function UpgradePage() {
  const tr = useTr();
  const qc = useQueryClient();
  const billing = useQuery({
    queryKey: ['billing'],
    queryFn: billingApi.holat,
    retry: (n, e) => !status403(e) && n < 1,
    // To'lov "tekshirilmoqda" bo'lsa — natija o'zi ko'rinsin, sahifani yangilash shart emas.
    refetchInterval: (q) =>
      q.state.data?.tolovlar.some((t) => t.status === 'pending' || t.status === 'unknown') ? 10_000 : false,
  });
  const [oyna, setOyna] = useState<Oyna>(null);
  const [band, setBand] = useState(false);

  const b = billing.data;
  const o = b?.obuna;
  const egaEmas = billing.isError && status403(billing.error);
  const obunaFaol = o && (o.billing_status === 'active' || o.billing_status === 'past_due' || o.billing_status === 'canceled');
  // Qo'lda berilgan tarif (billing_status = none, plan = pro) ham "joriy" ko'rinsin.
  const joriyPlan = obunaFaol ? o!.billing_plan : o?.plan ?? null;
  const providerBor = Boolean(b?.provayderlar.payme || b?.provayderlar.click);

  async function amal(fn: () => Promise<unknown>, okMatn: string) {
    setBand(true);
    try {
      await fn();
      toast.ok(okMatn);
      await Promise.all([qc.invalidateQueries({ queryKey: ['billing'] }), qc.invalidateQueries({ queryKey: ['usage'] })]);
    } catch (e) {
      toast.bad(xatoMatni(e, tr));
    } finally {
      setBand(false);
    }
  }

  function avtoAlmashtir() {
    if (!o) return;
    if (!o.auto_renew) {
      // Qayta yoqish — bu yangi rozilik: summa va sana aniq ko'rsatiladi.
      const summa = o.billing_amount_uzs ?? (o.billing_plan ? b?.narxlar[o.billing_plan] : null) ?? 0;
      const ok = window.confirm(
        tr(
          `${sana(o.paid_until)} dan boshlab har oy kartangizdan ${som(summa)} so'm avtomatik yechiladi. Rozimisiz?`,
          `From ${sana(o.paid_until)}, ${som(summa)} UZS will be charged to your card every month. Agree?`,
          `С ${sana(o.paid_until)} с карты будет ежемесячно списываться ${som(summa)} сум. Согласны?`
        )
      );
      if (!ok) return;
    }
    void amal(
      () => billingApi.avto(!o.auto_renew),
      o.auto_renew
        ? tr("Avto-yangilash o'chirildi", 'Auto-renew turned off', 'Автопродление отключено')
        : tr('Avto-yangilash yoqildi', 'Auto-renew turned on', 'Автопродление включено')
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">{tr("Tariflar va to'lov", 'Plans & billing', 'Тарифы и оплата')}</h1>
        <div className="mt-2">
          {billing.isLoading ? (
            <Skeleton className="h-4 w-56" />
          ) : egaEmas ? (
            <p className="text-sm text-ink-2">
              {tr(
                "To'lovni faqat workspace egasi boshqaradi. Tarifni o'zgartirish uchun egaga murojaat qiling.",
                'Only the workspace owner manages billing. Ask the owner to change the plan.',
                'Оплатой управляет только владелец рабочего пространства.'
              )}
            </p>
          ) : billing.isError ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-bad">{xatoMatni(billing.error, tr)}</p>
              <Button variant="secondary" size="sm" onClick={() => billing.refetch()}>
                {tr('Qayta urinish', 'Retry', 'Повторить')}
              </Button>
            </div>
          ) : (
            b && <HolatQatori b={b} tr={tr} />
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANLAR.map((p) => {
          const narx = p.id === 'free' ? 0 : b?.narxlar[p.id] ?? null;
          const joriy = billing.isLoading || egaEmas ? false : p.id === 'free' ? !joriyPlan || joriyPlan === 'free' : joriyPlan === p.id;
          const tugmaYoq = joriy || narx === null || !providerBor || billing.isLoading || !b;
          return (
            <Card key={p.id} highlight={p.highlight} padding="lg">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-ink">{p.nom}</h2>
                {joriy && <Badge tone="neutral">{tr('Joriy', 'Current', 'Текущий')}</Badge>}
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-ink">
                {billing.isLoading ? (
                  <Skeleton className="h-7 w-28" />
                ) : narx === null ? (
                  <span className="text-base text-ink-3">{egaEmas ? '—' : tr('Tez orada', 'Coming soon', 'Скоро')}</span>
                ) : (
                  <>
                    {som(narx)} <span className="text-sm font-medium text-ink-2">{tr("so'm/oy", 'UZS/mo', 'сум/мес')}</span>
                  </>
                )}
              </div>
              <ul className="mt-5 space-y-2 text-sm text-ink-2">
                <li className="flex items-center gap-2"><Cell on /> {p.f.ad} {tr('reklama akkaunti', 'ad accounts', 'рекл. аккаунтов')}</li>
                <li className="flex items-center gap-2"><Cell on /> {p.f.lid} {tr('lid/oy', 'leads/mo', 'лидов/мес')}</li>
                <li className={`flex items-center gap-2 ${p.f.export ? '' : 'text-ink-3'}`}><Cell on={p.f.export} /> CSV export</li>
                <li className={`flex items-center gap-2 ${p.f.wl ? '' : 'text-ink-3'}`}><Cell on={p.f.wl} /> White-label</li>
              </ul>
              {p.id !== 'free' && !egaEmas && (
                <Button
                  className="mt-6"
                  variant={p.highlight ? 'primary' : 'secondary'}
                  fullWidth
                  disabled={tugmaYoq}
                  onClick={() => setOyna({ tur: 'obuna', plan: p.id as PullikPlan })}
                >
                  {joriy
                    ? tr('Joriy tarif', 'Current plan', 'Текущий тариф')
                    : !providerBor && !billing.isLoading
                      ? tr("To'lov tez orada", 'Payments coming soon', 'Оплата скоро')
                      : tr("Obuna bo'lish", 'Subscribe', 'Подписаться')}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {b && (b.karta || b.tolovlar.length > 0) && (
        <Card padding="lg">
          <h2 className="text-base font-semibold text-ink">{tr("To'lov usuli", 'Payment method', 'Способ оплаты')}</h2>
          {o?.billing_status === 'past_due' && (
            <p className="mt-2 text-sm text-bad">
              {tr(
                "Oxirgi to'lov o'tmadi. Kartada mablag' borligini tekshiring yoki kartani almashtiring — yangi karta ulanishi bilan qayta urinamiz.",
                "The last payment failed. Check your balance or change the card — we'll retry as soon as a new card is added.",
                'Последний платёж не прошёл. Проверьте баланс или смените карту — повторим сразу после привязки.'
              )}
            </p>
          )}
          {b.karta ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <CreditCard className="h-5 w-5 text-ink-2" />
              <span className="font-semibold text-ink">{b.karta.masked}</span>
              <Badge tone="neutral">{b.karta.provider === 'payme' ? 'Payme' : 'Click'}</Badge>
              <div className="ml-auto flex flex-wrap gap-2">
                {providerBor && (
                  <Button size="sm" variant="secondary" disabled={band} onClick={() => setOyna({ tur: 'karta' })}>
                    {tr('Kartani almashtirish', 'Change card', 'Сменить карту')}
                  </Button>
                )}
                {obunaFaol && o && (
                  <Button size="sm" variant="secondary" loading={band} onClick={avtoAlmashtir}>
                    {o.auto_renew
                      ? tr("Avto-yangilashni o'chirish", 'Turn off auto-renew', 'Отключить автопродление')
                      : tr('Avto-yangilashni yoqish', 'Turn on auto-renew', 'Включить автопродление')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  loading={band}
                  onClick={() => {
                    if (
                      window.confirm(
                        tr(
                          "Kartani o'chirasizmi? Avto-yangilash ham o'chadi, to'langan muddat tugagach Free tarifiga o'tasiz.",
                          'Remove the card? Auto-renew will be turned off and you will move to Free when the paid period ends.',
                          'Удалить карту? Автопродление отключится, после оплаченного периода — тариф Free.'
                        )
                      )
                    )
                      void amal(() => billingApi.kartaOchir(), tr("Karta o'chirildi", 'Card removed', 'Карта удалена'));
                  }}
                >
                  {tr("Kartani o'chirish", 'Remove card', 'Удалить карту')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-ink-3">{tr('Karta ulanmagan', 'No card on file', 'Карта не привязана')}</p>
              {providerBor && (
                <Button size="sm" variant="secondary" onClick={() => setOyna({ tur: 'karta' })}>
                  {tr('Karta ulash', 'Add card', 'Привязать карту')}
                </Button>
              )}
            </div>
          )}

          <h3 className="mt-6 text-sm font-semibold text-ink">{tr("To'lovlar tarixi", 'Payment history', 'История платежей')}</h3>
          {b.tolovlar.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">{tr("Hali to'lov yo'q", 'No payments yet', 'Платежей пока нет')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line-2 text-sm">
              {b.tolovlar.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="tabular-nums text-ink-2">{sana(t.created_at)}</span>
                  <span className="capitalize text-ink">{t.plan}</span>
                  <span className="tabular-nums text-ink">
                    {som(t.amount_uzs)} {tr("so'm", 'UZS', 'сум')}
                  </span>
                  <span className="ml-auto">
                    <Badge tone={t.status === 'paid' ? 'ok' : t.status === 'failed' ? 'bad' : 'warn'}>
                      {t.status === 'paid'
                        ? tr("To'langan", 'Paid', 'Оплачен')
                        : t.status === 'failed'
                          ? tr("O'tmadi", 'Failed', 'Не прошёл')
                          : tr('Tekshirilmoqda', 'Processing', 'Проверяется')}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal open={oyna !== null} onClose={() => setOyna(null)} label={tr("To'lov", 'Payment', 'Оплата')}>
        {oyna && b && (
          <TolovOynasi
            key={oyna.tur === 'obuna' ? oyna.plan : 'karta'}
            plan={oyna.tur === 'obuna' ? oyna.plan : null}
            b={b}
            onClose={() => setOyna(null)}
          />
        )}
      </Modal>
    </div>
  );
}
