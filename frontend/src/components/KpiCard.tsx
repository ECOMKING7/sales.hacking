import { Card, Skeleton, cn } from './ui';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  /** musbat = o'sish (yashil), manfiy = tushish (qizil) */
  trend?: number;
  loading?: boolean;
  /**
   * Ekrandagi asosiy javob (ROAS). Havorang ramka va glow oladi.
   * Bir sahifada BITTA karta hero bo'ladi — aks holca ierarxiya yo'qoladi.
   */
  hero?: boolean;
}

export default function KpiCard({
  title,
  value,
  subtitle,
  trend,
  loading,
  hero = false,
}: KpiCardProps) {
  return (
    <Card highlight={hero} interactive={!hero} padding="sm">
      <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-3">
        {title}
      </p>

      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p
          className={cn(
            'mt-1.5 text-2xl font-bold tabular-nums',
            hero ? 'text-accent' : 'text-ink'
          )}
        >
          {value}
        </p>
      )}

      {subtitle && !loading && (
        <p
          className={cn(
            'mt-1 text-xs font-medium tabular-nums',
            trend === undefined ? 'text-ink-3' : trend >= 0 ? 'text-ok' : 'text-bad'
          )}
        >
          {trend !== undefined && (
            <span aria-hidden>{trend >= 0 ? '↑ ' : '↓ '}</span>
          )}
          {subtitle}
        </p>
      )}
    </Card>
  );
}
