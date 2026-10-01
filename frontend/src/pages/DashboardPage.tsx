import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  AppWindow,
  Folder,
  LayoutGrid,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import api, { dashboardApi, facebookApi, amocrmApi, workspaceApi } from '../services/api';
import KpiCard from '../components/KpiCard';
import PeriodLabel from '../components/PeriodLabel';
import SourceDonut from '../components/dashboard/SourceDonut';
import EntityTable, { View, QuickFilter } from '../components/dashboard/EntityTable';
import TopPerformers from '../components/dashboard/TopPerformers';
import AdAccountSelector from '../components/dashboard/AdAccountSelector';
import DateRangePicker from '../components/dashboard/DateRangePicker';
import ColumnsButton from '../components/dashboard/ColumnsButton';
import BreakdownButton from '../components/dashboard/BreakdownButton';
import { loadVisibleColumns, saveVisibleColumns } from '../components/dashboard/columns';
import { PresetId, rangeForPreset, kunlikOraliq } from '../utils/dateRanges';
import {
  formatMoney,
  formatMoneyOrDash,
  formatPercentOrDash,
  formatRoas,
  formatDaysOrDash,
  n,
} from '../utils/format';
import { Button, Input, cn, toast } from '../components/ui';
import { useTr } from '../lib/til';

type Model = 'first_click' | 'last_click';

interface KpiSpec {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  /** Sahifadagi yagona asosiy javob — ROAS */
  hero?: boolean;
}

const PILLS: Array<{ id: QuickFilter; label: string; ru: string }> = [
  { id: 'all', label: 'All ads', ru: 'Все объявления' },
  { id: 'active', label: 'Active ads', ru: 'Активные' },
  { id: 'delivery', label: 'Had delivery', ru: 'С показами' },
];

const VIEW_TABS: Array<{ id: View; label: string; ru: string; Icon: LucideIcon }> = [
  { id: 'campaigns', label: 'Campaigns', ru: 'Кампании', Icon: Folder },
  { id: 'adsets', label: 'Ad sets', ru: 'Группы', Icon: LayoutGrid },
  { id: 'ads', label: 'Ads', ru: 'Объявления', Icon: AppWindow },
];

/** KPI nomlari: o'zbekcha va inglizchada Ads Manager atamasi, ruschada tarjima. */
const KPI_RU: Record<string, string> = {
  'Amount Spent': 'Потрачено',
  Revenue: 'Выручка',
  'Conversion Rate': 'Конверсия',
  'Deal Time': 'Время сделки',
  'Revenue Growth': 'Рост выручки',
};

/* ═══════════════ Segmented control (Ads Manager naqshi) ═══════════════

   Ilgari har tugma o'z ramkasi bilan alohida turardi va toolbar
   ikkita notekis qatorga sinib ketardi. Ads Manager'da esa bir
   guruh tugma BITTA botgan yo'lak ichida yashaydi va faqat tanlangani
   ko'tarilib turadi — ko'z bir zumda "bular bitta tanlov" deb o'qiydi.

   Bizda ko'tarilgan element SHISHA: tagidagi yo'lak va undan ham
   pastdagi kontent ko'rinib turadi. */

/** Botgan yo'lak — ichidagi tugmalar uchun fon. */
const YOLAK = 'shisha-yolak inline-flex items-center gap-1 rounded-md p-1';

/** Yo'lak ichidagi bitta tugma. */
const yolakTugma = (active: boolean) =>
  cn(
    'inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-semibold',
    'transition-[background-color,color,box-shadow] duration-200',
    active ? 'shisha text-accent' : 'text-ink-2 hover:text-accent'
  );

export default function DashboardPage() {
  const tr = useTr();
  const [preset, setPreset] = useState<PresetId>('last30');
  const [range, setRange] = useState(() => rangeForPreset('last30'));
  const [model, setModel] = useState<Model>('last_click');

  const [view, setView] = useState<View>('campaigns');

  // Tanlangan kampaniya/ad set'lar — Ads Manager naqshi. Map, Set emas:
  // yorliqdagi chip tanlangan yagona element NOMINI ko'rsatadi, id emas.
  const [selCampaigns, setSelCampaigns] = useState<Map<string, string>>(new Map());
  const [selAdsets, setSelAdsets] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('all');
  const [columns, setColumns] = useState<string[]>(loadVisibleColumns);

  const fbStatus = useQuery({ queryKey: ['fb-status'], queryFn: facebookApi.status });
  const adAccountId = fbStatus.data?.adAccountId ?? null;

  /**
   * ⚠ KPI VA JADVAL BIR XIL SANANI YUBORISHI SHART.
   *
   * `range` ichida ISO timestamp turadi (`2026-09-22T19:00:00.000Z` —
   * Toshkent yarim tuni). Backend esa `from` ning birinchi 10 belgisini
   * kesib oladi, ya'ni UTC sanasini: `2026-09-22`. Jadval esa allaqachon
   * `kunlikOraliq()` orqali MAHALLIY sana yuborardi: `2026-09-23`.
   *
   * Natija: bitta ekranda ikki xil oraliq. "23-sentabr" tanlansa KPI
   * 22+23 ni qo'shardi ($36), jadval faqat 23 ni ($14). Hech qayerda
   * xato chiqmasdi — ikkala raqam ham ishonarli ko'rinadi.
   *
   * Shuning uchun `kun` endi bu yerda, so'rovdan OLDIN hisoblanadi va
   * ikkala so'rov ham shundan oziqlanadi.
   *
   * "Maximum" — sana filtri YO'Q degani: `kun = null`, backendga sana
   * yuborilmaydi va u butun davr ustunlaridan o'qiydi.
   */
  const kun = preset === 'maximum' ? null : kunlikOraliq(range);

  const overview = useQuery({
    // Ad account kalitga kiradi: aks holda akkaunt almashtirilganda React Query
    // eski javobni qaytaraveradi (staleTime 5 daqiqa) va dashboard boshqa
    // akkauntning raqamlarini ko'rsatadi.
    queryKey: ['overview', adAccountId, kun?.from ?? null, kun?.to ?? null, model],
    queryFn: () => dashboardApi.overview(kun?.from, kun?.to),
    staleTime: 5 * 60 * 1000,
  });

  // Akkaunt almashganda: drill holati eski akkauntning kampaniya/adset'iga
  // ishora qilib turardi — shuning uchun "No ads found" chiqardi. Tozalaymiz
  // va butun keshni bekor qilamiz.
  const queryClient = useQueryClient();
  const prevAccount = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevAccount.current === undefined) {
      prevAccount.current = adAccountId;
      return;
    }
    if (prevAccount.current === adAccountId) return;
    prevAccount.current = adAccountId;
    setView('campaigns');
    setSelCampaigns(new Map());
    setSelAdsets(new Map());
    setSearch('');
    void queryClient.invalidateQueries();
  }, [adAccountId, queryClient]);

  const crmStatus = useQuery({ queryKey: ['amocrm-status'], queryFn: amocrmApi.status });
  const setupIncomplete =
    !fbStatus.isLoading &&
    !crmStatus.isLoading &&
    !fbStatus.data?.connected &&
    !crmStatus.data?.connected;

  /* Demo: bo'sh workspace'da mahsulot nima ko'rsatishini ko'rish uchun.
     Server faqat Facebook/amoCRM ulanmagan workspace'da ruxsat beradi. */
  const demo = useQuery({
    queryKey: ['demo-status'],
    queryFn: () =>
      api
        .get<{ demo: boolean; demoLeads: number }>('/api/dashboard/demo-status')
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const [demoBusy, setDemoBusy] = useState(false);
  const demoniYoq = async () => {
    setDemoBusy(true);
    try {
      const r = await workspaceApi.demoYarat();
      toast.ok(
        tr(
          `Demo tayyor: ${r.kampaniya} kampaniya, ${r.lid} lid, ${r.sotuv} sotuv`,
          `Demo ready: ${r.kampaniya} campaigns, ${r.lid} leads, ${r.sotuv} sales`
        , `Демо готово: ${r.kampaniya} кампании, ${r.lid} лидов, ${r.sotuv} продаж`)
      );
      await queryClient.invalidateQueries();
    } catch (err) {
      toast.bad(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          tr("Demo yaratilmadi. Qayta urinib ko'ring.", 'Could not create the demo. Please try again.', 'Не удалось создать демо. Попробуйте ещё раз.')
      );
    } finally {
      setDemoBusy(false);
    }
  };

  const d = overview.data;
  const loading = overview.isLoading;
  // `revenue` sana rejimida null bo'ladi — bo'lishdan oldin tekshiriladi.
  const metaPct =
    d && d.revenue !== null && d.revenue > 0
      ? Math.round((d.revenueBySource.metaAds / d.revenue) * 100)
      : 0;

  /**
   * Ikki valyuta, ikki manba. Chalkashtirmaslik uchun har raqam qaysi
   * tomondan kelganiga qarab belgilanadi:
   *   fbVal  — Facebook aytgan pul: xarajat va undan kelib chiqqan hamma narsa
   *   crmVal — CRM aytgan pul: daromad va undan kelib chiqqan hamma narsa
   * Hali ma'lum bo'lmasa (sinxrondan oldin) — null, belgisiz raqam chiqadi.
   */
  const fbVal = d?.currency?.fb ?? null;
  const crmVal = d?.currency?.crm ?? null;

  const cards: KpiSpec[] = [
    { title: 'Amount Spent', value: formatMoney(d?.amountSpent, fbVal) },
    {
      title: 'Revenue',
      value: formatMoneyOrDash(d?.revenue, crmVal),
      subtitle: kun
        ? tr(
            d?.vaqt?.izoh ?? '',
            'All figures for the selected days: spend from Facebook, sales and revenue from the CRM (by close date).'
          , 'Все цифры за выбранные дни: расход из Facebook, продажи и выручка из CRM (по дате закрытия).') || undefined
        : tr(`${metaPct}% Meta Ads'dan`, `${metaPct}% from Meta Ads`, `${metaPct}% из Meta Ads`),
    },
    {
      title: 'ROAS',
      value: formatRoas(d?.roas),
      // Valyuta mos kelmasa qiymat "—" bo'ladi; sababsiz "—" esa
      // "ma'lumot yo'q" deb tushuniladi, shuning uchun sabab shu yerda.
      subtitle: d?.currency?.mismatch
        ? tr(
            d.currency.reason ?? '',
            d.currency.rate
              ? `Spend in ${d.currency.fb}, revenue in ${d.currency.crm}. Converted at 1 ${d.currency.fb} = ${d.currency.rate.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${d.currency.crm}${d.currency.rateSource ? ` (${d.currency.rateSource}, ${d.currency.rateDate ?? '—'})` : ''}.`
              : `Ad account in ${d.currency.fb}, CRM revenue in ${d.currency.crm}. No exchange rate — ROAS not computed.`,
            d.currency.rate
              ? `Расход в ${d.currency.fb}, выручка в ${d.currency.crm}. Курс: 1 ${d.currency.fb} = ${d.currency.rate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${d.currency.crm}${d.currency.rateSource ? ` (${d.currency.rateSource}, ${d.currency.rateDate ?? '—'})` : ''}.`
              : `Рекламный аккаунт в ${d.currency.fb}, выручка CRM в ${d.currency.crm}. Курса нет — ROAS не рассчитан.`
          ) || undefined
        : undefined,
      hero: true,
    },
    // CAC = xarajat / sotuv → xarajat valyutasida.
    { title: 'CAC', value: formatMoneyOrDash(d?.cac, fbVal) },
    { title: 'Conversion Rate', value: formatPercentOrDash(d?.conversionRate) },
    { title: 'Deal Time', value: formatDaysOrDash(d?.dealTime) },
    // ARPL = daromad / lid → daromad valyutasida. Bu yerda `$` turgan edi.
    { title: 'ARPL', value: formatMoneyOrDash(d?.arpl, crmVal) },
    {
      title: 'Revenue Growth',
      value: formatPercentOrDash(d?.revenueGrowth),
      // Yagona sanaga bog'liq katak: tanlangan oraliq ↔ undan oldingi
      // teng oraliq. Qolgan kataklar butun davr.
      subtitle: tr('tanlangan oraliq vs oldingi', 'selected range vs previous', 'выбранный период vs предыдущий'),
      trend: n(d?.revenueGrowth),
    },
  ];

  const updateColumns = (keys: string[]) => {
    setColumns(keys);
    saveVisibleColumns(keys);
  };

  const campaignIds = [...selCampaigns.keys()];
  const adsetIds = [...selAdsets.keys()];

  /** Hozirgi ko'rinishdagi tanlov to'plami. Ads darajasida tanlash yig'ilmaydi
   *  — undan pastda daraja yo'q, shuning uchun bo'sh Map beriladi. */
  const currentSelection =
    view === 'campaigns' ? selCampaigns : view === 'adsets' ? selAdsets : new Map<string, string>();

  const setCurrent = (next: Map<string, string>) => {
    if (view === 'campaigns') {
      setSelCampaigns(next);
      // Kampaniya tanlovi o'zgarsa, eski ad set tanlovi endi boshqa
      // kampaniyaga tegishli bo'lishi mumkin — tozalaymiz, aks holda
      // "Ads" yorlig'i mos kelmaydigan reklamalarni ko'rsatardi.
      setSelAdsets(new Map());
    } else if (view === 'adsets') {
      setSelAdsets(next);
    }
  };

  const toggleRow = (row: { id: string; name: string }, checked: boolean) => {
    const next = new Map(currentSelection);
    if (checked) next.set(row.id, row.name);
    else next.delete(row.id);
    setCurrent(next);
  };

  const toggleAll = (rows: Array<{ id: string; name: string }>, checked: boolean) => {
    const next = new Map(currentSelection);
    for (const r of rows) {
      if (checked) next.set(r.id, r.name);
      else next.delete(r.id);
    }
    setCurrent(next);
  };

  // Nom bosilganda: faqat o'shani tanlab, bir daraja pastga o'tamiz —
  // Ads Manager ham shunday qiladi.
  const handleDrill = (sel: { id: string; name: string }) => {
    if (view === 'campaigns') {
      setSelCampaigns(new Map([[sel.id, sel.name]]));
      setSelAdsets(new Map());
      setView('adsets');
    } else if (view === 'adsets') {
      setSelAdsets(new Map([[sel.id, sel.name]]));
      setView('ads');
    }
  };

  /**
   * Filtrga mos BARCHA elementni tanlaydi — sahifalardan tashqari ham.
   *
   * Sarlavhadagi katakcha faqat ko'rinib turgan 50 qatorni belgilaydi.
   * Ro'yxat 247 ta bo'lsa, foydalanuvchi "hammasini tanladim" deb o'ylab
   * qolishi mumkin. Shuning uchun alohida, ataylab bosiladigan amal.
   */
  const selectAllMatching = async () => {
    if (view === 'ads') return; // ads darajasida tanlov ishlatilmaydi
    const params: Record<string, string> = { level: view };
    if (view === 'adsets' && campaignIds.length > 0) params.campaignIds = campaignIds.join(',');
    const all = await dashboardApi.entityIds(params);
    setCurrent(new Map(all.map((r) => [r.id, r.name ?? '—'])));
  };

  const clearSelection = (level: View) => {
    if (level === 'campaigns') {
      setSelCampaigns(new Map());
      setSelAdsets(new Map());
    } else if (level === 'adsets') {
      setSelAdsets(new Map());
    }
  };

  /** Yorliq yozuvi: bitta tanlansa nomi, ko'p bo'lsa soni. */
  const tabChipLabel = (sel: Map<string, string>) =>
    sel.size === 1 ? [...sel.values()][0] : tr(`${sel.size} tanlandi`, `${sel.size} selected`, `Выбрано: ${sel.size}`);

  return (
    <div className="space-y-5">
      {setupIncomplete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-[1.5px] border-warn/30 bg-warn/12 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-warn">
            <AlertTriangle aria-hidden className="h-4 w-4 flex-none" />
            {tr(
              "Sozlash tugallanmagan — haqiqiy raqamlar uchun Facebook Ads va CRM'ni ulang.",
              'Setup incomplete — connect Facebook Ads and your CRM to see real data.',
              'Настройка не завершена — подключите Facebook Ads и CRM, чтобы видеть реальные данные.'
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!demo.data?.demo && (
              <Button
                size="sm"
                variant="ghost"
                loading={demoBusy}
                onClick={() => void demoniYoq()}
              >
                {tr("Demo ma'lumot bilan ko'rish", 'View with demo data', 'Посмотреть на демо-данных')}
              </Button>
            )}
            <Link
              to="/onboarding"
              className="inline-flex h-8 items-center rounded-sm border-[1.5px] border-edge bg-surface px-3 text-xs font-semibold text-accent transition-shadow duration-200 hover:shadow-glow-xs"
            >
              {tr('Sozlashni yakunlash', 'Finish setup', 'Завершить настройку')}
            </Link>
          </div>
        </div>
      )}

      {/* ═══════════════ TEPA PANEL ═══════════════

          Faqat MA'LUMOT MANBAI: qaysi reklama akkaunti, qaysi sana,
          qaysi ustunlar. Ya'ni butun sahifaga ta'sir qiladigan narsa.

          Jadvalga tegishli boshqaruv (daraja, filtr, qidiruv, model)
          bu yerda EMAS — u kartochkalardan keyin, jadvalning ustida.
          Ilgari ikkalasi bitta panelda edi va qaysi tugma nimaga
          ta'sir qilishi ko'rinmasdi.

          Panel `sticky`: kontent uning TAGIDAN suriladi. Shisha
          effekti ishlashi uchun shart — orqasida hech narsa bo'lmasa,
          shisha shunchaki bo'yalgan to'rtburchak.

          `-mx-4 px-4` — panel Layout paddingini kesib o'tib, chetdan
          chetgacha cho'ziladi (Apple'da ham panel ekran qirrasiga
          tegib turadi). */}
      <div
        className={cn(
          'shisha sticky top-0 z-30 -mx-4 px-4 py-3 md:-mx-8 md:px-8',
          'rounded-none'
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h1 className="text-xl font-bold text-ink">Dashboard</h1>
            <PeriodLabel window={d?.window} />
          </div>
          <AdAccountSelector />
          <DateRangePicker
            value={range}
            preset={preset}
            onChange={(r, p) => {
              setRange(r);
              setPreset(p);
            }}
          />
          <ColumnsButton visible={columns} onChange={updateColumns} />
          <BreakdownButton />
        </div>
      </div>

      {/* ── KPI cards (full width) ── */}
      {overview.isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border-[1.5px] border-line bg-surface px-4 py-3">
          <p className="text-sm text-bad">
            {tr('Ko‘rsatkichlar yuklanmadi.', 'Failed to load overview metrics.', 'Не удалось загрузить метрики.')}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void overview.refetch()}>
            {tr('Qayta urinish', 'Retry', 'Повторить')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map((c) => (
            <KpiCard
              key={c.title}
              title={tr(c.title, c.title, KPI_RU[c.title] ?? c.title)}
              value={c.value}
              subtitle={c.subtitle}
              trend={c.trend}
              loading={loading}
              hero={c.hero}
            />
          ))}
        </div>
      )}

      {/* ═══ JADVAL BOSHQARUVI ═══

          Bu qator KPI kartochkalaridan KEYIN turadi va ataylab:
          u faqat jadvalga ta'sir qiladi — daraja, filtr, qidiruv,
          atribusiya modeli. Kartochkalar esa sana tanlagichiga
          bo'ysunadi, bu tugmalarga emas.

          Ilgari u tepadagi panelda edi va "hamma narsani boshqaradi"
          degan taassurot berardi. Boshqaruv o'zi ta'sir qiladigan
          narsaning yonida turishi kerak.

          `sticky` EMAS: tepada allaqachon bitta yopishgan panel bor,
          ikkitasi ustma-ust tushib, ikkinchisi birinchisining tagida
          ko'rinmay qolardi. Jadvalning o'z sarlavhasi esa o'z
          qutisida yopishib turadi — qidiruv paytida yo'qolmaydi. */}
      <div className="shisha rounded-md px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
        {/* Daraja. Yorliq hech qachon bloklanmaydi: hech narsa
            tanlanmagan bo'lsa shu darajaning hammasi ko'rinadi. */}
        <div className={YOLAK}>
          {VIEW_TABS.map(({ id, label, ru, Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={yolakTugma(view === id)}
            >
              <Icon aria-hidden className="h-4 w-4 flex-none" />
              {tr(label, label, ru)}
            </button>
          ))}
        </div>

        {/* Tanlov chiplari — yo'lakdan TASHQARIDA.
            Ilgari ular yorliqqa yopishib turardi va yorliq kengligi
            tanlangan kampaniya nomiga qarab sakrardi. */}
        {VIEW_TABS.map(({ id, label: en, ru }) => {
          const label = tr(en, en, ru);
          const sel = id === 'campaigns' ? selCampaigns : id === 'adsets' ? selAdsets : null;
          if (!sel || sel.size === 0) return null;
          return (
            <span
              key={`chip-${id}`}
              className="inline-flex items-center gap-1 rounded-sm border-[1.5px] border-edge bg-tint px-2 py-1.5 text-sm font-semibold text-accent"
              title={[...sel.values()].join(', ')}
            >
              <span className="max-w-[10rem] truncate">{tabChipLabel(sel)}</span>
              <button
                onClick={() => clearSelection(id)}
                aria-label={tr(`${label} tanlovini tozalash`, `Clear ${label} selection`, `Снять выбор: ${label}`)}
                className="rounded-[3px] text-accent/70 hover:text-accent"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}

        <span aria-hidden className="mx-1 hidden h-6 w-px bg-line-2/70 lg:block" />

        {/* Tezkor filtr */}
        <div className={YOLAK}>
          {PILLS.map((p) => (
            <button
              key={p.id}
              onClick={() => setFilter(p.id)}
              aria-pressed={filter === p.id}
              className={yolakTugma(filter === p.id)}
            >
              {tr(p.label, p.label, p.ru)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="w-48">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('Nom bo‘yicha qidirish…', 'Search by name…', 'Поиск по названию…')}
              aria-label={tr('Nom bo‘yicha qidirish', 'Search by name', 'Поиск по названию')}
              icon={<Search className="h-4 w-4" />}
            />
          </div>

          <span aria-hidden className="mx-1 hidden h-6 w-px bg-line-2/70 lg:block" />

          {/* Atribusiya modeli */}
          <div className={YOLAK}>
            {(['first_click', 'last_click'] as Model[]).map((m) => (
              <button
                key={m}
                onClick={() => setModel(m)}
                aria-pressed={model === m}
                className={yolakTugma(model === m)}
              >
                {m === 'first_click'
                  ? tr('First click', 'First click', 'Первый клик')
                  : tr('Last click', 'Last click', 'Последний клик')}
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* ── Full-width data table ── */}
      <EntityTable
        view={view}
        campaignIds={campaignIds}
        adsetIds={adsetIds}
        search={search}
        filter={filter}
        visibleColumns={columns}
        selected={currentSelection}
        onToggle={toggleRow}
        onToggleAll={toggleAll}
        onSelectAllMatching={selectAllMatching}
        onClearSelection={() => clearSelection(view)}
        onDrill={handleDrill}
        kunFrom={kun?.from ?? null}
        kunTo={kun?.to ?? null}
      />

      {/* ── Donut + Top Performers below ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SourceDonut data={d?.revenueBySource} loading={loading} crmCurrency={crmVal} />
        <div className="lg:col-span-2">
          <TopPerformers crmCurrency={crmVal} />
        </div>
      </div>
    </div>
  );
}
