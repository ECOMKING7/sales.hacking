import { Construction } from 'lucide-react';
import { EmptyState } from '../components/ui';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <EmptyState icon={<Construction />} title="Coming in a later step." />
    </div>
  );
}
