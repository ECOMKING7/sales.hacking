import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { formatMoney } from '../../utils/format';
import { Card, EmptyState, Skeleton, SkeletonText } from '../ui';

interface SourceData {
  metaAds: number;
  direct: number;
  igOrganic: number;
  fbOrganic: number;
}

/**
 * Diagramma ranglari dizayn tokenlaridan olinadi — qotgan hex yo'q.
 * SVG `fill` ichida CSS o'zgaruvchisi ishlaydi: token qiymati "37 99 235"
 * ko'rinishida saqlanadi, shuning uchun rgb(...) ga o'raymiz.
 *
 * Diqqat: qorong'i mavzuda --accent va --edge bir xil qiymatga ega,
 * shuning uchun ikkinchi bo'lak uchun --edge-soft olinadi.
 */
const COLORS = [
  'rgb(var(--accent))',
  'rgb(var(--edge-soft))',
  'rgb(var(--ok))',
  'rgb(var(--warn))',
  'rgb(var(--ink-3))',
];

/**
 * `crmCurrency` — bu yerdagi raqamlar DAROMAD, ya'ni CRM valyutasida.
 * Majburiy prop: unutilsa TypeScript ogohlantiradi, `$` jim qo'yilmaydi.
 */
export default function SourceDonut({
  data,
  loading,
  crmCurrency,
}: {
  data?: SourceData;
  loading?: boolean;
  crmCurrency: string | null;
}) {
  const slices = [
    { name: 'Meta Ads', value: data?.metaAds ?? 0 },
    { name: 'Direct', value: data?.direct ?? 0 },
    { name: 'IG Organic', value: data?.igOrganic ?? 0 },
    { name: 'FB Organic', value: data?.fbOrganic ?? 0 },
  ];
  const total = slices.reduce((s, x) => s + x.value, 0);
  const top = [...slices].sort((a, b) => b.value - a.value)[0];

  return (
    <Card padding="md">
      <h3 className="mb-4 text-sm font-semibold text-ink">Revenue by Source</h3>

      {loading ? (
        <div role="status" aria-label="Yuklanmoqda">
          <Skeleton className="mx-auto h-44 w-44 rounded-full" />
          <div className="mt-4">
            <SkeletonText lines={4} />
          </div>
        </div>
      ) : (
        <>
          {total > 0 ? (
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
                    stroke="none"
                  >
                    {slices.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-3">
                  {top.name}
                </span>
                <span className="mt-1 text-lg font-bold tabular-nums text-ink">
                  {formatMoney(top.value, crmCurrency)}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<PieChartIcon />}
              title="No data"
              hint="daromad yo'q · manba bo'yicha taqsimot hisoblanmaydi"
            />
          )}

          <ul className="mt-4 space-y-1.5">
            {slices.map((s, i) => (
              <li key={s.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-ink-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  {s.name}
                </span>
                <span className="font-medium tabular-nums text-ink">
                  {formatMoney(s.value, crmCurrency)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
