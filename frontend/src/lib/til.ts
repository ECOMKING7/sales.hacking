/**
 * INTERFEYS TILI — o'zbekcha (asosiy), inglizcha va ruscha.
 *
 * NEGA KUTUBXONASIZ: i18next ~40 KB va kalitlar fayli talab qiladi.
 * Bizda matn komponent ichida turadi va uch til yonma-yon yoziladi:
 *   tr("Ulangan", "Connected", "Подключено")
 * Shunda matnni o'zgartirgan odam qolgan tillarni ko'rmasdan o'tib
 * ketolmaydi — tarjima "kalitlar faylida qolib ketmaydi".
 *
 * Tanlov tartibi: ?lang=uz|en|ru (havola orqali) → localStorage → 'uz'.
 * ?lang= ham saqlanadi: Meta tekshiruvchisiga `?lang=en` havola bersak,
 * u keyin qaysi sahifaga o'tsa ham inglizcha qoladi.
 *
 * ⚠ Backend matnlari (izohlar, xato xabarlari) hali o'zbekcha. Ko'rinadigan
 * joylarda frontend ularni tuzilgan maydonlardan o'zi yig'adi.
 */
import { create } from 'zustand';

export type Til = 'uz' | 'en' | 'ru';
export const TILLAR: Array<{ id: Til; qisqa: string; nom: string }> = [
  { id: 'uz', qisqa: 'UZ', nom: "O'zbekcha" },
  { id: 'en', qisqa: 'EN', nom: 'English' },
  { id: 'ru', qisqa: 'RU', nom: 'Русский' },
];
const togri = (v: unknown): v is Til => v === 'uz' || v === 'en' || v === 'ru';
const KALIT = 'mcq-til';

function boshlangich(): Til {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (togri(q)) {
      localStorage.setItem(KALIT, q);
      return q;
    }
    const s = localStorage.getItem(KALIT);
    if (togri(s)) return s;
  } catch {
    /* localStorage yopiq (inkognito/iframe) — standart til */
  }
  return 'uz';
}

interface TilHolati {
  til: Til;
  setTil: (t: Til) => void;
}

export const useTil = create<TilHolati>((set) => ({
  til: boshlangich(),
  setTil: (til) => {
    try {
      localStorage.setItem(KALIT, til);
    } catch {
      /* saqlanmasa ham joriy sessiyada ishlaydi */
    }
    document.documentElement.lang = til;
    set({ til });
  },
}));

if (typeof document !== 'undefined') document.documentElement.lang = useTil.getState().til;

export type Tr = (uz: string, en: string, ru: string) => string;

const tanla = (til: Til, uz: string, en: string, ru: string) =>
  til === 'en' ? en : til === 'ru' ? ru : uz;

/** Komponent ichida: til almashsa qayta chiziladi. */
export function useTr(): Tr {
  const til = useTil((s) => s.til);
  return (uz, en, ru) => tanla(til, uz, en, ru);
}

/** Komponentdan tashqarida (toast, util). Qayta chizishga obuna bo'lmaydi.
 *  App.tsx til almashganda daraxtni qayta o'rnatadi — shuning uchun xavfsiz. */
export const trNow: Tr = (uz, en, ru) => tanla(useTil.getState().til, uz, en, ru);
