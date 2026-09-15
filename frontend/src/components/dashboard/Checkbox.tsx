import { Check, Minus } from 'lucide-react';
import { cn } from '../ui';

interface Props {
  checked: boolean;
  /** Qisman tanlangan — sahifadagi qatorlarning bir qismi belgilangan. */
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  /** Ekran o'quvchi uchun nom. Ko'rinmaydi, lekin har katakcha uni talab qiladi. */
  label: string;
  disabled?: boolean;
}

/**
 * Jadval katakchasi — dizayn tizimi tilida.
 *
 * Native `<input type="checkbox">` ishlatilmaydi: u OS uslubida chiziladi va
 * 1.5px chegara, `rounded-sm`, glow, `accent` rangi — hech biri qo'llanmaydi.
 * Ilova ichida ikki xil vizual til paydo bo'lardi.
 *
 * Shuning uchun `role="checkbox"` li tugma: klaviatura va ekran o'quvchi uchun
 * native bilan bir xil, ko'rinishi esa to'liq bizniki.
 *
 * Radius bo'yicha ataylab chetlanish: tizimdagi `rounded-sm` = 9px, lekin 18px
 * katakda u aylanaga aylanadi va "radio — bittasini tanla" degan noto'g'ri
 * signal beradi. 6px — kvadratligini saqlaydi, yumshoqligini ham.
 */
export default function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled,
}: Props) {
  const partial = indeterminate && !checked;
  const on = checked || partial;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partial ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'grid h-[18px] w-[18px] flex-none place-items-center rounded-[6px] border-[1.5px]',
        'transition-[box-shadow,background-color,border-color] duration-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-edge',
        on
          ? 'border-transparent bg-accent text-accent-ink shadow-glow-sm'
          : 'border-line bg-surface hover:border-edge hover:shadow-glow-xs',
        disabled && 'cursor-not-allowed opacity-45 shadow-none'
      )}
    >
      {checked && <Check aria-hidden className="h-3 w-3" strokeWidth={3} />}
      {partial && <Minus aria-hidden className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}
