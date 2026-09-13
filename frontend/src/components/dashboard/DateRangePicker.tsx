import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import {
  PRESETS,
  PresetId,
  DateRange,
  rangeForPreset,
  customRange,
  formatRangeLabel,
} from '../../utils/dateRanges';
import { Button, Input, cn } from '../ui';

export default function DateRangePicker({
  value,
  preset,
  onChange,
}: {
  value: DateRange;
  preset: PresetId;
  onChange: (range: DateRange, preset: PresetId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (id: PresetId) => {
    if (id === 'custom') return; // handled by the apply button
    onChange(rangeForPreset(id), id);
    setOpen(false);
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    onChange(customRange(customFrom, customTo), 'custom');
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        icon={<Calendar className="h-4 w-4" />}
        iconRight={<ChevronDown className="h-4 w-4" />}
        className={cn(
          'border-line-2 text-ink-2 hover:border-edge hover:text-accent',
          open && 'border-edge text-accent shadow-glow-xs'
        )}
      >
        {formatRangeLabel(value)}
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-md border-[1.5px] border-line-2 bg-surface p-2 shadow-glow-sm">
          <ul className="max-h-64 overflow-y-auto">
            {PRESETS.filter((p) => p.id !== 'custom').map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p.id)}
                  aria-current={preset === p.id || undefined}
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm border-[1.5px] border-transparent px-3 py-1.5 text-sm transition-colors duration-150',
                    preset === p.id
                      ? 'border-edge bg-tint font-semibold text-accent'
                      : 'text-ink-2 hover:bg-tint hover:text-accent'
                  )}
                >
                  {p.label}
                  {p.id === 'maximum' && (
                    <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-3">
                      lifetime
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2 border-t border-line pt-2">
            <p className="px-3 pb-1.5 font-mono text-label uppercase tracking-[0.1em] text-ink-3">
              Custom range
            </p>
            <div className="flex items-center gap-2 px-3">
              <Input
                type="date"
                aria-label="From"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 px-2 text-xs tabular-nums"
              />
              <span aria-hidden className="text-ink-3">
                –
              </span>
              <Input
                type="date"
                aria-label="To"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 px-2 text-xs tabular-nums"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="mt-2"
            >
              Apply custom range
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
