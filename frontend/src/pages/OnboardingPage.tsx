import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Check,
  Database,
  ExternalLink,
  LineChart,
  Megaphone,
  Target,
  Zap,
} from 'lucide-react';
import { facebookApi, amocrmApi } from '../services/api';
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, cn } from '../components/ui';

const SELECT_CLASS =
  'h-10 w-full rounded-sm border-[1.5px] border-line-2 bg-surface px-3 text-sm text-ink';
const FIELD_LABEL = 'mb-1.5 block text-xs font-semibold text-ink-2';

function Steps({ step }: { step: number }) {
  return (
    <div className="mb-7 flex items-center justify-center gap-2">
      {[1, 2, 3].map((s) => (
        <span
          key={s}
          aria-current={s === step ? 'step' : undefined}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-sm border-[1.5px]',
            'font-mono text-xs tabular-nums transition-[box-shadow,border-color] duration-200',
            s < step && 'border-ok/30 bg-ok/12 text-ok',
            s === step && 'border-edge bg-tint text-accent shadow-glow-xs',
            s > step && 'border-line text-ink-3'
          )}
        >
          {s < step ? <Check className="h-4 w-4" /> : s}
        </span>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  // OAuth oynasi yopilib, fokus shu tabga qaytganda ulanish holatini qayta o'qiymiz.
  // Deps sifatida `fb`/`crm` obyektlari ISHLATILMAYDI — ular har renderda yangi,
  // ya'ni listener har renderda qayta o'rnatilardi. queryClient esa barqaror havola.
  useEffect(() => {
    const onFocus = () => {
      queryClient.invalidateQueries({ queryKey: ['onb-fb'] });
      queryClient.invalidateQueries({ queryKey: ['onb-crm'] });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [queryClient]);

  const openOAuth = async (which: 'fb' | 'crm') => {
    const { url } = which === 'fb' ? await facebookApi.connect() : await amocrmApi.connect();
    window.open(url, '_blank', 'width=600,height=700');
  };

  const finish = async () => {
    if (pipelineId && wonStageId) {
      try {
        // Onboarding'da faqat bitta voronka tanlanadi; juftlik shundan
        // yasaladi. Boshqa voronkalardagi sotuv etaplari keyin
        // Settings'da qo'shiladi.
        await amocrmApi.savePipeline({
          pipelineId,
          wonStageId,
          wonPairs: [`${pipelineId}:${wonStageId}`],
        });
      } catch {
        /* allow finishing even if save fails */
      }
    }
    navigate('/dashboard');
  };

  const stages =
    pipelines.data?.pipelines.find((p) => String(p.id) === pipelineId)?.statuses ?? [];

  const adAccounts = fbAccounts.data?.adAccounts ?? [];
  const pipelineList = pipelines.data?.pipelines ?? [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-md border-[1.5px] border-edge bg-tint text-accent shadow-glow-sm"
          >
            <BarChart3 className="h-6 w-6" />
          </span>
        </div>

        <Steps step={step} />

        {step === 1 && (
          <Card padding="lg">
            <div className="text-center">
              <h1 className="text-xl font-bold text-ink">Welcome to Attribution</h1>
              <p className="mt-1 text-sm text-ink-2">Know which ads actually drive revenue.</p>
            </div>

            <ul className="mt-6 space-y-3 text-left">
              {[
                { icon: Target, text: 'Connect Facebook Ads to pull campaign spend & performance.' },
                { icon: LineChart, text: 'Sync your CRM so closed deals map back to the ad that won them.' },
                { icon: Zap, text: 'See true ROAS, CAC and revenue by source — multi-touch attribution.' },
              ].map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-sm border-[1.5px] border-edge bg-tint text-accent"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm text-ink-2">{text}</span>
                </li>
              ))}
            </ul>

            <Button className="mt-8" variant="primary" fullWidth onClick={() => setStep(2)}>
              Get Started
            </Button>
          </Card>
        )}

        {step === 2 && (
          <Card padding="lg">
            <CardHeader
              icon={<Megaphone className="h-5 w-5" />}
              title="Connect Facebook Ads"
              description="We'll import your campaigns and spend."
            />

            {fb.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : fb.isError ? (
              <div className="space-y-3">
                <p className="text-sm text-bad">Could not check the Facebook connection.</p>
                <Button variant="secondary" size="sm" onClick={() => fb.refetch()}>
                  Retry
                </Button>
              </div>
            ) : fb.data?.connected ? (
              <div className="space-y-4">
                <Badge tone="ok" dot>
                  Facebook connected
                </Badge>

                <div>
                  <label htmlFor="onb-ad-account" className={FIELD_LABEL}>
                    Ad account
                  </label>

                  {fbAccounts.isLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : fbAccounts.isError ? (
                    <div className="space-y-3">
                      <p className="text-sm text-bad">Could not load ad accounts.</p>
                      <Button variant="secondary" size="sm" onClick={() => fbAccounts.refetch()}>
                        Retry
                      </Button>
                    </div>
                  ) : adAccounts.length === 0 ? (
                    <EmptyState
                      icon={<Megaphone />}
                      title="No ad accounts found"
                      hint="xarajat yo'q · ROAS hisoblanmaydi"
                      action={
                        <Button variant="secondary" size="sm" onClick={() => fbAccounts.refetch()}>
                          Refresh
                        </Button>
                      }
                    />
                  ) : (
                    <select
                      id="onb-ad-account"
                      value={adAccount}
                      onChange={(e) => setAdAccount(e.target.value)}
                      className={SELECT_CLASS}
                    >
                      <option value="">— choose —</option>
                      {adAccounts.map((a) => (
                        <option key={a.id} value={a.accountId || a.id}>
                          {a.name} ({a.accountId || a.id})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <Button
                  variant="primary"
                  fullWidth
                  onClick={async () => {
                    if (adAccount) await facebookApi.selectAdAccount(adAccount);
                    setStep(3);
                  }}
                >
                  Continue
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<Megaphone className="h-4 w-4" />}
                  iconRight={<ExternalLink className="h-4 w-4" />}
                  onClick={() => openOAuth('fb')}
                >
                  Connect Facebook Ads
                </Button>
                <Button variant="ghost" fullWidth onClick={() => fb.refetch()}>
                  I've connected — refresh
                </Button>
                <Button variant="ghost" fullWidth size="sm" onClick={() => setStep(3)}>
                  Skip for now
                </Button>
              </div>
            )}
          </Card>
        )}

        {step === 3 && (
          <Card padding="lg">
            <CardHeader
              icon={<Database className="h-5 w-5" />}
              title="Connect amoCRM"
              description="Map your won deals back to ads."
            />

            {crm.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : crm.isError ? (
              <div className="space-y-3">
                <p className="text-sm text-bad">Could not check the amoCRM connection.</p>
                <Button variant="secondary" size="sm" onClick={() => crm.refetch()}>
                  Retry
                </Button>
              </div>
            ) : crm.data?.connected ? (
              <div className="space-y-4">
                <Badge tone="ok" dot>
                  amoCRM connected
                </Badge>

                {pipelines.isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : pipelines.isError ? (
                  <div className="space-y-3">
                    <p className="text-sm text-bad">Could not load pipelines.</p>
                    <Button variant="secondary" size="sm" onClick={() => pipelines.refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : pipelineList.length === 0 ? (
                  <EmptyState
                    icon={<Database />}
                    title="No pipelines found"
                    hint="sotuv etapi yo'q · atribusiya yopilmaydi"
                    action={
                      <Button variant="secondary" size="sm" onClick={() => pipelines.refetch()}>
                        Refresh
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <div>
                      <label htmlFor="onb-pipeline" className={FIELD_LABEL}>
                        Pipeline
                      </label>
                      <select
                        id="onb-pipeline"
                        value={pipelineId}
                        onChange={(e) => {
                          setPipelineId(e.target.value);
                          setWonStageId('');
                        }}
                        className={SELECT_CLASS}
                      >
                        <option value="">— choose —</option>
                        {pipelineList.map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="onb-won-stage" className={FIELD_LABEL}>
                        Won stage
                      </label>
                      <select
                        id="onb-won-stage"
                        value={wonStageId}
                        onChange={(e) => setWonStageId(e.target.value)}
                        className={SELECT_CLASS}
                      >
                        <option value="">— choose —</option>
                        {stages.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <Button variant="primary" fullWidth onClick={finish}>
                  Finish Setup
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<Database className="h-4 w-4" />}
                  iconRight={<ExternalLink className="h-4 w-4" />}
                  onClick={() => openOAuth('crm')}
                >
                  Connect amoCRM
                </Button>
                <Button variant="ghost" fullWidth onClick={() => crm.refetch()}>
                  I've connected — refresh
                </Button>
                <Button variant="ghost" fullWidth size="sm" onClick={finish}>
                  Finish later
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
