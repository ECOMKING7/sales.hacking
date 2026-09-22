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
import { Badge, Modal, Skeleton, cn } from '../components/ui';

type Kalit = keyof IntegratsiyaHolatlari;

interface Tarif {
  kalit: Kalit;
  nom: string;
  izoh: string;
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
 * ⚠ lucide v1 da brend belgilari olib tashlangan (Facebook, Telegram
 * yo'q) — shuning uchun umumiy belgilar ishlatiladi.
 */
const TARIFLAR: Tarif[] = [
  {
    kalit: 'facebook',
    nom: 'Facebook Ads',
    izoh: 'Reklama xarajati va yetkazish metrikalari',
    Belgi: Megaphone,
    Bolim: FacebookSection,
  },
  {
    kalit: 'amocrm',
    nom: 'amoCRM',
    izoh: 'Lidlar, etaplar va sotuvlar',
    Belgi: Database,
    Bolim: AmocrmSection,
    keng: true,
  },
  {
    kalit: 'webhook',
    nom: 'Webhook',
    izoh: 'Yangi lid haqida CRM darhol xabar beradi',
    Belgi: Webhook,
    Bolim: WebhookSection,
  },
  {
    kalit: 'leadAds',
    nom: 'Lead Ads',
    izoh: 'Lid qaysi reklamadan kelganini aniqlaydi',
    Belgi: Link2,
    Bolim: LeadAdsSection,
  },
  {
    kalit: 'capi',
    nom: 'Meta Conversions API',
    izoh: 'CRM natijasini Meta algoritmiga qaytaradi',
    Belgi: Radio,
    Bolim: MetaCapiSection,
    keng: true,
  },
  {
    kalit: 'telegram',
    nom: 'Telegram',
    izoh: 'Rejali hisobot va sotuv xabari',
    Belgi: Send,
    Bolim: TelegramSection,
    keng: true,
  },
  {
    kalit: 'pixel',
    nom: 'Piksel',
    izoh: 'Saytdagi fbclid → konversiya zanjiri',
    Belgi: Code2,
    Bolim: PixelSection,
  },
];

export default function SettingsPage() {
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

  const tanlangan = useMemo(() => TARIFLAR.find((t) => t.kalit === ochiq) ?? null, [ochiq]);

  const yop = () => {
    setOchiq(null);
    // Modal ichida nimadir ulangan bo'lishi mumkin — belgilarni yangilaymiz.
    void load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Integratsiyalar</h1>
        <p className="mt-1 text-sm text-ink-2">
          Ma'lumot manbalari va xabarnomalar. Sozlash uchun kartani bosing.
        </p>
      </div>

      {justConnected && (
        <div className="rounded-md border-[1.5px] border-ok/30 bg-ok/12 px-4 py-3 text-sm text-ok">
          Ulanish muvaffaqiyatli.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TARIFLAR.map((t) => (
          <IntegratsiyaKartasi
            key={t.kalit}
            tarif={t}
            holat={holatlar?.[t.kalit] ?? null}
            yuklanyapti={holatlar === null}
            onOch={() => setOchiq(t.kalit)}
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
  { matn: string; tone: 'ok' | 'warn' | 'neutral'; nuqta: boolean }
> = {
  ok: { matn: 'Ulangan', tone: 'ok', nuqta: true },
  ogoh: { matn: "E'tibor kerak", tone: 'warn', nuqta: true },
  yoq: { matn: 'Ulanmagan', tone: 'neutral', nuqta: false },
  nomalum: { matn: 'Tekshirilmagan', tone: 'neutral', nuqta: false },
};

function IntegratsiyaKartasi({
  tarif,
  holat,
  yuklanyapti,
  onOch,
}: {
  tarif: Tarif;
  holat: IntegratsiyaHolat | null;
  yuklanyapti: boolean;
  onOch: () => void;
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
            {b.matn}
          </Badge>
        ) : null}
      </div>

      <p className="text-base font-semibold text-ink">{tarif.nom}</p>
      <p className="mt-1 text-sm leading-snug text-ink-2">{tarif.izoh}</p>

      {/* Bir qatorli tafsilot — qaysi akkaunt, nechta chat va hokazo.
          `truncate` shart: akkaunt nomi uzun bo'lsa kartani cho'zib
          yuboradi va to'rdagi kartalar balandligi turlicha bo'lib qoladi. */}
      <p className="mt-3 min-h-[1.25rem] truncate text-xs text-ink-3">
        {yuklanyapti ? '' : (holat?.izoh ?? '')}
      </p>

      <span className="mt-3 text-sm font-medium text-accent">
        {holat?.holat === 'ok' || holat?.holat === 'ogoh' ? 'Sozlash' : 'Ulash'} →
      </span>
    </button>
  );
}
