import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import ThemeToggle from '../components/ThemeToggle';
import { Button, Card } from '../components/ui';
import { amocrmApi } from '../services/api';
import { HUQUQIY } from '../config/huquqiy';
import { useAuthStore } from '../store/authStore';
import {
  claimError,
  clearClaim,
  isFinalError,
  readClaim,
  saveClaim,
  type SavedClaim,
} from '../utils/amoClaim';

/* ═══════════════════════════════════════════════════════════════
   /amocrm/install — amoMarket'dan o'rnatilgandan keyingi sahifa.

   Loginsiz ochiladi (ProtectedRoute'dan tashqarida).
     • Kalit URL'dan darhol olib tashlanadi (tarix, loglar, Referer).
     • Kirmagan bo'lsa — kirish/ro'yxatdan o'tish; keyin PendingAmoClaim
       shu sahifaga qaytaradi.
     • Kirgan bo'lsa — QAYSI amoCRM QAYSI workspace'ga ulanishini
       ko'rsatadi va faqat tugma bosilganda biriktiradi.
   ═══════════════════════════════════════════════════════════════ */

type Holat = 'tayyor' | 'ulanmoqda' | 'ulandi' | 'xato' | 'kirish_kerak';

const SERVER_XATO: Record<string, string> = {
  not_configured: 'The integration is not configured on our side yet. Please contact support.',
  exchange_failed:
    'amoCRM did not confirm the installation. Open the integration in amoCRM and install it again.',
};

/** Birinchi renderda: URL'dan o'qiydi, saqlaydi va URL'ni tozalaydi. */
function boshlangich(): { saved: SavedClaim | null; serverError: string | null } {
  const params = new URLSearchParams(window.location.search);
  const serverError = params.get('error');
  const claim = params.get('claim');
  let saved: SavedClaim | null = null;

  if (claim) {
    saved = { claim, domain: params.get('domain') };
    saveClaim(saved);
  } else {
    saved = readClaim();
  }

  if (claim || serverError) {
    // Kalit brauzer tarixida va keyingi so'rovlarning Referer'ida qolmasin.
    window.history.replaceState(null, '', window.location.pathname);
  }
  return { saved, serverError };
}

export default function AmoInstallPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const workspaceName = useAuthStore((s) => s.workspace?.name ?? null);

  const [{ saved, serverError }] = useState(boshlangich);
  const [holat, setHolat] = useState<Holat>(() => {
    if (serverError || !saved) return 'xato';
    return isAuthenticated ? 'tayyor' : 'kirish_kerak';
  });
  const [xato, setXato] = useState(() =>
    serverError
      ? SERVER_XATO[serverError] ?? SERVER_XATO.exchange_failed
      : !saved
        ? 'Installation link is missing or expired. Open the integration in amoCRM and install it again.'
        : ''
  );

  // Sahifa ochiq turganda tizimga kirilsa (boshqa tabda) — holatni yangilaymiz.
  useEffect(() => {
    if (holat === 'kirish_kerak' && isAuthenticated) setHolat('tayyor');
  }, [holat, isAuthenticated]);

  const ulash = async () => {
    if (!saved || holat === 'ulanmoqda') return;
    setHolat('ulanmoqda');
    setXato('');
    try {
      await amocrmApi.claimInstall(saved.claim);
      clearClaim();
      setHolat('ulandi');
      setTimeout(() => navigate('/settings?amocrm=connected', { replace: true }), 1200);
    } catch (err) {
      // Kalit yaroqsiz bo'lsa — o'chiramiz; tarmoq xatosida qayta urinish mumkin.
      if (isFinalError(err)) clearClaim();
      setXato(claimError(err));
      setHolat(isFinalError(err) ? 'xato' : 'tayyor');
    }
  };

  const bekor = () => {
    clearClaim();
    navigate(isAuthenticated ? '/dashboard' : '/login', { replace: true });
  };

  const domain = saved?.domain ?? null;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-ground px-4">
      <ThemeToggle variant="inline" className="absolute right-4 top-4" />
      <Card padding="lg" className="w-full max-w-sm text-center">
        <div className="mb-6 flex flex-col items-center">
          <BrandMark size={56} className="mb-5 mt-2" />
          <h1 className="text-xl font-bold text-ink">
            {holat === 'ulandi' ? 'amoCRM connected' : 'Connect amoCRM'}
          </h1>
          {domain && <p className="mt-1 text-sm text-ink-2">{domain}</p>}
        </div>

        {(holat === 'tayyor' || holat === 'ulanmoqda') && (
          <>
            <p className="mb-5 text-sm text-ink-2">
              Connect <b className="text-ink">{domain ?? 'this amoCRM account'}</b> to workspace{' '}
              <b className="text-ink">{workspaceName ?? 'current'}</b>?
            </p>
            {xato && (
              <p role="alert" className="mb-4 text-sm text-bad">
                {xato} If it keeps failing, write to{' '}
                <a className="underline" href={`mailto:${HUQUQIY.email}`}>
                  {HUQUQIY.email}
                </a>
                .
              </p>
            )}
            <div className="space-y-2">
              <Button fullWidth loading={holat === 'ulanmoqda'} onClick={ulash}>
                Connect
              </Button>
              <Button
                variant="ghost"
                fullWidth
                disabled={holat === 'ulanmoqda'}
                onClick={bekor}
              >
                Cancel
              </Button>
            </div>
          </>
        )}

        {holat === 'ulandi' && (
          <p className="text-sm text-ink-2" aria-live="polite">
            Done. Opening settings…
          </p>
        )}

        {holat === 'kirish_kerak' && (
          <>
            <p className="mb-5 text-sm text-ink-2">
              The integration is installed. Sign in or create a McQueen AI account to finish
              connecting amoCRM.
            </p>
            <div className="space-y-2">
              <Link to="/register" className="block">
                <Button fullWidth>Create account</Button>
              </Link>
              <Link to="/login" className="block">
                <Button variant="secondary" fullWidth>
                  Sign in
                </Button>
              </Link>
            </div>
          </>
        )}

        {holat === 'xato' && (
          <>
            <p role="alert" className="mb-3 text-sm text-bad">
              {xato}
            </p>
            <p className="mb-5 text-xs text-ink-3">
              Need help? Write to{' '}
              <a className="underline" href={`mailto:${HUQUQIY.email}`}>
                {HUQUQIY.email}
              </a>
            </p>
            <Link to={isAuthenticated ? '/settings' : '/login'} className="block">
              <Button variant="secondary" fullWidth>
                {isAuthenticated ? 'Go to settings' : 'Sign in'}
              </Button>
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
