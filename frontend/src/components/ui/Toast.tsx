/**
 * Bildirishnoma (toast) — "saqlandi", "ulandi", "nusxalandi".
 *
 * NEGA KERAK: ilgari tugma bosilganda ekranda hech narsa o'zgarmasdi.
 * Foydalanuvchi saqlandimi yoki yo'qmi bilmay, tugmani ikki-uch marta
 * bosardi. Javob bor edi, lekin u kichkina yozuv sifatida tugma yonida
 * turardi va ko'zga tashlanmasdi.
 *
 * QOIDA: bildirishnoma FAQAT ish HAQIQATAN bajarilgach chiqadi, bosilgan
 * payt emas. "Saqlandi" deb yozib, keyin saqlanmagani — eng yomon variant:
 * foydalanuvchi ishonadi va ketadi.
 *
 * KONTEKST YO'Q — ataylab. Modul darajasidagi oddiy emitter: `toast.ok()`
 * ni istalgan joydan, hatto React komponentidan tashqarida ham chaqirsa
 * bo'ladi. Provider o'rash va uni butun daraxtga tarqatish shart emas.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, TriangleAlert, X } from 'lucide-react';
import { cn } from './cn';

export type ToastTone = 'ok' | 'bad' | 'info';

export interface ToastItem {
  id: number;
  matn: string;
  tone: ToastTone;
}

type Tinglovchi = (t: ToastItem) => void;

const tinglovchilar = new Set<Tinglovchi>();
let keyingiId = 1;

function chiqar(matn: string, tone: ToastTone): void {
  const item: ToastItem = { id: keyingiId++, matn, tone };
  for (const f of tinglovchilar) f(item);
}

export const toast = {
  ok: (matn: string) => chiqar(matn, 'ok'),
  bad: (matn: string) => chiqar(matn, 'bad'),
  info: (matn: string) => chiqar(matn, 'info'),
};

/**
 * Tugma nomidan bajarilgan shaklni yasaydi:
 *   Saqlash   → Saqlandi
 *   Ulash     → Ulandi
 *   Yoqish    → Yoqildi
 *   Tekshirish→ Tekshirildi
 *   Nusxalash → Nusxalandi
 *
 * Qoida ikkita: "-ish" bilan tugasa → "-ildi" (undosh o'zak),
 * shunchaki "-sh" bilan tugasa → "-ndi" (unli o'zak).
 *
 * ⚠ Bu qoida `Etaplarni saqlash` kabi to'ldiruvchili nomda grammatik
 * jihatdan g'aliz chiqadi ("Etaplarni saqlandi"). Shuning uchun uni
 * ko'r-ko'rona ishlatmaymiz — muhim joylarda matn qo'lda beriladi,
 * bu funksiya faqat oddiy bir so'zli tugmalar uchun.
 */
export function bajarildi(tugmaNomi: string): string {
  const s = tugmaNomi.trim();
  if (!s) return 'Bajarildi';
  if (/ish$/i.test(s)) return s.replace(/ish$/i, 'ildi');
  if (/sh$/i.test(s)) return s.replace(/sh$/i, 'ndi');
  return `${s} — bajarildi`;
}

/** Ekranda qancha turadi. */
const MUDDAT_MS = 2600;
/** Bir vaqtda ko'pi bilan shuncha — ekran to'lib ketmasin. */
const MAX_KORINADI = 3;

const TONE: Record<ToastTone, { ramka: string; matn: string; ikonka: ReactNode }> = {
  ok: {
    ramka: 'border-ok/35',
    matn: 'text-ok',
    ikonka: <Check className="h-3.5 w-3.5" aria-hidden />,
  },
  bad: {
    ramka: 'border-bad/35',
    matn: 'text-bad',
    ikonka: <TriangleAlert className="h-3.5 w-3.5" aria-hidden />,
  },
  info: {
    ramka: 'border-edge/45',
    matn: 'text-accent',
    ikonka: <Check className="h-3.5 w-3.5" aria-hidden />,
  },
};

/**
 * Bildirishnomalar konteyneri. App ichida BIR MARTA joylashtiriladi.
 *
 * `aria-live="polite"` — ekran o'quvchi matnni o'qiydi, lekin
 * foydalanuvchining ishini bo'lmaydi.
 */
export function ToastHost() {
  const [royxat, setRoyxat] = useState<ToastItem[]>([]);

  useEffect(() => {
    const qoshish: Tinglovchi = (t) => {
      setRoyxat((oldingi) => [...oldingi, t].slice(-MAX_KORINADI));
      window.setTimeout(() => {
        setRoyxat((oldingi) => oldingi.filter((x) => x.id !== t.id));
      }, MUDDAT_MS);
    };
    tinglovchilar.add(qoshish);
    return () => {
      tinglovchilar.delete(qoshish);
    };
  }, []);

  if (!royxat.length) return null;

  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-6 z-50',
        'flex flex-col items-center gap-2 px-4'
      )}
    >
      {royxat.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex max-w-full items-center gap-2.5 rounded-md border-[1.5px] px-4 py-2.5',
            // Shisha: yarim shaffof fon + orqa fonni xiralashtirish.
            'bg-surface/70 backdrop-blur-xl',
            'shadow-[0_10px_34px_-12px_rgb(var(--ink)/0.35)]',
            // Yuqori qirrasidagi yorug' chiziq — shishaga hajm beradi.
            'bg-[linear-gradient(180deg,rgb(255_255_255/0.26),rgb(255_255_255/0)_58%)]',
            'motion-safe:animate-toast-kirish',
            TONE[t.tone].ramka
          )}
        >
          <span className={cn('flex-none', TONE[t.tone].matn)}>{TONE[t.tone].ikonka}</span>
          <span className="text-sm font-semibold text-ink">{t.matn}</span>
          <button
            type="button"
            aria-label="Yopish"
            onClick={() => setRoyxat((o) => o.filter((x) => x.id !== t.id))}
            className="ml-1 flex-none text-ink-3 transition-colors hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
