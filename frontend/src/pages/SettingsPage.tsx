import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import {
  Megaphone,
  Database,
  Code2,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Send,
  DownloadCloud,
} from 'lucide-react';
import { facebookApi, amocrmApi, metaCapiApi, syncApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type {
  FbStatus,
  AdAccount,
  AmocrmStatus,
  MetaCapiStatus,
  Pipeline,
} from '../types';
import Checkbox from '../components/dashboard/Checkbox';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  SkeletonText,
  cn,
} from '../components/ui';

function errMsg(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
  );
}

/** Ulanish holati — CardHeader'ning action joyida turadi. */
function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge tone="ok" dot>
      Ulangan
    </Badge>
  ) : (
    <Badge tone="neutral">Ulanmagan</Badge>
  );
}

/** Xato + qayta urinish. Har bo'lim shu bitta naqshdan foydalanadi. */
function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <p className="text-sm text-bad">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}

const LABEL = 'mb-1.5 block text-xs font-semibold text-ink-2';
const SELECT = cn(
  'h-10 w-full rounded-sm border-[1.5px] border-line-2 bg-surface px-3 text-sm text-ink',
  'transition-[box-shadow,border-color] duration-200 disabled:cursor-not-allowed disabled:opacity-50'
);

/**
 * Holat qatori: yorliq chapga, qiymat o'ngga — ikkalasi ham karta chekkasiga
 * tekislanadi. Ilgari `grid-cols-2` edi va qiymat kartaning o'rtasida
 * osilib turardi.
 */
function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 last:border-b-0">
      <dt className="flex-none text-sm text-ink-2">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}

/** Kartaning pastki qatori — yuqori chiziq bilan ajratilgan. */
function CardFooterRow({ children }: { children: ReactNode }) {
  return <div className="mt-5 border-t border-line pt-3">{children}</div>;
}

// ---------- Facebook ----------
function FacebookSection() {
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
const CONNECT_STEPS = [
  "amoCRM'ga kiring → amoМаркет bo'limi",
  "O'ng yuqoridagi ⋯ → «Создать интеграцию» → «Внешняя интеграция» → + Создать",
  "Ссылка для перенаправления maydoniga quyidagi manzilni joylang",
  "Nom bering, «Предоставить доступ: Все» ni belgilang va Сохранить bosing. Pochtaga kelgan 6 xonali kodni kiritasiz",
  "Integratsiyani ochib «Ключи и доступы» tabidan uchta qiymatni shu yerga ko'chiring",
] as const;

/**
 * Xususiy integratsiyani qo'lda ulash.
 *
 * amoCRM xususiy integratsiyani faqat yaratilgan akkauntda ishlatishga
 * ruxsat beradi (amoMarket'ning install oqimi «Нет доступных аккаунтов»
 * qaytaradi). Shuning uchun har mijoz o'z CRM'ida o'z integratsiyasini
 * yaratadi — ya'ni kalitlar ham har mijozda boshqa bo'ladi va ular
 * shu formadan keladi, umumiy .env dan emas.
 */
function AmocrmManualConnect({ onConnected }: { onConnected: () => void }) {
  const [domain, setDomain] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const redirectUri = `${
    import.meta.env.VITE_API_URL || 'https://sales-hacking-api.vercel.app'
  }/api/auth/amocrm/callback`;

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloklangan bo'lishi mumkin — matn baribir ko'rinib turadi */
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await amocrmApi.manualConnect({
        code: code.trim(),
        domain: domain.trim(),
        clientId: clientId.trim() || undefined,
        clientSecret: clientSecret.trim() || undefined,
      });
      setCode('');
      setClientSecret('');
      onConnected();
    } catch (err) {
      setError(errMsg(err, 'Ulanmadi'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-5 border-t border-line pt-5">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-ink-3" />
        <h3 className="text-sm font-semibold text-ink">amoCRM'ni ulash</h3>
      </div>

      <ol className="mb-4 flex flex-col gap-1.5">
        {CONNECT_STEPS.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-ink-2">
            <span className="flex-none font-mono text-ink-3">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="mb-4 rounded-sm border-[1.5px] border-line bg-surface-2 p-3">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-ink-2">
            Ссылка для перенаправления
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copyRedirect}
            icon={
              copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />
            }
          >
            {copied ? 'Nusxalandi' : 'Nusxalash'}
          </Button>
        </div>
        <code className="block overflow-x-auto whitespace-nowrap font-mono text-xs text-ink">
          {redirectUri}
        </code>
      </div>

      <div className="grid gap-3">
        <Input
          label="amoCRM domeni"
          placeholder="xxx.amocrm.ru"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <Input
          label="ID интеграции"
          placeholder="dcd456d0-5d66-429f-8df3-5b6a6aa8170d"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          hint="Maxfiy emas — OAuth'da ochiq yuboriladi."
        />
        <Input
          label="Секретный ключ"
          placeholder="••••••••••••"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          hint="Shifrlangan holda saqlanadi va hech qachon qaytarilmaydi."
        />
        <Input
          label="Код авторизации"
          placeholder="def502..."
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          hint="20 daqiqa amal qiladi, bir marta ishlatiladi. Saqlanmaydi — faqat tokenga almashtiriladi."
        />
      </div>

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      <Button
        type="submit"
        loading={busy}
        disabled={!domain.trim() || !code.trim()}
        className="mt-4 sm:w-40"
      >
        Ulash
      </Button>
    </form>
  );
}

// ---------- AmoCRM ----------
function AmocrmSection() {
  const [status, setStatus] = useState<AmocrmStatus | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  // Eski maydonlar: hisobotning standart voronkasi. Endi UI'da
  // so'ralmaydi — birinchi "Sotuv" juftligidan olinadi.
  const [, setPipelineId] = useState('');
  const [, setWonStageId] = useState('');
  const [wonPairs, setWonPairs] = useState<string[]>([]);
  const [qualPairs, setQualPairs] = useState<string[]>([]);
  const [leadPairs, setLeadPairs] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hookCopied, setHookCopied] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await amocrmApi.status();
      setStatus(s);
      setPipelineId(s.pipelineId ?? '');
      setWonStageId(s.wonStageId ?? '');
      setWonPairs(s.wonPairs ?? []);
      setQualPairs(s.qualifiedPairs ?? []);
      setLeadPairs(s.leadPairs ?? []);
      if (s.connected) {
        try {
          const { pipelines } = await amocrmApi.pipelines();
          setPipelines(pipelines);
        } catch {
          /* pipelines need a live amoCRM token */
        }
      }
    } catch (err) {
      setError(errMsg(err, 'Failed to load amoCRM status'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    try {
      const { url } = await amocrmApi.connect();
      window.open(url, '_blank', 'width=600,height=700');
    } catch (err) {
      setError(errMsg(err, 'Failed to start amoCRM connect'));
    }
  };

  const save = async () => {
    // Sotuv etapi belgilanmagan bo'lsa saqlash ma'nosiz: daromad 0 bo'lib
    // qoladi va buni hech narsa bildirmaydi.
    if (wonPairs.length === 0) {
      setError("Kamida bitta 'Sotuv' etapini belgilang.");
      return;
    }
    // Eski maydonlar (asosiy voronka + won stage) endi qo'lda
    // tanlanmaydi — birinchi sotuv juftligidan olinadi. Ikki joyda
    // bir xil narsani so'rash foydalanuvchini adashtirardi.
    const [pId, sId] = wonPairs[0].split(':');
    setBusy(true);
    setError('');
    try {
      await amocrmApi.savePipeline({
        pipelineId: pId,
        wonStageId: sId,
        wonPairs,
        qualifiedPairs: qualPairs,
        leadPairs,
      });
      setPipelineId(pId);
      setWonStageId(sId);
      await load();
    } catch (err) {
      setError(errMsg(err, 'Saqlanmadi'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * amoCRM tarixini import qilish.
   *
   * Server bitta chaqiruvda bitta sahifani (250 lid) ishlaydi —
   * serverless funksiya uzoq yashamaydi. Sahifalarni shu yerda
   * aylantiramiz va har qadamda holat ko'rsatiladi.
   *
   * To'xtatish tugmasi bor: amoCRM limiti yaqin bo'lsa yoki xato
   * ko'paysa foydalanuvchi jarayonni uzishi kerak.
   */
  const [impBusy, setImpBusy] = useState(false);
  const [impLog, setImpLog] = useState<string | null>(null);
  const [impErr, setImpErr] = useState<string | null>(null);
  // Ref, state emas: sikl ichidagi tekshiruv eski state nusxasini
  // ko'rib qolmasligi kerak.
  const impStopRef = useRef(false);

  const runImport = async (days?: number) => {
    setImpBusy(true);
    impStopRef.current = false;
    setImpErr(null);
    const jami = { leads: 0, won: 0, qualified: 0, errors: 0, pages: 0 };
    let page: number | null = 1;

    try {
      while (page !== null) {
        const r = await syncApi.amocrmImport({ days, page });
        jami.leads += r.leads;
        jami.won += r.won;
        jami.qualified += r.qualified;
        jami.errors += r.errors;
        jami.pages += 1;
        setImpLog(
          `${jami.leads} lid · ${jami.qualified} sifatli · ${jami.won} sotuv` +
            (jami.errors ? ` · ${jami.errors} xato` : '')
        );
        page = r.nextPage;
        // Foydalanuvchi to'xtatgan bo'lsa keyingi sahifaga o'tmaymiz.
        if (impStopRef.current) break;
      }
      setImpLog(
        `Tugadi: ${jami.leads} lid · ${jami.qualified} sifatli · ${jami.won} sotuv` +
          (jami.errors ? ` · ${jami.errors} xato` : '')
      );
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Import bajarilmadi';
      setImpErr(msg);
    } finally {
      setImpBusy(false);
    }
  };

  const copyWebhook = async () => {
    if (!status?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(status.webhookUrl);
      setHookCopied(true);
      setTimeout(() => setHookCopied(false), 2000);
    } catch {
      /* clipboard bloklangan — manzil baribir ko'rinib turadi */
    }
  };

  /** Belgilangan juftliklarni ro'yxatga qo'shadi yoki olib tashlaydi. */
  const togglePair = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    pair: string,
    on: boolean
  ) => setter((prev) => (on ? [...new Set([...prev, pair])] : prev.filter((x) => x !== pair)));

  /**
   * Har voronka ostida etaplar ro'yxati, ikki ustunli: "sotuv" va "sifatli".
   *
   * Nega hamma voronka ko'rsatiladi: amoCRM'da sotuv boshqa voronkada
   * yopilishi mumkin. Furninglass'da 60 kunda 232.5 mln so'm `guli`
   * voronkasida, 5.8 mln esa `Kvalifikatsiya` da yopilgan — faqat
   * bittasini kuzatsak daromadning 2.4% i ko'rinadi.
   */
  /**
   * Etaplar jadvali — uchta rol, uchta ustun.
   *
   * Nega uchtasi birga: bir etap bir vaqtda "lid" ham, "sifatli" ham
   * bo'lolmaydi, lekin mijozning voronkasi qanday qurilganini faqat
   * uning o'zi biladi. Biz taxmin qilmaymiz (§3.5), tanlashni beramiz.
   *
   * Juftlik shaklida saqlanadi ('voronka:etap'), chunki amoCRM'da
   * etap ID lari voronkalar bo'ylab takrorlanadi — 142 va 143 har
   * voronkada bor.
   */
  const stagePicker = (
    <div className="flex flex-col gap-4">
      {pipelines.length === 0 ? (
        <p className="text-xs text-ink-3">
          Voronkalar yuklanmadi — amoCRM tokeni tekshirilsin yoki bir oz kutib
          sahifani yangilang (amoCRM so'rov chastotasini cheklaydi).
        </p>
      ) : (
        pipelines.map((p) => (
          <div key={p.id} className="rounded-sm border-[1.5px] border-line bg-surface-2 p-3">
            <p className="mb-2 text-xs font-semibold text-ink">{p.name}</p>

            <div className="mb-1.5 grid grid-cols-[1fr_52px_56px_52px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              <span>Etap</span>
              <span className="text-center">Lid</span>
              <span className="text-center">Sifatli</span>
              <span className="text-center">Sotuv</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {p.statuses.map((st) => {
                const pair = `${p.id}:${st.id}`;
                return (
                  <div
                    key={st.id}
                    className="grid grid-cols-[1fr_52px_56px_52px] items-center gap-2"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">{st.name}</span>
                    <span className="flex justify-center">
                      <Checkbox
                        checked={leadPairs.includes(pair)}
                        onChange={(on) => togglePair(setLeadPairs, pair, on)}
                        label={`${p.name} / ${st.name} — lid`}
                      />
                    </span>
                    <span className="flex justify-center">
                      <Checkbox
                        checked={qualPairs.includes(pair)}
                        onChange={(on) => togglePair(setQualPairs, pair, on)}
                        label={`${p.name} / ${st.name} — sifatli`}
                      />
                    </span>
                    <span className="flex justify-center">
                      <Checkbox
                        checked={wonPairs.includes(pair)}
                        onChange={(on) => togglePair(setWonPairs, pair, on)}
                        label={`${p.name} / ${st.name} — sotuv`}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {wonPairs.length === 0 && pipelines.length > 0 && (
        <p className="text-sm text-bad">
          Hech bir etap "Sotuv" deb belgilanmagan — daromad 0 bo'lib qoladi.
        </p>
      )}
    </div>
  );

  return (
    <Card padding="lg">
      <CardHeader
        title="amoCRM"
        description={
          status?.connected && status.domain
            ? status.domain
            : 'Leads, pipeline stages and won deals.'
        }
        icon={<Database className="h-5 w-5" />}
        action={<ConnectionBadge connected={Boolean(status?.connected)} />}
      />

      {error && <ErrorRow message={error} onRetry={() => void load()} />}

      {loading ? (
        <SkeletonText lines={3} />
      ) : status?.connected ? (
        <div>
          {/* Qadamlar. Etaplar belgilanmaguncha 2-qadam ochiq turadi:
              ulangan, lekin sozlanmagan integratsiya jim ishlamaydi —
              lidlar tushadi, daromad 0 bo'lib qolaveradi. */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-ok/10 px-2 py-1 font-semibold text-ok">
              <Check className="h-3.5 w-3.5" /> 1. Ulandi
            </span>
            <span className="text-ink-3">→</span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-semibold',
                wonPairs.length > 0 ? 'bg-ok/10 text-ok' : 'bg-tint text-accent'
              )}
            >
              {wonPairs.length > 0 && <Check className="h-3.5 w-3.5" />}
              2. Etaplar
            </span>
            <span className="text-ink-3">→</span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-semibold',
                wonPairs.length > 0 ? 'bg-tint text-accent' : 'text-ink-3'
              )}
            >
              3. Ma'lumot
            </span>
          </div>

          <div className="mb-3">
            <span className={LABEL}>2-qadam · Har etap nimani anglatadi</span>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">
              <b>Lid</b> — voronkaning birinchi bosqichi, hali ishlov berilmagan.{' '}
              <b>Sifatli</b> — lid bo'sh raqam emasligi ma'lum bo'lgan etap.{' '}
              <b>Sotuv</b> — daromad hisoblanadigan etap. Bittadan ortiq voronkadan
              belgilash mumkin: pul bir voronkada, kvalifikatsiya boshqasida yopilishi
              mumkin.
            </p>
          </div>

          {stagePicker}

          {/* Webhook manzili — buni mijoz amoCRM'ga joylaydi, aks holda
              lidlar real vaqtda kelmaydi. Sir har mijozga alohida. */}
          {status.webhookUrl && (
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className={LABEL}>Webhook manzili</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyWebhook()}
                  icon={
                    hookCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )
                  }
                >
                  {hookCopied ? 'Nusxalandi' : 'Nusxalash'}
                </Button>
              </div>
              <p className="mb-2 text-xs leading-relaxed text-ink-3">
                amoCRM → amoМаркет → <b>+ WEB HOOKS</b> → shu manzilni qo'shing.
                Hodisalar: <i>сделка создана</i>, <i>сделка изменена</i>,{' '}
                <i>контакт создан</i>. Bu manzil faqat sizga tegishli — ulashmang.
              </p>
              <code className="block overflow-x-auto whitespace-nowrap rounded-sm border-[1.5px] border-line bg-surface-2 p-3 font-mono text-xs text-ink">
                {status.webhookUrl}
              </code>
            </div>
          )}

          {/* 3-qadam: ma'lumotni olib kelish. Etaplar belgilanmaguncha
              ko'rsatilmaydi — aks holda import ishlaydi, lekin hamma lid
              "in_progress" bo'lib tushadi va sabab ko'rinmaydi. */}
          {wonPairs.length > 0 && (
          <div className="mt-5 rounded-md border-[1.5px] border-line bg-surface-2 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className={LABEL}>3-qadam · Tarixni import qilish</span>
              {impBusy && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    impStopRef.current = true;
                  }}
                >
                  To'xtatish
                </Button>
              )}
            </div>
            <p className="mb-2.5 text-xs leading-relaxed text-ink-3">
              Webhook faqat ulangandan keyingi lidlarni ko'radi. Bu tugma amoCRM'dagi
              mavjud lidlarni, etaplarini va summasini bir marta tortib oladi.
              Qayta bosish xavfsiz — mavjud yozuvlar yangilanadi, dublikat chiqmaydi.
              amoCRM'ga hech narsa yozilmaydi.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={impBusy}
                onClick={() => void runImport(90)}
                icon={<DownloadCloud className="h-3.5 w-3.5" />}
              >
                Oxirgi 90 kun
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={impBusy}
                onClick={() => void runImport(undefined)}
                icon={<DownloadCloud className="h-3.5 w-3.5" />}
              >
                Butun tarix
              </Button>
            </div>
            {impLog && (
              <p className="mt-2 font-mono text-xs tabular-nums text-ink-2">{impLog}</p>
            )}
            {impErr && (
              <p role="alert" className="mt-2 text-xs text-bad">
                {impErr}
              </p>
            )}
          </div>
          )}

          <CardFooterRow>
            <Button
              onClick={save}
              loading={busy}
              disabled={wonPairs.length === 0}
              className="sm:w-40"
            >
              Etaplarni saqlash
            </Button>
          </CardFooterRow>
        </div>
      ) : (
        <div>
          <EmptyState
            icon={<Database />}
            title="amoCRM ulanmagan"
            hint="lid yo'q · daromad atribusiya qilinmaydi"
          />

          <AmocrmManualConnect onConnected={() => void load()} />

          <CardFooterRow>
            <Button
              variant="ghost"
              size="sm"
              onClick={connect}
              icon={<ExternalLink className="h-4 w-4" />}
            >
              amoMarket orqali ulash (ommaviy integratsiya uchun)
            </Button>
          </CardFooterRow>
        </div>
      )}
    </Card>
  );
}

// ---------- Meta Conversions API ----------
/**
 * CAPI — amoCRM'dagi natijani Meta'ga qaytaradigan ko'prik.
 *
 * ⚠ Token bu formada YO'Q va bo'lmaydi (§4.1). Foydalanuvchi faqat
 * Dataset ID ni kiritadi; token .env / Vercel secret da yashaydi va
 * server uni faqat "bor/yo'q" deb xabar qiladi.
 */
function MetaCapiSection() {
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

  const persist = async (patch: Parameters<typeof metaCapiApi.save>[0]) => {
    setBusy(true);
    setError('');
    setWarning('');
    try {
      const res = await metaCapiApi.save(patch);
      if (res.warning) setWarning(res.warning);
      await load();
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
              Ro'yxatdagi <b>standart</b> nomlar Ads Manager'da darhol ishlaydi va
              optimizatsiya maqsadi qilib tanlanadi. O'z nomingizni yozsangiz — u
              custom bo'ladi va Events Manager'da <b>Custom Conversion</b> yasash kerak.
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
                onClick={() => void persist({ enabled: !status?.enabled })}
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
function PixelSection() {
  const workspace = useAuthStore((s) => s.workspace);
  const [copied, setCopied] = useState(false);
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const snippet = `<script async src="${apiUrl}/api/pixel/script.js?workspaceId=${
    workspace?.id ?? 'WORKSPACE_ID'
  }"></script>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <Card padding="lg">
      <CardHeader
        title="Pixel Code"
        description="fbclid → conversion zanjirini saytda ushlab turadi."
        icon={<Code2 className="h-5 w-5" />}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={copy}
            icon={
              copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />
            }
          >
            {copied ? 'Nusxalandi' : 'Nusxalash'}
          </Button>
        }
      />

      <p className="mb-3 text-sm text-ink-2">
        Paste this snippet just before the closing <code>&lt;/head&gt;</code> tag on every page
        of your website. It captures <code>fbclid</code> and sends tracking events automatically.
      </p>

      <pre className="overflow-x-auto rounded-sm border-[1.5px] border-line bg-surface-2 p-3 font-mono text-xs text-ink">
        {snippet}
      </pre>

      <p className="mt-3 text-sm text-ink-2">
        To track conversions, call:{' '}
        <code className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">
          window.AttributionPixel.track('purchase', {'{ value: 99, currency: "USD" }'})
        </code>
      </p>
    </Card>
  );
}

export default function SettingsPage() {
  const params = new URLSearchParams(window.location.search);
  const justConnected = params.get('fb') === 'connected' || params.get('amocrm') === 'connected';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-2">
          Connect your data sources and tracking pixel.
        </p>
      </div>

      {justConnected && (
        <div className="rounded-md border-[1.5px] border-ok/30 bg-ok/12 px-4 py-3 text-sm text-ok">
          Connection successful.
        </div>
      )}

      <FacebookSection />
      <AmocrmSection />
      <MetaCapiSection />
      <PixelSection />
    </div>
  );
}
