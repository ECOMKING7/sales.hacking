import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/format';

interface SourceData {
  metaAds: number;
  direct: number;
  igOrganic: number;
  fbOrganic: number;
}

const COLORS = ['#3b82f6', '#9ca3af', '#ec4899', '#6366f1'];

export default function SourceDonut({ data, loading }: { data?: SourceData; loading?: boolean }) {
  const slices = [
    { name: 'Meta Ads', value: data?.metaAds ?? 0 },
    { name: 'Direct', value: data?.direct ?? 0 },
    { name: 'IG Organic', value: data?.igOrganic ?? 0 },
    { name: 'FB Organic', value: data?.fbOrganic ?? 0 },
  ];
  const total = slices.reduce((s, x) => s + x.value, 0);
  const top = [...slices].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Revenue by Source</h3>
      {loading ? (
        <div className="mx-auto h-44 w-44 animate-pulse rounded-full bg-gray-200" />
      ) : (
        <div className="relative">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={2}
              >
                {slices.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-gray-500">{total > 0 ? top.name : 'No data'}</span>
            <span className="text-lg font-bold text-gray-900">{formatCurrency(top.value)}</span>
          </div>
        </div>
      )}
      <ul className="mt-4 space-y-1.5">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-gray-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
              {s.name}
            </span>
            <span className="font-medium text-gray-900">{formatCurrency(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
