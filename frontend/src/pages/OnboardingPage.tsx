import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Check, ExternalLink, Target, LineChart, Zap } from 'lucide-react';
import { facebookApi, amocrmApi } from '../services/api';

function StepDots({ step }: { step: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {[1, 2, 3].map((s) => (
        <span
          key={s}
          className={`h-2 rounded-full transition-all ${
            s === step ? 'w-8 bg-indigo-600' : s < step ? 'w-2 bg-indigo-300' : 'w-2 bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [adAccount, setAdAccount] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [wonStageId, setWonStageId] = useState('');

  const fb = useQuery({ queryKey: ['onb-fb'], queryFn: facebookApi.status, enabled: step === 2 });
  const fbAccounts = useQuery({
    queryKey: ['onb-fb-accounts'],
    queryFn: facebookApi.adAccounts,
    enabled: step === 2 && Boolean(fb.data?.connected),
  });
  const crm = useQuery({ queryKey: ['onb-crm'], queryFn: amocrmApi.status, enabled: step === 3 });
  const pipelines = useQuery({
    queryKey: ['onb-pipelines'],
    queryFn: amocrmApi.pipelines,
    enabled: step === 3 && Boolean(crm.data?.connected),
  });

  // Re-check connection when the OAuth popup returns focus to this tab.
  useEffect(() => {
    const onFocus = () => {
      fb.refetch();
      crm.refetch();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fb, crm]);

  const openOAuth = async (which: 'fb' | 'crm') => {
    const { url } = which === 'fb' ? await facebookApi.connect() : await amocrmApi.connect();
    window.open(url, '_blank', 'width=600,height=700');
  };

  const finish = async () => {
    if (pipelineId && wonStageId) {
      try {
        await amocrmApi.savePipeline(pipelineId, wonStageId);
      } catch {
        /* allow finishing even if save fails */
      }
    }
    navigate('/dashboard');
  };

  const stages =
    pipelines.data?.pipelines.find((p) => String(p.id) === pipelineId)?.statuses ?? [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
        </div>
        <StepDots step={step} />

        {step === 1 && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Welcome to Attribution</h1>
            <p className="mt-1 text-sm text-gray-500">Know which ads actually drive revenue.</p>
            <ul className="mt-6 space-y-3 text-left">
              {[
                { icon: Target, text: 'Connect Facebook Ads to pull campaign spend & performance.' },
                { icon: LineChart, text: 'Sync your CRM so closed deals map back to the ad that won them.' },
                { icon: Zap, text: 'See true ROAS, CAC and revenue by source — multi-touch attribution.' },
              ].map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm text-gray-700">{text}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setStep(2)}
              className="mt-8 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900">Connect Facebook Ads</h2>
            <p className="mt-1 text-sm text-gray-500">We'll import your campaigns and spend.</p>

            {fb.data?.connected ? (
              <div className="mt-6 space-y-4">
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <Check className="h-4 w-4" /> Facebook connected
                </p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Ad account</label>
                  <select
                    value={adAccount}
                    onChange={(e) => setAdAccount(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— choose —</option>
                    {(fbAccounts.data?.adAccounts ?? []).map((a) => (
                      <option key={a.id} value={a.accountId || a.id}>
                        {a.name} ({a.accountId || a.id})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={async () => {
                    if (adAccount) await facebookApi.selectAdAccount(adAccount);
                    setStep(3);
                  }}
                  className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Continue
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => openOAuth('fb')}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1877F2] py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Connect Facebook Ads <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  onClick={() => fb.refetch()}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  I've connected — refresh
                </button>
                <button onClick={() => setStep(3)} className="w-full text-sm text-gray-400 hover:text-gray-600">
                  Skip for now
                </button>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900">Connect amoCRM</h2>
            <p className="mt-1 text-sm text-gray-500">Map your won deals back to ads.</p>

            {crm.data?.connected ? (
              <div className="mt-6 space-y-4">
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <Check className="h-4 w-4" /> amoCRM connected
                </p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Pipeline</label>
                  <select
                    value={pipelineId}
                    onChange={(e) => {
                      setPipelineId(e.target.value);
                      setWonStageId('');
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— choose —</option>
                    {(pipelines.data?.pipelines ?? []).map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Won stage</label>
                  <select
                    value={wonStageId}
                    onChange={(e) => setWonStageId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— choose —</option>
                    {stages.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={finish}
                  className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Finish Setup
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => openOAuth('crm')}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  Connect amoCRM <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  onClick={() => crm.refetch()}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  I've connected — refresh
                </button>
                <button onClick={finish} className="w-full text-sm text-gray-400 hover:text-gray-600">
                  Finish later
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
