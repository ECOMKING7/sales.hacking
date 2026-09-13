import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** true bo'lsa havorang ramka va glow — ekranda bittadan ortiq bo'lmasin */
  highlight?: boolean;
  /** hover'da yengil halo (bosiladigan kartalar uchun) */
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PAD = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
} as const;

export function Card({
  highlight = false,
  interactive = false,
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-md border-[1.5px] bg-surface',
        PAD[padding],
        highlight ? 'border-edge shadow-glow-sm' : 'border-line',
        interactive &&
          'transition-[box-shadow,border-color] duration-200 hover:border-edge-soft hover:shadow-glow-xs',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
}: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span
            aria-hidden
            className="grid h-10 w-10 flex-none place-items-center rounded-sm border-[1.5px] border-edge bg-tint text-accent"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-ink-2">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}
