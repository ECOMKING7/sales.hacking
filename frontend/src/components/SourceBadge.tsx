import { Badge } from './ui';
import type { BadgeTone } from './ui';

/**
 * Manba yorlig'i. Havorang ("accent") faqat pullik reklama uchun —
 * u atribusiyaning asosiy obyekti. Organik va to'g'ridan-to'g'ri — neytral.
 */
const TONES: Record<string, BadgeTone> = {
  'Meta Ads': 'accent',
  'FB Organic': 'neutral',
  'IG Organic': 'neutral',
  Direct: 'neutral',
};

export default function SourceBadge({ source }: { source: string }) {
  return <Badge tone={TONES[source] ?? 'neutral'}>{source}</Badge>;
}
