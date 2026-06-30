import { useState, useRef, useEffect } from 'react';
import { Columns3, ChevronDown } from 'lucide-react';
import { ALL_COLUMNS } from './columns';

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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Columns3 className="h-4 w-4 text-gray-500" />
        Columns
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 max-h-80 w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          {ALL_COLUMNS.map((c) => (
            <label
              key={c.key}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ${
                c.always ? 'text-gray-400' : 'cursor-pointer text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="flex items-center gap-2">
                {c.label}
                {c.unavailable && <span className="text-[10px] text-gray-400">soon</span>}
              </span>
              <input
                type="checkbox"
                disabled={c.always}
                checked={c.always || visible.includes(c.key)}
                onChange={() => toggle(c.key)}
                className="rounded border-gray-300"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
