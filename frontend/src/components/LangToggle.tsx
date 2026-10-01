import { useEffect, useRef, useState } from 'react';
import { Languages } from 'lucide-react';
import { TILLAR, useTil } from '../lib/til';
import { cn } from './ui';

/**
 * Til tanlagich: UZ / EN / RU.
 * Tugmada joriy til qisqa nomi; bosilganda uch variantli menyu ochiladi.
 * Railda menyu o'ngga (rail tor), inline holatda pastga ochiladi.
 */
export default function LangToggle({
  variant = 'rail',
  className,
}: {
  variant?: 'rail' | 'inline';
  className?: string;
}) {
  const { til, setTil } = useTil();
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const joriy = TILLAR.find((t) => t.id === til) ?? TILLAR[0];

  useEffect(() => {
    if (!ochiq) return;
    const yop = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOchiq(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOchiq(false);
    document.addEventListener('mousedown', yop);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', yop);
      document.removeEventListener('keydown', esc);
    };
  }, [ochiq]);

  return (
    <div ref={ref} className={cn('relative', variant === 'rail' && 'w-full md:w-auto', className)}>
      <button
        type="button"
        onClick={() => setOchiq((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={ochiq}
        aria-label={`Language: ${joriy.nom}`}
        title="Til · Language · Язык"
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-sm font-mono text-xs font-bold',
          'text-ink-3 transition-[box-shadow,color,background-color] duration-200 hover:text-accent',
          variant === 'inline'
            ? 'h-9 border border-line-2 bg-surface px-2.5 hover:shadow-glow-xs'
            : 'h-[38px] w-full justify-start px-2.5 hover:bg-surface-3 md:w-[38px] md:justify-center md:px-0'
        )}
      >
        {variant === 'inline' && <Languages aria-hidden className="h-4 w-4" />}
        {joriy.qisqa}
      </button>

      {ochiq && (
        <ul
          role="listbox"
          aria-label="Language"
          className={cn(
            'absolute z-50 w-40 rounded-md border-[1.5px] border-line-2 bg-surface p-1 shadow-glow-sm',
            variant === 'inline' ? 'right-0 top-full mt-1.5' : 'bottom-full left-0 mb-1 md:bottom-0 md:left-[46px] md:mb-0'
          )}
        >
          {TILLAR.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={t.id === til}
                onClick={() => {
                  setOchiq(false);
                  if (t.id !== til) setTil(t.id);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-sm',
                  t.id === til ? 'bg-tint font-semibold text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                )}
              >
                {t.nom}
                <span className="font-mono text-xs text-ink-3">{t.qisqa}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
