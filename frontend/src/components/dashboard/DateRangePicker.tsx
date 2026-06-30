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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Calendar className="h-4 w-4 text-gray-500" />
        {formatRangeLabel(value)}
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <ul className="max-h-64 overflow-y-auto">
            {PRESETS.filter((p) => p.id !== 'custom').map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => pick(p.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm hover:bg-gray-100 ${
                    preset === p.id ? 'font-semibold text-indigo-600' : 'text-gray-700'
                  }`}
                >
                  {p.label}
                  {p.id === 'maximum' && (
                    <span className="text-[10px] text-gray-400">lifetime</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2 border-t border-gray-100 pt-2">
            <p className="px-3 pb-1 text-xs font-medium text-gray-500">Custom range</p>
            <div className="flex items-center gap-2 px-3">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <span className="text-gray-400">–</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
            <button
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="mt-2 w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Apply custom range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
