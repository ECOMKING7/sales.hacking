import { useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { workspaceApi } from '../services/api';
import { Badge, Button, Card, Skeleton } from '../components/ui';

interface PlanCard {
  id: string;
  name: string;
  price: string;
  /** Tavsiya qilinadigan tarif — ekranda bitta karta glow oladi */
  highlight?: boolean;
  features: {
    adAccounts: string;
    leads: string;
    export: boolean;
    whiteLabel: boolean;
  };
}

const PLANS: PlanCard[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    features: { adAccounts: '1 ad account', leads: '500 leads/mo', export: false, whiteLabel: false },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49/mo',
    highlight: true,
    features: { adAccounts: '3 ad accounts', leads: '5,000 leads/mo', export: true, whiteLabel: false },
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '$199/mo',
    features: { adAccounts: '10 ad accounts', leads: 'Unlimited leads', export: true, whiteLabel: true },
  },
];

function Cell({ on }: { on: boolean }) {
  return on ? (
    <Check className="h-4 w-4 flex-none text-ok" />
  ) : (
    <X className="h-4 w-4 flex-none text-ink-3" />
  );
}

export default function UpgradePage() {
  const usage = useQuery({ queryKey: ['usage'], queryFn: workspaceApi.usage });
  const current = usage.data?.plan;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Plans &amp; Pricing</h1>

        {usage.isLoading ? (
          <Skeleton className="mt-2 h-4 w-56" />
        ) : usage.isError ? (
          <div className="mt-2 flex items-center gap-3">
            <p className="text-sm text-bad">Could not load your current plan.</p>
            <Button variant="secondary" size="sm" onClick={() => usage.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-2">
            {current ? (
              <>
                You're on the <span className="font-semibold capitalize">{current}</span> plan.
              </>
            ) : (
              'Choose the plan that fits your team.'
            )}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = current === p.id;
          return (
            <Card key={p.id} highlight={p.highlight} padding="lg">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-ink">{p.name}</h2>
                {isCurrent && <Badge tone="neutral">Current</Badge>}
              </div>

              <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{p.price}</p>

              <ul className="mt-5 space-y-2 text-sm text-ink-2">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 flex-none text-ok" /> {p.features.adAccounts}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 flex-none text-ok" /> {p.features.leads}
                </li>
                <li className={`flex items-center gap-2 ${p.features.export ? '' : 'text-ink-3'}`}>
                  <Cell on={p.features.export} /> CSV export
                </li>
                <li
                  className={`flex items-center gap-2 ${p.features.whiteLabel ? '' : 'text-ink-3'}`}
                >
                  <Cell on={p.features.whiteLabel} /> White-label
                </li>
              </ul>

              <Button
                className="mt-6"
                variant={p.highlight ? 'primary' : 'secondary'}
                fullWidth
                disabled={isCurrent}
                onClick={() => {
                  // Oldin oddiy qator edi — {p.name} literal matn bo'lib ketardi.
                  const subject = encodeURIComponent(`Upgrade to ${p.name}`);
                  window.location.href = `mailto:sales@attribution.example?subject=${subject}`;
                }}
              >
                {isCurrent ? 'Current plan' : 'Contact us'}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
