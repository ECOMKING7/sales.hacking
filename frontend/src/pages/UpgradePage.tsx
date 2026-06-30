import { useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { workspaceApi } from '../services/api';

const PLANS = [
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
    <Check className="mx-auto h-4 w-4 text-green-600" />
  ) : (
    <X className="mx-auto h-4 w-4 text-gray-300" />
  );
}

export default function UpgradePage() {
  const usage = useQuery({ queryKey: ['usage'], queryFn: workspaceApi.usage });
  const current = usage.data?.plan;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Plans &amp; Pricing</h1>
        <p className="text-sm text-gray-500">
          {current ? (
            <>
              You're on the <span className="font-medium capitalize">{current}</span> plan.
            </>
          ) : (
            'Choose the plan that fits your team.'
          )}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={`rounded-2xl border bg-white p-6 shadow-sm ${
              p.highlight ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{p.name}</h2>
              {current === p.id && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  Current
                </span>
              )}
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900">{p.price}</p>
            <ul className="mt-5 space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> {p.features.adAccounts}</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> {p.features.leads}</li>
              <li className="flex items-center gap-2"><Cell on={p.features.export} /> CSV export</li>
              <li className="flex items-center gap-2"><Cell on={p.features.whiteLabel} /> White-label</li>
            </ul>
            <a
              href="mailto:sales@attribution.example?subject=Upgrade%20to%20{p.name}"
              className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-semibold ${
                p.highlight
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              } ${current === p.id ? 'pointer-events-none opacity-50' : ''}`}
            >
              {current === p.id ? 'Current plan' : 'Contact us'}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
