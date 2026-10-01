/**
 * SOZLAMALAR — integratsiyalar to'ri
 *
 * ILGARI: yettita bo'lim ustma-ust, sahifa besh ekran uzunlikda edi.
 * Telegram'ni topish uchun amoCRM'ning 400 qatorlik voronka sozlamasi
 * yonidan aylanib o'tish kerak edi.
 *
 * HOZIR: har integratsiya — bitta karta. Kartada uchta narsa bor va
 * boshqa hech narsa yo'q:
 *   1. Nomi va bir qatorli izoh — bu nima qiladi
 *   2. Holat belgisi — ulanganmi
 *   3. Bir qatorli tafsilot — masalan qaysi akkaunt
 * Bosilsa modal ochiladi va sozlash o'sha yerda davom etadi.
 *
 * ⚠ HOLAT BELGISI BITTA SO'ROVDAN KELADI (`/api/workspace/integratsiyalar`).
 * Har karta o'zini o'zi so'rasa sahifa ochilishida 7 ta parallel so'rov
 * bo'lardi. Bo'lim komponentlari esa modal OCHILGANDA o'z to'liq
 * ma'lumotini yuklaydi — ya'ni yopiq kartalar hech narsa so'ramaydi.
 *
 * ⚠ Bo'limlar modal ichida o'z `<Card>` va `<CardHeader>` i bilan
 * chiziladi. Modal sarlavha chizmaydi (Modal.tsx dagi izohga qarang).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HUQUQIY } from '../config/huquqiy';
import {
  Code2,
  Database,
  Link2,
  Megaphone,
  Radio,
  Send,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import FacebookSection from '../components/settings/FacebookSection';
import AmocrmSection from '../components/settings/AmocrmSection';
import MetaCapiSection from '../components/settings/MetaCapiSection';
import LeadAdsSection from '../components/settings/LeadAdsSection';
import WebhookSection from '../components/settings/WebhookSection';
import PixelSection from '../components/settings/PixelSection';
import TelegramSection from '../components/settings/TelegramSection';
import { workspaceApi } from '../services/api';
import type { IntegratsiyaHolat, IntegratsiyaHolatlari } from '../types';
import { Badge, Modal, Skeleton, cn, toast } from '../components/ui';
import { useTr, type Tr } from '../lib/til';
import { oauthXabarYubor } from '../lib/oauthKanal';

type Kalit = keyof IntegratsiyaHolatlari;

interface Tarif {
  kalit: Kalit;
  nom: string;
  izoh: string;
  izohEn: string;
  izohRu: string;
  Belgi: LucideIcon;
  Bolim: () => React.ReactElement;
  /** Ichida ko'p ustun yoki jadval bo'lsa kengroq oyna. */
  keng?: boolean;
}

/**
 * ⚠ Tartib TASODIFIY EMAS — bu o'rnatish ketma-ketligi.
 * Facebook va amoCRM bo'lmasa qolganining ma'nosi yo'q; webhook
 * amoCRM'ga, Lead Ads esa Facebook'ga tayanadi. Yangi integratsiya
 * qo'shilganda ham shu mantiqqa qo'yiladi.
 *
 * ⚠ Bu ASOSIY tartib, EKRANDAGI tartib emas. Ekranda kartalar avval
 * holat bo'yicha guruhlanadi (pastdagi `kartalar` izohiga qarang), bu
 * ro'yxat esa bir xil holatdagilar orasida tartibni belgilaydi.
 *
 * ⚠ lucide v1 da brend belgilari olib tashlangan (Facebook, Telegram
 * yo'q) — shuning uchun umumiy belgilar ishlatiladi.
 */
const TARIFLAR: Tarif[] = [
  {
    kalit: 'facebook',
    nom: 'Facebook Ads',
    izoh: 'Reklama xarajati va yetkazish metrikalari',
    izohEn: 'Ad spend and delivery metrics',
    izohRu: 'Расходы на рекламу и метрики показов',
    Belgi: Megaphone,
    Bolim: FacebookSection,
  },
  {
    kalit: 'amocrm',
    nom: 'amoCRM',
    izoh: 'Lidlar, etaplar va sotuvlar',
    izohEn: 'Leads, pipeline stages and sales',
    izohRu: 'Лиды, этапы и продажи',
    Belgi: Database,
    Bolim: AmocrmSection,
    keng: true,
  },
  {
    kalit: 'webhook',
    nom: 'Webhook',
    izoh: 'Yangi lid haqida CRM darhol xabar beradi',
    izohEn: 'CRM notifies us about new leads instantly',
    izohRu: 'CRM мгновенно сообщает о новых лидах',
    Belgi: Webhook,
    Bolim: WebhookSection,
  },
  {
    kalit: 'leadAds',
    nom: 'Lead Ads',
    izoh: 'Lid qaysi reklamadan kelganini aniqlaydi',
    izohEn: 'Identifies which ad each lead came from',
    izohRu: 'Определяет, из какой рекламы пришёл лид',
    Belgi: Link2,
    Bolim: LeadAdsSection,
  },
  {
    kalit: 'capi',
    nom: 'Meta Conversions API',
    izoh: 'CRM natijasini Meta algoritmiga qaytaradi',
    izohEn: 'Sends CRM outcomes back to Meta',
    izohRu: 'Возвращает результаты CRM в алгоритм Meta',
    Belgi: Radio,
    Bolim: MetaCapiSection,
    keng: true,
  },
  {
    kalit: 'telegram',
    nom: 'Telegram',
    izoh: 'Rejali hisobot va sotuv xabari',
    izohEn: 'Scheduled reports and sale alerts',
    izohRu: 'Отчёты по расписанию и уведомления о продажах',
    Belgi: Send,
    Bolim: TelegramSection,
    keng: true,
  },
  {
    kalit: 'pixel',
    nom: 'Piksel',
    izoh: 'Saytdagi fbclid → konversiya zanjiri',
    izohEn: 'On-site fbclid → conversion chain',
    izohRu: 'Цепочка fbclid → конверсия на сайте',
    Belgi: Code2,
    Bolim: PixelSection,
  },
];

export default function SettingsPage() {
  const tr = useTr();
  const [holatlar, setHolatlar] = useState<IntegratsiyaHolatlari | null>(null);
  const [ochiq, setOchiq] = useState<Kalit | null>(null);

  const params = new URLSearchParams(window.location.search);
  const justConnected = params.get('fb') === 'connected' || params.get('amocrm') === 'connected';

  const load = useCallback(async () => {
    try {
      setHolatlar(await workspaceApi.integratsiyalar());
    } catch {
      /* Holat belgisi — qulaylik, majburiyat emas. Yuklanmasa kartalar
         baribir ochiladi va bo'limning o'zi haqiqiy holatni ko'rsatadi. */
      setHolatlar(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* amoCRM callback natijasi — xato bo'lsa foydalanuvchi jim qolmasin. */
  const amoNatija = params.get('amocrm');

  /* OAuth popup ichida ochilgan bo'lsak — natijani asosiy oynaga beramiz
     va popup'ni yopamiz. Asosiy oyna holatni o'zi qayta yuklaydi. */
  const popupdami = Boolean(amoNatija && window.opener && window.opener !== window);
  useEffect(() => {
    if (!popupdami) return;
    try {
      window.opener.postMessage(
        { type: 'amocrm-oauth', status: amoNatija },
        window.location.origin
      );
    } catch {
      /* boshqa domendagi opener — popup yopilishi baribir kuzatiladi */
    }
    window.close();
  }, [popupdami, amoNatija]);

  /* Facebook popup (`?popup=1` — callback qo'yadi). `window.opener`
     COOP sabab null bo'lishi mumkin, shuning uchun BroadcastChannel. */
  const fbNatija = params.get('fb');
  const fbPopup = Boolean(fbNatija && params.get('popup') === '1');
  useEffect(() => {
    if (!fbPopup || !fbNatija) return;
    oauthXabarYubor({ tur: 'fb', holat: fbNatija });
    window.close();
  }, [fbPopup, fbNatija]);

  useEffect(() => {
    if (popupdami) return;
    const matn: Record<string, string> = {
      taken: 'This amoCRM account is already connected to another workspace.',
      denied: 'Access was not granted in amoCRM.',
      error: `amoCRM connection failed. Try again or write to ${HUQUQIY.email}.`,
    };
    if (amoNatija && matn[amoNatija]) toast.bad(matn[amoNatija]);
  }, [amoNatija, popupdami]);

  /**
   * ⚠ UMUMIY QOIDA — HOLATGA EGA HAR QANDAY TO'R/RO'YXAT SHUNDAY TARTIBLANADI.
   *
   * Bir xil holatdagi kartalar YONMA-YON turadi. Aralash tartib
   * (ulangan · ulangan · tekshirilmagan · ulangan · ulangan · ulangan)
   * ko'zni har kartada qayta ishlashga majbur qiladi — odam "nima
   * qilishim kerak?" degan savolga darhol javob ololmaydi.
   *
   * Guruhlangan tartibda esa bitta qarash yetadi: yashil blok — tegmaysiz,
   * undan keyingisi — ish bor.
   *
   * Tartib mantiqi: AVVAL TUGAGANLAR, KEYIN ISH TALAB QILADIGANLAR.
   *   1. ok       — ulangan, ishlayapti
   *   2. ogoh     — ulangan, lekin yarim ishlaydi (eng shoshilinch ish)
   *   3. yoq      — ulanmagan, ulash mumkin
   *   4. nomalum  — bilmaymiz, ochib tekshirish kerak
   *
   * ⚠ `sort` BARQAROR (ES2019+): bir xil holatdagilar `TARIFLAR` dagi
   * o'rnatish ketma-ketligini saqlaydi — Facebook har doim amoCRM'dan
   * oldin turadi.
   *
   * ⚠ Holatlar hali yuklanmagan bo'lsa TARTIBLANMAYDI. Aks holda
   * kartalar yuklangandan keyin sakrab joyini almashtiradi va odam
   * bosmoqchi bo'lgan karta qo'l ostidan qochadi.
   */
  const kartalar = useMemo(() => {
    if (!holatlar) return TARIFLAR;
    const RANG: Record<IntegratsiyaHolat['holat'], number> = {
      ok: 0,
      ogoh: 1,
      yoq: 2,
      nomalum: 3,
    };
    // Backend yangi kalitni hali qaytarmasa — oxiriga, yiqilmasdan.
    const r = (k: Kalit) => RANG[holatlar[k]?.holat ?? 'nomalum'];
    return [...TARIFLAR].sort((a, b) => r(a.kalit) - r(b.kalit));
  }, [holatlar]);

  const tanlangan = useMemo(() => TARIFLAR.find((t) => t.kalit === ochiq) ?? null, [ochiq]);

  const yop = () => {
    setOchiq(null);
    // Modal ichida nimadir ulangan bo'lishi mumkin — belgilarni yangilaymiz.
    void load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">{tr('Integratsiyalar', 'Integrations', 'Интеграции')}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {tr(
            "Ma'lumot manbalari va xabarnomalar. Sozlash uchun kartani bosing.",
            'Data sources and notifications. Click a card to set it up.'
          , 'Источники данных и уведомления. Нажмите на карточку для настройки.')}
        </p>
      </div>

      {justConnected && (
        <div className="rounded-md border-[1.5px] border-ok/30 bg-ok/12 px-4 py-3 text-sm text-ok">
          {tr('Ulanish muvaffaqiyatli.', 'Connected successfully.', 'Успешно подключено.')}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kartalar.map((t) => (
          <IntegratsiyaKartasi
            key={t.kalit}
            tarif={t}
            holat={holatlar?.[t.kalit] ?? null}
            yuklanyapti={holatlar === null}
            onOch={() => setOchiq(t.kalit)}
            tr={tr}
          />
        ))}
      </div>

      {tanlangan && (
        <Modal open onClose={yop} size={tanlangan.keng ? 'lg' : 'md'} label={tanlangan.nom}>
          <tanlangan.Bolim />
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   BITTA KARTA

   Butun karta bosiladi (`<button>`), tugmagina emas: 280px kenglikdagi
   kartada faqat pastdagi tugmani nishonga olish — ortiqcha aniqlik
   talab qiladi, ayniqsa telefonda.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ `nomalum` "Sozlanmagan" EMAS.
 *
 * Birinchi versiyada shunday edi va ishlab turgan webhook ekranda
 * "sozlanmagan" bo'lib ko'rindi — chunki uning holatini bilish uchun
 * amoCRM'ga so'rov kerak va to'r uni so'ramaydi. Bilmagan narsani yo'q
 * deb yozish, noto'g'ri raqam ko'rsatish bilan bir xil darajadagi xato:
 * odam ishlayotgan narsani "tuzatishga" kirishadi.
 */
const BELGI: Record<
  IntegratsiyaHolat['holat'],
  { matn: string; en: string; ru: string; tone: 'ok' | 'warn' | 'neutral'; nuqta: boolean }
> = {
  ok: { matn: 'Ulangan', en: 'Connected', ru: 'Подключено', tone: 'ok', nuqta: true },
  ogoh: { matn: "E'tibor kerak", en: 'Needs attention', ru: 'Требует внимания', tone: 'warn', nuqta: true },
  yoq: { matn: 'Ulanmagan', en: 'Not connected', ru: 'Не подключено', tone: 'neutral', nuqta: false },
  nomalum: { matn: 'Tekshirilmagan', en: 'Not checked', ru: 'Не проверено', tone: 'neutral', nuqta: false },
};

/**
 * Backend kartadagi bir qatorli izohni o'zbekcha qaytaradi. Inglizcha
 * rejimda ma'lum shakllarni shu yerda o'giramiz; tanilmagani o'zicha qoladi
 * (nom/ID kabi tilsiz qiymatlar ham shu yo'l bilan to'g'ri chiqadi).
 */
const IZOH_TARJIMA: Array<[RegExp, string, string]> = [
  [/^Akkaunt (.+)$/, 'Account $1', 'Аккаунт $1'],
  [/^Reklama akkaunti tanlanmagan$/, 'No ad account selected', 'Рекламный аккаунт не выбран'],
  [/^Sotuv etaplari belgilanmagan.*$/, 'Won stages not set — revenue shows 0', 'Этапы продажи не заданы — выручка будет 0'],
  [/^Avval amoCRM ulansin$/, 'Connect amoCRM first', 'Сначала подключите amoCRM'],
  [/^Hali birorta signal kelmagan$/, 'No signal received yet', 'Сигналов ещё не было'],
  [/^Oxirgi signal (\d+) kun oldin$/, 'Last signal $1 day(s) ago', 'Последний сигнал $1 дн. назад'],
  [/^Oxirgi signal (\d+) soat oldin$/, 'Last signal $1 hour(s) ago', 'Последний сигнал $1 ч. назад'],
  [/^Signal hozirgina keldi$/, 'Signal just received', 'Сигнал только что получен'],
  [/^System User tokeni saqlangan$/, 'System User token saved', 'Токен System User сохранён'],
  [/^Token kiritilmagan$/, 'No token entered', 'Токен не введён'],
  [/^(\d+) ta sahifa ulangan$/, '$1 page(s) connected', 'Подключено страниц: $1'],
  [/^Sahifa bor, lekin webhook obunasi yo'q$/, 'Pages found, but not subscribed to leads', 'Страницы есть, но нет подписки на лиды'],
  [/^Sahifa ulanmagan$/, 'No pages connected', 'Страницы не подключены'],
  [/^Bot sozlanmagan$/, 'Bot not configured', 'Бот не настроен'],
  [/^Chat ulanmagan$/, 'No chat connected', 'Чат не подключён'],
  [/^(\d+) ta chat \((\d+) to'xtatilgan\)$/, '$1 chat(s) ($2 paused)', 'Чатов: $1 ($2 приостановлено)'],
  [/^(\d+) ta chat$/, '$1 chat(s)', 'Чатов: $1'],
  [/^Kodni saytga joylang$/, 'Add the code to your website', 'Разместите код на сайте'],
];

function izohTarjima(izoh: string, tr: Tr): string {
  for (const [re, en, ru] of IZOH_TARJIMA) {
    if (re.test(izoh)) return tr(izoh, izoh.replace(re, en), izoh.replace(re, ru));
  }
  return izoh;
}

function IntegratsiyaKartasi({
  tarif,
  holat,
  yuklanyapti,
  onOch,
  tr,
}: {
  tarif: Tarif;
  holat: IntegratsiyaHolat | null;
  yuklanyapti: boolean;
  onOch: () => void;
  tr: Tr;
}) {
  const { Belgi } = tarif;
  const b = holat ? BELGI[holat.holat] : null;

  return (
    <button
      type="button"
      onClick={onOch}
      className={cn(
        'group flex h-full flex-col rounded-md border-[1.5px] border-line bg-surface p-4 text-left',
        'transition-[box-shadow,border-color] duration-200',
        'hover:border-edge-soft hover:shadow-glow-xs',
        'focus:outline-none focus-visible:border-edge focus-visible:shadow-glow-sm'
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 flex-none place-items-center rounded-sm border-[1.5px] border-edge bg-tint text-accent"
        >
          <Belgi className="h-4 w-4" />
        </span>
        {yuklanyapti ? (
          <Skeleton className="h-5 w-20" />
        ) : b ? (
          <Badge tone={b.tone} dot={b.nuqta}>
            {tr(b.matn, b.en, b.ru)}
          </Badge>
        ) : null}
      </div>

      <p className="text-base font-semibold text-ink">
        {tarif.kalit === 'pixel' ? tr('Piksel', 'Pixel', 'Пиксель') : tarif.nom}
      </p>
      <p className="mt-1 text-sm leading-snug text-ink-2">{tr(tarif.izoh, tarif.izohEn, tarif.izohRu)}</p>

      {/* Bir qatorli tafsilot — qaysi akkaunt, nechta chat va hokazo.
          `truncate` shart: akkaunt nomi uzun bo'lsa kartani cho'zib
          yuboradi va to'rdagi kartalar balandligi turlicha bo'lib qoladi. */}
      <p className="mt-3 min-h-[1.25rem] truncate text-xs text-ink-3">
        {yuklanyapti || !holat?.izoh ? '' : izohTarjima(holat.izoh, tr)}
      </p>

      <span className="mt-3 text-sm font-medium text-accent">
        {holat?.holat === 'ok' || holat?.holat === 'ogoh'
          ? tr('Sozlash', 'Configure', 'Настроить')
          : tr('Ulash', 'Connect', 'Подключить')}{' '}
        →
      </span>
    </button>
  );
}
