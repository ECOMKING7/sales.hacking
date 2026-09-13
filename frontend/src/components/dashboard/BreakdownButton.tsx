import { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Button, cn } from '../ui';

const BREAKDOWNS = ['Placement', 'Age', 'Gender', 'Region'];

export default function BreakdownButton() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (b: string) => {
    // Breakdown data isn't synced from the FB Insights API yet — degrade gracefully.
    setNote(`${b} breakdown is not available yet.`);
    setOpen(false);
    setTimeout(() => setNote(''), 3000);
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        icon={<SlidersHorizontal className="h-4 w-4" />}
        iconRight={<ChevronDown className="h-4 w-4" />}
        className={cn(
          'border-line-2 text-ink-2 hover:border-edge hover:text-accent',
          open && 'border-edge text-accent shadow-glow-xs'
        )}
      >
        Breakdown
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-44 rounded-md border-[1.5px] border-line-2 bg-surface p-2 shadow-glow-sm"
        >
          {BREAKDOWNS.map((b) => (
            <button
              key={b}
              type="button"
              role="menuitem"
              onClick={() => pick(b)}
              className="block w-full rounded-sm px-3 py-1.5 text-left text-sm text-ink-2 transition-colors duration-150 hover:bg-tint hover:text-accent"
            >
              By {b}
            </button>
          ))}
        </div>
      )}

      {note && (
        <div
          role="status"
          className="absolute right-0 top-full z-30 mt-2 w-56 rounded-sm border-[1.5px] border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn"
        >
          {note}
        </div>
      )}
    </div>
  );
}
