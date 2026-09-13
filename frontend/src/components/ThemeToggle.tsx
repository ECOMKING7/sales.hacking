import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { cn } from './ui';

type Props = {
  /** Layout ikon-raili uchun 'rail', boshqa joyda 'inline'. */
  variant?: 'rail' | 'inline';
  className?: string;
};

/**
 * Yorug' ⇄ qorong'i almashtirgich.
 * Tanlov localStorage da saqlanadi; standart — yorug'.
 */
export default function ThemeToggle({ variant = 'rail', className }: Props) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Yorug‘ temaga o‘tish' : 'Qorong‘i temaga o‘tish';
  const Icon = dark ? Sun : Moon;

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={toggle}
        title={label}
        aria-label={label}
        aria-pressed={dark}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line-2 bg-surface',
          'text-ink-3 transition-[box-shadow,color,background-color] duration-200',
          'hover:text-accent hover:shadow-glow-xs',
          className
        )}
      >
        <Icon aria-hidden className="h-[18px] w-[18px]" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={dark}
      className={cn(
        'group relative flex h-[38px] w-full items-center gap-2 rounded-sm px-2.5 text-sm',
        'text-ink-3 transition-[box-shadow,color,background-color] duration-200',
        'hover:bg-surface-3 hover:text-accent',
        'md:w-[38px] md:justify-center md:px-0',
        className
      )}
    >
      <Icon aria-hidden className="h-[18px] w-[18px] flex-none" />
      <span className="md:hidden">{dark ? 'Yorug‘ tema' : 'Qorong‘i tema'}</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap rounded-sm border border-line-2 bg-surface px-2 py-1 text-xs font-medium text-ink opacity-0 shadow-glow-xs transition-opacity duration-150 group-hover:opacity-100 md:block"
      >
        {label}
      </span>
    </button>
  );
}
