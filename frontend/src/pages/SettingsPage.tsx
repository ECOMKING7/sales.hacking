import { useEffect, useState, useCallback } from 'react';
import { Megaphone, Database, Code2, Check, Copy, ExternalLink } from 'lucide-react';
import { facebookApi, amocrmApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { FbStatus, AdAccount, AmocrmStatus, Pipeline } from '../types';

function errMsg(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
          {icon}
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ---------- Facebook ----------
function FacebookSection() {
  const [status, setStatus] = useState<FbStatus | null>(null);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
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
    <Card icon={<Megaphone className="h-5 w-5" />} title="Facebook Ads">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {status?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <Check className="h-4 w-4" /> Connected
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">Ad account</dt>
            <dd className="text-gray-900">{status.adAccountId ?? '—'}</dd>
            <dt className="text-gray-500">Token expires</dt>
            <dd className="text-gray-900">
              {status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '—'}
            </dd>
          </dl>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Select ad account
            </label>
            <div className="flex gap-2">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— choose —</option>
                {adAccounts.map((a) => (
                  <option key={a.id} value={a.accountId || a.id}>
                    {a.name} ({a.accountId || a.id})
                  </option>
                ))}
              </select>
              <button
                onClick={save}
                disabled={busy || !selected}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={connect}
          className="flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          <Megaphone className="h-4 w-4" /> Connect Facebook Ads
          <ExternalLink className="h-4 w-4" />
        </button>
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

  const load = useCallback(async () => {
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
    <Card icon={<Database className="h-5 w-5" />} title="amoCRM">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {status?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <Check className="h-4 w-4" /> Connected{status.domain ? ` · ${status.domain}` : ''}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
                {pipelines.map((p) => (
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
          </div>
          <button
            onClick={save}
            disabled={busy || !pipelineId || !wonStageId}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Connect amoCRM
          <ExternalLink className="h-4 w-4" />
        </button>
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
    <Card icon={<Code2 className="h-5 w-5" />} title="Pixel Code">
      <p className="mb-3 text-sm text-gray-600">
        Paste this snippet just before the closing <code>&lt;/head&gt;</code> tag on every page
        of your website. It captures <code>fbclid</code> and sends tracking events automatically.
      </p>
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
          {snippet}
        </pre>
        <button
          onClick={copy}
          className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-gray-700 px-2.5 py-1 text-xs text-white hover:bg-gray-600"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-3 text-sm text-gray-600">
        To track conversions, call:{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
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
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Connect your data sources and tracking pixel.</p>
      </div>
      {justConnected && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Connection successful.
        </div>
      )}
      <FacebookSection />
      <AmocrmSection />
      <PixelSection />
    </div>
  );
}
