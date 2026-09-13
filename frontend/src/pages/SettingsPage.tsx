import { useEffect, useState, useCallback } from 'react';
import { Megaphone, Database, Code2, Check, Copy, ExternalLink } from 'lucide-react';
import { facebookApi, amocrmApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { FbStatus, AdAccount, AmocrmStatus, Pipeline } from '../types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  SkeletonText,
  cn,
} from '../components/ui';

function errMsg(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
  );
}

/** Ulanish holati — CardHeader'ning action joyida turadi. */
function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge tone="ok" dot>
      Ulangan
    </Badge>
  ) : (
    <Badge tone="neutral">Ulanmagan</Badge>
  );
}

/** Xato + qayta urinish. Har bo'lim shu bitta naqshdan foydalanadi. */
function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <p className="text-sm text-bad">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}

const LABEL = 'mb-1.5 block text-xs font-semibold text-ink-2';
const SELECT = cn(
  'h-10 w-full rounded-sm border-[1.5px] border-line-2 bg-surface px-3 text-sm text-ink',
  'transition-[box-shadow,border-color] duration-200 disabled:cursor-not-allowed disabled:opacity-50'
);

// ---------- Facebook ----------
function FacebookSection() {
  const [status, setStatus] = useState<FbStatus | null>(null);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await facebookApi.status();
      setStatus(s);
      setSelected(s.adAccountId ?? '');
      if (s.connected) {
        try {
          const { adAccounts } = await facebookApi.adAccounts();
          setAdAccounts(adAccounts);
        } catch {
          /* ad accounts need a live FB token */
        }
      }
    } catch (err) {
      setError(errMsg(err, 'Failed to load Facebook status'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    try {
      const { url } = await facebookApi.connect();
      window.open(url, '_blank', 'width=600,height=700');
    } catch (err) {
      setError(errMsg(err, 'Failed to start Facebook connect'));
    }
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await facebookApi.selectAdAccount(selected);
      await load();
    } catch (err) {
      setError(errMsg(err, 'Failed to select ad account'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg">
      <CardHeader
        title="Facebook Ads"
        description="Ad spend and delivery metrics."
        icon={<Megaphone className="h-5 w-5" />}
        action={<ConnectionBadge connected={Boolean(status?.connected)} />}
      />

      {error && <ErrorRow message={error} onRetry={() => void load()} />}

      {loading ? (
        <SkeletonText lines={3} />
      ) : status?.connected ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-ink-2">Ad account</dt>
            <dd className="font-medium tabular-nums text-ink">{status.adAccountId ?? '—'}</dd>
            <dt className="text-ink-2">Token expires</dt>
            <dd className="font-medium tabular-nums text-ink">
              {status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '—'}
            </dd>
          </dl>

          <div>
            <label htmlFor="fb-ad-account" className={LABEL}>
              Select ad account
            </label>
            <div className="flex gap-2">
              <select
                id="fb-ad-account"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className={cn(SELECT, 'flex-1')}
              >
                <option value="">— choose —</option>
                {adAccounts.map((a) => (
                  <option key={a.id} value={a.accountId || a.id}>
                    {a.name} ({a.accountId || a.id})
                  </option>
                ))}
              </select>
              <Button onClick={save} loading={busy} disabled={!selected}>
                Save
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={connect}
            icon={<ExternalLink className="h-4 w-4" />}
          >
            Reconnect Facebook
          </Button>
        </div>
      ) : (
        <EmptyState
          icon={<Megaphone />}
          title="Facebook Ads ulanmagan"
          hint="xarajat yo'q · ROAS hisoblanmaydi"
          action={
            <Button
              variant="secondary"
              onClick={connect}
              icon={<Megaphone className="h-4 w-4" />}
              iconRight={<ExternalLink className="h-4 w-4" />}
            >
              Connect Facebook Ads
            </Button>
          }
        />
      )}
    </Card>
  );
}

// ---------- AmoCRM ----------
function AmocrmSection() {
  const [status, setStatus] = useState<AmocrmStatus | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState('');
  const [wonStageId, setWonStageId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await amocrmApi.status();
      setStatus(s);
      setPipelineId(s.pipelineId ?? '');
      setWonStageId(s.wonStageId ?? '');
      if (s.connected) {
        try {
          const { pipelines } = await amocrmApi.pipelines();
          setPipelines(pipelines);
        } catch {
          /* pipelines need a live amoCRM token */
        }
      }
    } catch (err) {
      setError(errMsg(err, 'Failed to load amoCRM status'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    try {
      const { url } = await amocrmApi.connect();
      window.open(url, '_blank', 'width=600,height=700');
    } catch (err) {
      setError(errMsg(err, 'Failed to start amoCRM connect'));
    }
  };

  const save = async () => {
    if (!pipelineId || !wonStageId) return;
    setBusy(true);
    try {
      await amocrmApi.savePipeline(pipelineId, wonStageId);
      await load();
    } catch (err) {
      setError(errMsg(err, 'Failed to save pipeline'));
    } finally {
      setBusy(false);
    }
  };

  const stages = pipelines.find((p) => String(p.id) === pipelineId)?.statuses ?? [];

  return (
    <Card padding="lg">
      <CardHeader
        title="amoCRM"
        description={
          status?.connected && status.domain
            ? status.domain
            : 'Leads, pipeline stages and won deals.'
        }
        icon={<Database className="h-5 w-5" />}
        action={<ConnectionBadge connected={Boolean(status?.connected)} />}
      />

      {error && <ErrorRow message={error} onRetry={() => void load()} />}

      {loading ? (
        <SkeletonText lines={3} />
      ) : status?.connected ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="amo-pipeline" className={LABEL}>
                Pipeline
              </label>
              <select
                id="amo-pipeline"
                value={pipelineId}
                onChange={(e) => {
                  setPipelineId(e.target.value);
                  setWonStageId('');
                }}
                className={SELECT}
              >
                <option value="">— choose —</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="amo-won-stage" className={LABEL}>
                Won stage
              </label>
              <select
                id="amo-won-stage"
                value={wonStageId}
                onChange={(e) => setWonStageId(e.target.value)}
                className={SELECT}
              >
                <option value="">— choose —</option>
                {stages.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button onClick={save} loading={busy} disabled={!pipelineId || !wonStageId}>
            Save
          </Button>
        </div>
      ) : (
        <EmptyState
          icon={<Database />}
          title="amoCRM ulanmagan"
          hint="lid yo'q · daromad atribusiya qilinmaydi"
          action={
            <Button
              variant="secondary"
              onClick={connect}
              icon={<Database className="h-4 w-4" />}
              iconRight={<ExternalLink className="h-4 w-4" />}
            >
              Connect amoCRM
            </Button>
          }
        />
      )}
    </Card>
  );
}

// ---------- Pixel ----------
function PixelSection() {
  const workspace = useAuthStore((s) => s.workspace);
  const [copied, setCopied] = useState(false);
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const snippet = `<script async src="${apiUrl}/api/pixel/script.js?workspaceId=${
    workspace?.id ?? 'WORKSPACE_ID'
  }"></script>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <Card padding="lg">
      <CardHeader
        title="Pixel Code"
        description="fbclid → conversion zanjirini saytda ushlab turadi."
        icon={<Code2 className="h-5 w-5" />}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={copy}
            icon={
              copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />
            }
          >
            {copied ? 'Nusxalandi' : 'Nusxalash'}
          </Button>
        }
      />

      <p className="mb-3 text-sm text-ink-2">
        Paste this snippet just before the closing <code>&lt;/head&gt;</code> tag on every page
        of your website. It captures <code>fbclid</code> and sends tracking events automatically.
      </p>

      <pre className="overflow-x-auto rounded-sm border-[1.5px] border-line bg-surface-2 p-3 font-mono text-xs text-ink">
        {snippet}
      </pre>

      <p className="mt-3 text-sm text-ink-2">
        To track conversions, call:{' '}
        <code className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">
          window.AttributionPixel.track('purchase', {'{ value: 99, currency: "USD" }'})
        </code>
      </p>
    </Card>
  );
}

export default function SettingsPage() {
  const params = new URLSearchParams(window.location.search);
  const justConnected = params.get('fb') === 'connected' || params.get('amocrm') === 'connected';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-2">
          Connect your data sources and tracking pixel.
        </p>
      </div>

      {justConnected && (
        <div className="rounded-md border-[1.5px] border-ok/30 bg-ok/12 px-4 py-3 text-sm text-ok">
          Connection successful.
        </div>
      )}

      <FacebookSection />
      <AmocrmSection />
      <PixelSection />
    </div>
  );
}
