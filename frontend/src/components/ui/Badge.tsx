import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad';

interface BadgeProps {
  tone?: BadgeTone;
  /** Chap tarafda nuqta. 'live' — pulsatsiya bilan (faqat jonli holat uchun) */
  dot?: boolean | 'live';
  children: ReactNode;
  className?: string;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-2 border-line-2',
  accent: 'bg-tint text-accent border-edge-soft',
  ok: 'bg-ok/12 text-ok border-ok/30',
  warn: 'bg-warn/12 text-warn border-warn/30',
  bad: 'bg-bad/10 text-bad border-bad/28',
};

export function Badge({ tone = 'neutral', dot, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'font-mono text-label uppercase tracking-[0.06em]',
        TONES[tone],
        className
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 rounded-full bg-current',
            dot === 'live' && 'animate-blip'
          )}
        />
      )}
      {children}
    </span>
  );
}
