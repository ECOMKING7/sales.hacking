/**
 * MODAL — integratsiya sozlamalari uchun oyna
 *
 * Nega kerak: sozlamalar sahifasi 7 ta bo'limdan iborat va har biri
 * uzun (amoCRM bo'limi yolg'iz o'zi 400 qator). Ustma-ust qo'yilganda
 * sahifa besh ekran bo'ladi va kerakli joyni topish uchun aylantirib
 * chiqish kerak. To'r + modal: avval qaysi integratsiya ekanini
 * tanlaysiz, keyin faqat o'shani ko'rasiz.
 *
 * ⚠ MODALNING O'Z SARLAVHASI YO'Q — ataylab.
 * Ichiga qo'yiladigan bo'limlar allaqachon `<Card>` + `<CardHeader>`
 * bilan keladi: belgi, nom, izoh va holat belgisi ularda bor. Modal
 * yana bitta sarlavha chizsa, ekranda ikkita sarlavha va ikkita ramka
 * paydo bo'lardi. Shuning uchun modal faqat FON va YOPISH tugmasini
 * beradi, qolganini bo'limning o'zi chizadi.
 *
 * Yopish tugmasi kartaning USTIDA, fon ustida turadi — karta ichidagi
 * holat belgisi (o'ng yuqori burchak) bilan to'qnashmasin.
 *
 * ⚠ TANA SCROLL'I QULFLANADI. Aks holda modal ichida oxiriga yetganda
 * ortdagi sahifa aylana boshlaydi va yopilganda foydalanuvchi butunlay
 * boshqa joyda turadi.
 *
 * Klaviatura: Esc yopadi; fokus ochilganda modalga o'tadi va yopilganda
 * uni ochgan kartaga QAYTADI — aks holda Tab bosilsa fokus sahifaning
 * boshiga sakraydi.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Kengroq oyna — ichida jadval yoki ko'p ustun bo'lsa. */
  size?: 'md' | 'lg';
  /** Skrinreader uchun nom (ko'rinmaydi — sarlavhani bo'lim chizadi). */
  label: string;
}

const O_LCHAM = {
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
} as const;

export function Modal({ open, onClose, children, size = 'md', label }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const ochganRef = useRef<HTMLElement | null>(null);

  const escBosildi = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;

    ochganRef.current = document.activeElement as HTMLElement | null;

    const eskiOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', escBosildi);

    // requestAnimationFrame — panel DOM'ga joylashgandan keyin,
    // aks holda ref hali null.
    const t = requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      document.body.style.overflow = eskiOverflow;
      document.removeEventListener('keydown', escBosildi);
      cancelAnimationFrame(t);
      ochganRef.current?.focus?.();
    };
  }, [open, escBosildi]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div aria-hidden className="fixed inset-0 bg-ground/75 backdrop-blur-[2px]" />

      <div
        className="relative flex min-h-full items-start justify-center p-4 sm:p-6"
        onMouseDown={(e) => {
          /* Faqat FON bosilganda yopamiz. `onClick` bo'lsa, modal ichida
             boshlanib tashqarida tugagan matn tanlash ham yopib yuborardi. */
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div ref={panelRef} tabIndex={-1} className={cn('w-full outline-none', O_LCHAM[size])}>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              aria-label="Yopish"
              className={cn(
                'grid h-9 w-9 place-items-center rounded-sm border-[1.5px] border-line-2 bg-surface',
                'text-ink-2 transition-colors hover:border-edge-soft hover:text-ink'
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
