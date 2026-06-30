import { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';

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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <SlidersHorizontal className="h-4 w-4 text-gray-500" />
        Breakdown
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          {BREAKDOWNS.map((b) => (
            <button
              key={b}
              onClick={() => pick(b)}
              className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              By {b}
            </button>
          ))}
        </div>
      )}

      {note && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
          {note}
        </div>
      )}
    </div>
  );
}
