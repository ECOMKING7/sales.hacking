import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Yuklanish holati — tugma bloklanadi va spinner chiqadi */
  loading?: boolean;
  /** Matndan oldin turadigan ikonka */
  icon?: ReactNode;
  /** Matndan keyin turadigan ikonka */
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

/**
 * Shisha uslubi.
 *
 * Uchta qatlam bir-birining ustida:
 *   1. yarim shaffof fon rangi   → bg-accent/90
 *   2. orqa fonni xiralashtirish → backdrop-blur-xl
 *   3. yuqoridan pastga yorug'lik → background-image gradient
 *
 * Uchinchisi aynan `background-image`, `::before` emas: psevdo-element
 * matnning ustiga tushib qolmasligi uchun z-index bilan ovora bo'lish
 * kerak bo'lardi. Fon rangi va fon rasmi esa bir xil elementda
 * bemalol yonma-yon yashaydi.
 *
 * Yorug'lik faqat YUQORI yarmida — pastgacha cho'zilsa tugma
 * yassilashib, plastik ko'rinadi.
 */
const SHISHA =
  'bg-[linear-gradient(180deg,rgb(255_255_255/0.30),rgb(255_255_255/0.06)_44%,rgb(255_255_255/0)_62%)] backdrop-blur-xl';

const VARIANTS: Record<ButtonVariant, string> = {
  // Ekranda bitta asosiy tugma. U yonadi.
  primary: cn(
    SHISHA,
    'bg-accent/90 text-accent-ink border-white/30',
    'shadow-glow-sm hover:bg-accent/95 hover:shadow-glow-md'
  ),
  // Integratsiyalar shu yerda — brend rangi tugmaga emas, ikonkaga ketadi.
  secondary: cn(
    SHISHA,
    'bg-surface/55 text-accent border-edge/70',
    'hover:bg-surface/75 hover:shadow-glow-xs'
  ),
  ghost:
    'bg-transparent text-ink-2 border-transparent hover:bg-edge/12 hover:text-accent',
  danger: cn(
    SHISHA,
    'bg-bad/10 text-bad border-bad/40 hover:bg-bad/16'
  ),
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-[18px] text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconRight,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-md border-[1.5px] font-semibold',
        'transition-[box-shadow,background-color,border-color,transform] duration-200',
        // Bosilganda ozgina cho'kadi — harakat sezilishi uchun yetarli,
        // sakramasligi uchun kichik.
        'motion-safe:active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
      ) : (
        icon
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
});
