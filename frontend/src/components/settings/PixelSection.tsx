import { useState } from 'react';
import { Check, Code2, Copy } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Button, Card, CardHeader, toast } from '../ui';

export default function PixelSection() {
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
      toast.ok('Nusxalandi');
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

