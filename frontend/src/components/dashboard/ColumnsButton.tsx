import { useState, useRef, useEffect } from 'react';
import { Columns3, ChevronDown } from 'lucide-react';
import { ALL_COLUMNS } from './columns';
import { Button, cn } from '../ui';

export default function ColumnsButton({
  visible,
  onChange,
}: {
  visible: string[];
  onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = (key: string) => {
    onChange(
      visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key]
    );
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        icon={<Columns3 className="h-4 w-4" />}
        iconRight={<ChevronDown className="h-4 w-4" />}
        className={cn(
          'border-line-2 text-ink-2 hover:border-edge hover:text-accent',
          open && 'border-edge text-accent shadow-glow-xs'
        )}
      >
        Columns
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 max-h-80 w-56 overflow-y-auto rounded-md border-[1.5px] border-line-2 bg-surface p-2 shadow-glow-sm">
          {ALL_COLUMNS.map((c) => {
            const checked = c.always || visible.includes(c.key);
            return (
              <label
                key={c.key}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-sm border-[1.5px] border-transparent px-3 py-1.5 text-sm transition-colors duration-150',
                  c.always
                    ? 'text-ink-3'
                    : checked
                      ? 'cursor-pointer border-edge bg-tint text-accent'
                      : 'cursor-pointer text-ink-2 hover:bg-tint hover:text-accent'
                )}
              >
                <span className="flex items-center gap-2">
                  {c.label}
                  {c.unavailable && (
                    <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-3">
                      soon
                    </span>
                  )}
                </span>
                <input
                  type="checkbox"
                  disabled={c.always}
                  checked={checked}
                  onChange={() => toggle(c.key)}
                  className="h-3.5 w-3.5 rounded-sm border-[1.5px] border-line-2 accent-accent"
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
