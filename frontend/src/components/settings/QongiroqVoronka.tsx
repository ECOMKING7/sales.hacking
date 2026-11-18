/**
 * Qo'ng'iroq voronkasi → call kampaniya (046).
 *
 * NEGA KERAK: call maqsadidagi kampaniyaning lidlarida UTM ham, fbclid ham,
 * Meta Lead ID ham yo'q — ular hech qayerga bog'lanmasdi. Telefoniya esa
 * reklama raqamiga kelgan qo'ng'iroqqa kartochkani ALOHIDA voronkada
 * ochadi. Shu voronkada YARATILGAN lid = shu kampaniyadan kelgan qo'ng'iroq.
 *
 * ID TAXMIN QILINMAYDI (§3.5): voronkalar amoCRM'dan, kampaniyalar sync
 * qilingan jadvaldan o'qiladi; odam tanlaydi; server saqlashda yana
 * tekshiradi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PhoneCall, Plus, Trash2 } from 'lucide-react';
import { metaCapiApi, qongiroqApi, type QongiroqHolat } from '../../services/api';
import { Button, SkeletonText, cn, toast } from '../ui';
import { ErrorRow, LABEL, SELECT, errMsg } from './shared';
import { formatMoney } from '../../utils/format';

interface Qator {
  voronka: string;
  kampaniya: string;
}

function qatorlarga(xarita: Record<string, string>): Qator[] {
  const q = Object.entries(xarita).map(([voronka, kampaniya]) => ({ voronka, kampaniya }));
  return q.length ? q : [{ voronka: '', kampaniya: '' }];
}

export default function QongiroqVoronka() {
  const [data, setData] = useState<QongiroqHolat | null>(null);
  const [qatorlar, setQatorlar] = useState<Qator[]>([{ voronka: '', kampaniya: '' }]);
  const [hodisaNomi, setHodisaNomi] = useState('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [testKod, setTestKod] = useState('');
  const [testNatija, setTestNatija] = useState<string>('');
  const [testlanmoqda, setTestlanmoqda] = useState(false);

  const yukla = useCallback(async () => {
    setYuklanmoqda(true);
    setXato('');
    try {
      const r = await qongiroqApi.holat();
      // Backend eski bo'lsa ham sahifa oq bo'lib qolmasin — bir joyda normallashtiramiz.
      const toza: QongiroqHolat = {
        ...r,
        xarita: r.xarita ?? {},
        voronkalar: r.voronkalar ?? [],
        kampaniyalar: r.kampaniyalar ?? [],
        sotuvJuftligi: r.sotuvJuftligi ?? {},
        valyuta: r.valyuta ?? 'UZS',
        statistika: r.statistika ?? {
          davr_kun: 30,
          lidlar: 0,
          reklamaga_boglangan: 0,
          sotuvlar: 0,
          daromad: 0,
          capi_ok: 0,
          capi_xato: 0,
        },
      };
      setData(toza);
      setQatorlar(qatorlarga(toza.xarita));
      setHodisaNomi(toza.capiEventCall ?? '');
    } catch (err) {
      setXato(errMsg(err, "Qo'ng'iroq sozlamasini o'qib bo'lmadi"));
    } finally {
      setYuklanmoqda(false);
    }
  }, []);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  const voronkaNomi = useMemo(() => {
    const m = new Map<string, string>();
    data?.voronkalar.forEach((v) => m.set(v.id, v.nom));
    return m;
  }, [data]);

  const takroriyVoronka = useMemo(() => {
    const korilgan = new Set<string>();
    for (const q of qatorlar) {
      if (!q.voronka) continue;
      if (korilgan.has(q.voronka)) return true;
      korilgan.add(q.voronka);
    }
    return false;
  }, [qatorlar]);

  const yarimTanlangan = qatorlar.some((q) => Boolean(q.voronka) !== Boolean(q.kampaniya));

  const ozgartir = (i: number, maydon: keyof Qator, qiymat: string) =>
    setQatorlar((eski) => eski.map((q, j) => (j === i ? { ...q, [maydon]: qiymat } : q)));

  const saqla = async () => {
    setSaqlanmoqda(true);
    setXato('');
    try {
      const xarita: Record<string, string> = {};
      qatorlar.forEach((q) => {
        if (q.voronka && q.kampaniya) xarita[q.voronka] = q.kampaniya;
      });
      await qongiroqApi.saqla({ xarita, capiEventCall: hodisaNomi.trim() || null });
      toast.ok("Qo'ng'iroq sozlamasi saqlandi");
      await yukla();
    } catch (err) {
      setXato(errMsg(err, 'Saqlanmadi'));
    } finally {
      setSaqlanmoqda(false);
    }
  };

  const sina = async () => {
    setTestlanmoqda(true);
    setTestNatija('');
    try {
      const r = await metaCapiApi.test(testKod.trim(), 'lead', 'qongiroq');
      setTestNatija(
        r.yuborildi
          ? `✓ Meta qabul qildi: «${r.event_name}» (phone_call). Events Manager → Test Events'da ko'ring.`
          : `✗ Meta rad etdi: ${r.javob}`
      );
    } catch (err) {
      setTestNatija(`✗ ${errMsg(err, 'Sinov yuborilmadi')}`);
    } finally {
      setTestlanmoqda(false);
    }
  };

  const s = data?.statistika;
  const sozlangan = data ? Object.keys(data.xarita).length > 0 : false;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="mb-1.5 flex items-center gap-2">
        <PhoneCall className="h-3.5 w-3.5 text-ink-3" />
        <span className={LABEL}>Qo'ng'iroq voronkasi → call kampaniya</span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-ink-3">
        Telefoniya reklama raqamiga kelgan qo'ng'iroqni alohida voronkada ochsa — shu
        voronkani call kampaniyaga biriktiring. Shu voronkada <b>yaratilgan</b> lid
        o'sha kampaniyaga yoziladi (keyin boshqa voronkaga ko'chirilsa ham). Kampaniya
        darajasida aniq; kampaniya ichidagi ad — taxminiy (o'sha kuni eng ko'p sarflagan
        ad). Lid Meta'ga <span className="font-mono">phone_call</span> bo'lib ketadi.{' '}
        <span className="text-ink-2">amoCRM'ga hech narsa yozilmaydi.</span>
      </p>

      {xato && <ErrorRow message={xato} onRetry={() => void yukla()} />}
      {yuklanmoqda && !data && <SkeletonText lines={3} />}

      {data && (
        <div className="flex flex-col gap-4">
          {data.voronkaXato && (
            <p className="text-xs text-bad">
              amoCRM voronkalarini o'qib bo'lmadi: {data.voronkaXato}
            </p>
          )}

          {data.kampaniyalar.length === 0 && (
            <p className="text-xs text-warn">
              Kampaniyalar hali sync qilinmagan — avval Facebook reklama akkauntini ulang.
            </p>
          )}

          {qatorlar.map((q, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <div className="min-w-0">
                <label className={LABEL} htmlFor={`qv-${i}`}>
                  amoCRM voronkasi
                </label>
                <select
                  id={`qv-${i}`}
                  className={SELECT}
                  value={q.voronka}
                  onChange={(e) => ozgartir(i, 'voronka', e.target.value)}
                  disabled={data.voronkalar.length === 0}
                >
                  <option value="">— tanlang —</option>
                  {data.voronkalar.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nom} ({v.id})
                    </option>
                  ))}
                  {/* Saqlangan, lekin amoCRM ro'yxatida yo'q (o'chirilgan) voronka */}
                  {q.voronka && !voronkaNomi.has(q.voronka) && (
                    <option value={q.voronka}>⚠ {q.voronka} — amoCRM'da topilmadi</option>
                  )}
                </select>
              </div>
              <div className="min-w-0">
                <label className={LABEL} htmlFor={`qk-${i}`}>
                  Call kampaniya
                </label>
                <select
                  id={`qk-${i}`}
                  className={SELECT}
                  value={q.kampaniya}
                  onChange={(e) => ozgartir(i, 'kampaniya', e.target.value)}
                  disabled={data.kampaniyalar.length === 0}
                >
                  <option value="">— tanlang —</option>
                  {data.kampaniyalar.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nom}
                      {k.holat ? ` · ${k.holat}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Qatorni o'chirish"
                  onClick={() =>
                    setQatorlar((eski) =>
                      eski.length > 1 ? eski.filter((_, j) => j !== i) : [{ voronka: '', kampaniya: '' }]
                    )
                  }
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  {''}
                </Button>
              </div>
              {q.voronka && data.xarita[q.voronka] && data.sotuvJuftligi[q.voronka] === false && (
                <p className="text-xs text-warn sm:col-span-3">
                  ⚠ «{voronkaNomi.get(q.voronka) ?? q.voronka}» voronkasining «sotildi» etapi sotuv
                  juftliklarida yo'q. Qo'ng'iroqlar shu voronkada sotilsa — ular sanalmaydi; yuqoridagi
                  «sotuv etaplari»ga qo'shing. Boshqa voronkada sotilsa — hammasi joyida.
                </p>
              )}
            </div>
          ))}

          <div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setQatorlar((eski) => [...eski, { voronka: '', kampaniya: '' }])}
            >
              Yana voronka
            </Button>
          </div>

          <div className="max-w-xs">
            <label className={LABEL} htmlFor="qv-hodisa">
              Meta'dagi hodisa nomi (ixtiyoriy)
            </label>
            <input
              id="qv-hodisa"
              className={SELECT}
              placeholder="Lead"
              value={hodisaNomi}
              onChange={(e) => setHodisaNomi(e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-3">
              Masalan <span className="font-mono">Contact</span> — shunda Ads Manager'da qo'ng'iroqlar
              forma lidlari bilan bitta ustunda aralashmaydi. Bo'sh — oddiy Lead.
            </p>
          </div>

          {(takroriyVoronka || yarimTanlangan) && (
            <p className="text-xs text-bad">
              {takroriyVoronka
                ? 'Bitta voronka ikki marta tanlangan.'
                : 'Har qatorda voronka va kampaniya ikkalasi ham tanlansin.'}
            </p>
          )}

          <div>
            <Button
              onClick={() => void saqla()}
              loading={saqlanmoqda}
              disabled={takroriyVoronka || yarimTanlangan || Boolean(data.voronkaXato)}
              className="sm:w-40"
            >
              Saqlash
            </Button>
          </div>

          {/* Natija — oxirgi 30 kun. Bo'sh bo'lsa: sozlanmagan yoki hali qo'ng'iroq kelmagan. */}
          {sozlangan && s && (
            <div className="rounded-md border-[1.5px] border-line bg-surface-2 px-3 py-2.5">
              <p className="mb-1.5 text-xs font-semibold text-ink-2">
                Oxirgi {s.davr_kun} kun — qo'ng'iroq lidlari
              </p>
              {s.lidlar === 0 ? (
                <p className="text-xs text-ink-3">
                  Hali qo'ng'iroq lidi yo'q. Sozlamadan keyin kelgan YANGI lidlar hisoblanadi —
                  eski lidlar qayta belgilanmaydi.
                </p>
              ) : (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs tabular-nums sm:grid-cols-3">
                  <div>
                    <dt className="text-ink-3">Lidlar</dt>
                    <dd className="font-medium text-ink">{s.lidlar}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Reklamaga bog'langan</dt>
                    <dd
                      className={cn(
                        'font-medium',
                        s.reklamaga_boglangan === s.lidlar ? 'text-ok' : 'text-warn'
                      )}
                    >
                      {s.reklamaga_boglangan} / {s.lidlar}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Sotuvlar</dt>
                    <dd className="font-medium text-ink">{s.sotuvlar}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Daromad</dt>
                    <dd className="font-medium text-ink">{formatMoney(s.daromad, data.valyuta)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">CAPI yuborildi</dt>
                    <dd className="font-medium text-ok">{s.capi_ok}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">CAPI xato</dt>
                    <dd className={cn('font-medium', s.capi_xato ? 'text-bad' : 'text-ink')}>
                      {s.capi_xato}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          )}

          {/* Sinov — Events Manager > Test Events kodi bilan, statistikaga tushmaydi */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <label className={LABEL} htmlFor="qv-test">
                Test Events kodi
              </label>
              <input
                id="qv-test"
                className={SELECT}
                placeholder="TEST12345"
                value={testKod}
                onChange={(e) => setTestKod(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={testlanmoqda}
              disabled={testKod.trim().length < 4}
              onClick={() => void sina()}
            >
              Qo'ng'iroqni sinash
            </Button>
          </div>
          {testNatija && (
            <p
              className={cn(
                'text-xs',
                testNatija.startsWith('✓') ? 'text-ok' : 'text-bad'
              )}
            >
              {testNatija}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
