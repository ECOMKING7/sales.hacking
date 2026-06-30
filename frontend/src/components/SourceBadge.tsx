const STYLES: Record<string, string> = {
  'Meta Ads': 'bg-blue-100 text-blue-700',
  'FB Organic': 'bg-gray-100 text-gray-600',
  'IG Organic': 'bg-pink-100 text-pink-700',
  Direct: 'border border-gray-300 text-gray-600',
};

export default function SourceBadge({ source }: { source: string }) {
  const cls = STYLES[source] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {source}
    </span>
  );
}
