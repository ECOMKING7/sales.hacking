import { useEffect, useRef } from 'react';
import { cn } from '../ui';

interface Props {
  checked: boolean;
  /** Qisman tanlangan holat — sarlavhadagi katakcha uchun. */
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  /** Ekran o'quvchi uchun nom. Ko'rinmaydi, lekin har katakcha uni talab qiladi. */
  label: string;
  disabled?: boolean;
}

/**
 * Jadval katakchasi.
 *
 * `indeterminate` HTML atributi emas — uni faqat JS orqali qo'yish mumkin,
 * shuning uchun ref kerak. Bu holat "sahifadagi qatorlarning bir qismi
 * tanlangan" degani va sarlavhadagi katakchani to'g'ri ko'rsatadi.
 */
export default function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      className={cn(
        'h-4 w-4 cursor-pointer rounded-[3px] border-[1.5px] border-line bg-surface',
        'accent-accent',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-edge',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    />
  );
}
