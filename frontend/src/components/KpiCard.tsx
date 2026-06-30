interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number; // positive = green, negative = red
  loading?: boolean;
}

export default function KpiCard({ title, value, subtitle, trend, loading }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-gray-200" />
      ) : (
        <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      )}
      {subtitle && !loading && (
        <p
          className={`mt-1 text-xs font-medium ${
            trend === undefined
              ? 'text-gray-500'
              : trend >= 0
                ? 'text-green-600'
                : 'text-red-600'
          }`}
        >
          {trend !== undefined && (trend >= 0 ? '▲ ' : '▼ ')}
          {subtitle}
        </p>
      )}
    </div>
  );
}
