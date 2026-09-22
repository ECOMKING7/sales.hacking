import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Jadval primitivi.
 * Gorizontal skroll o'z konteynerida — sahifa yon tomonga surilmaydi.
 * Raqamli ustunlarga <Td numeric> qo'ying: tabular-nums va o'ngga tekislash.
 */

/**
 * `forwardRef` — chaqiruvchi balandlikni o'lchashi uchun (EntityTable).
 * Busiz `sticky bottom-0` ekrandan pastda qolib ko'rinmasdi.
 */
export const TableWrap = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function TableWrap({ className, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'overflow-x-auto rounded-md border-[1.5px] border-line bg-surface',
          className
        )}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn('w-full border-collapse text-sm', className)} {...rest}>
      {children}
    </table>
  );
}

export function Th({
  numeric,
  className,
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-line bg-surface-2 px-4 py-3',
        'font-mono text-label font-normal uppercase tracking-[0.09em] text-ink-3',
        numeric ? 'text-right' : 'text-left',
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  numeric,
  className,
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'whitespace-nowrap border-b border-line px-4 py-3 text-ink',
        /* Raqam — jadvaldagi eng muhim narsa, shuning uchun eng katta.
           Ilgari u boshqa matn bilan bir xil o'lchamda edi va ko'z
           avval yashil "ACTIVE" belgisiga tushardi. Holat — kontekst,
           raqam — javob. Ierarxiya shuni aks ettirishi kerak. */
        numeric && 'text-right text-[15px] font-semibold tabular-nums tracking-[-0.01em]',
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({
  selected,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        'transition-colors duration-150 last:[&>td]:border-b-0',
        // 200 qatorli jadvalda glow ishlatilmaydi — faqat fon.
        'hover:bg-edge/9',
        selected && 'bg-edge/7 shadow-[inset_3px_0_0_rgb(var(--accent))]',
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-ink-3">
        {children}
      </td>
    </tr>
  );
}
