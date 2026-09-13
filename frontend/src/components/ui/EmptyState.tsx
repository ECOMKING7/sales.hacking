import type { ReactNode } from 'react';
import { cn } from './cn';

interface EmptyStateProps {
  /** Yonayotgan qutidagi ikonka */
  icon: ReactNode;
  /** Bitta jumla — nima yo'q */
  title: string;
  /** Nima uchun muhim — mono shriftda, qisqa */
  hint?: string;
  /** Bitta harakat */
  action?: ReactNode;
  /** true bo'lsa punktir ramka (fayl/ulanish kutilayotgan zonalar uchun) */
  dashed?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  dashed = true,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-lg px-6 py-11 text-center',
        dashed
          ? 'border-2 border-dashed border-edge bg-gradient-to-b from-edge/10 to-edge/[0.03] shadow-glow-xs'
          : 'border-[1.5px] border-line bg-surface',
        className
      )}
    >
      <span
        aria-hidden
        className="mx-auto mb-4 grid h-[76px] w-[76px] place-items-center rounded-[20px] border-[1.5px] border-edge bg-tint text-accent shadow-glow-sm [&>svg]:h-8 [&>svg]:w-8"
      >
        {icon}
      </span>

      <p className="text-lg font-bold tracking-[-0.02em] text-ink-2">{title}</p>
      {hint && <p className="mt-1.5 font-mono text-xs text-ink-3">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
