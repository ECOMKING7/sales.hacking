/**
 * Sozlamalar bo'limlarining umumiy qismlari.
 *
 * NEGA AJRATILDI: SettingsPage.tsx 1149 qatorga yetgan va ichida
 * to'rtta mustaqil bo'lim bor edi — Facebook, amoCRM, Meta CAPI,
 * piksel. Ular bir-biriga bog'liq emas, lekin bitta faylda turgani
 * uchun bittasiga tegish qolganlarini ham xavf ostiga qo'yardi.
 */
import { type ReactNode } from 'react';
import { Badge, Button, cn } from '../ui';

export function errMsg(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
  );
}


/** Ulanish holati — CardHeader'ning action joyida turadi. */
export function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge tone="ok" dot>
      Ulangan
    </Badge>
  ) : (
    <Badge tone="neutral">Ulanmagan</Badge>
  );
}

/** Xato + qayta urinish. Har bo'lim shu bitta naqshdan foydalanadi. */
export function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <p className="text-sm text-bad">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}

export const LABEL = 'mb-1.5 block text-xs font-semibold text-ink-2';
export const SELECT = cn(
  'h-10 w-full rounded-sm border-[1.5px] border-line-2 bg-surface px-3 text-sm text-ink',
  'transition-[box-shadow,border-color] duration-200 disabled:cursor-not-allowed disabled:opacity-50'
);

/**
 * Holat qatori: yorliq chapga, qiymat o'ngga — ikkalasi ham karta chekkasiga
 * tekislanadi. Ilgari `grid-cols-2` edi va qiymat kartaning o'rtasida
 * osilib turardi.
 */
export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 last:border-b-0">
      <dt className="flex-none text-sm text-ink-2">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}

/** Kartaning pastki qatori — yuqori chiziq bilan ajratilgan. */
export function CardFooterRow({ children }: { children: ReactNode }) {
  return <div className="mt-5 border-t border-line pt-3">{children}</div>;
}
