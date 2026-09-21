/**
 * Sozlamalar sahifasi — faqat tartib.
 *
 * Har bo'lim o'z faylida: `components/settings/`. Ilgari hammasi
 * shu faylda edi va u 1149 qatorga yetgandi. Bo'limlar bir-biriga
 * bog'liq emas (Facebook, amoCRM, Meta CAPI, piksel), lekin bitta
 * faylda turgani uchun bittasiga tegish qolganlarini ham xavf ostiga
 * qo'yardi — va fayl ichida kerakli joyni topish uzoq vaqt olardi.
 */
import FacebookSection from '../components/settings/FacebookSection';
import AmocrmSection from '../components/settings/AmocrmSection';
import MetaCapiSection from '../components/settings/MetaCapiSection';
import LeadAdsSection from '../components/settings/LeadAdsSection';
import PixelSection from '../components/settings/PixelSection';

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
      <LeadAdsSection />
      <MetaCapiSection />
      <PixelSection />
    </div>
  );
}
