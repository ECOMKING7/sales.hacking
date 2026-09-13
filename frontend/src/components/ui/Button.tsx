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

const VARIANTS: Record<ButtonVariant, string> = {
  // Ekranda bitta asosiy tugma. U yonadi.
  primary:
    'bg-accent text-accent-ink border-transparent shadow-glow-sm hover:shadow-glow-md',
  // Integratsiyalar shu yerda — brend rangi tugmaga emas, ikonkaga ketadi.
  secondary:
    'bg-surface text-accent border-edge hover:shadow-glow-xs',
  ghost:
    'bg-transparent text-ink-2 border-transparent hover:bg-edge/12 hover:text-accent',
  danger:
    'bg-transparent text-bad border-bad/45 hover:bg-bad/8',
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
        'inline-flex items-center justify-center rounded-sm border-[1.5px] font-semibold',
        'transition-[box-shadow,background-color,border-color] duration-200',
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
