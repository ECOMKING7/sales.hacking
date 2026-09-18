/**
 * Meta Lead ID maydonini tanlash.
 *
 * NEGA KERAK: Meta'ga CRM hodisasi yuborilganda "bu qaysi odam?" degan
 * savolga javob kerak. Eng kuchli javob — Meta Lead ID (15–17 xonali
 * son), u lid reklamasi (Instant Form) orqali kelgan lidda bo'ladi.
 * U bilan moslik piksel ham, UTM ham bo'lmasa ishlaydi.
 *
 * NEGA TANLOV ODAMDA: maydon nomi har CRM'da boshqacha — "Facebook
 * Lead ID", "lead_id", "Идентификатор лида", o'zbekcha nom. Server
 * nomga emas, QIYMAT SHAKLIGA qarab nomzod topadi va ko'rsatadi;
 * tanlashni odam qiladi. Kod hech qachon o'zi taxmin qilmaydi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { amocrmApi } from '../../services/api';
import type { FieldReport, FieldRow } from '../../types';
import { Button, SkeletonText, cn } from '../ui';
import { ErrorRow, LABEL, SELECT, errMsg } from './shared';

function foiz(qism: number, jami: number): string {
  if (!jami) return '—';
  return `${Math.round((qism / jami) * 100)}%`;
}

/** Maydon qatorini ro'yxatda qanday atash. */
function yorliq(f: FieldRow): string {
  const ishonch = f.toldirilgan > 0 ? ` — ${f.ishonch}% mos, ${f.toldirilgan} ta lidda` : ' — bo\'sh';
  return `${f.field_name}${ishonch}`;
}

export default function LeadIdField() {
  const [data, setData] = useState<FieldReport | null>(null);
  const [tanlov, setTanlov] = useState<string>('');
  const [liniyaMaydoni, setLiniyaMaydoni] = useState<string>('');
  const [reklamaLiniyalari, setReklamaLiniyalari] = useState<string[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [saqlandi, setSaqlandi] = useState(false);

  const yukla = useCallback(async () => {
    setYuklanmoqda(true);
    setXato('');
    try {
      const r = await amocrmApi.fields();
      /**
       * FRONTEND VA BACKEND ALOHIDA DEPLOY BO'LADI (ikkita Vercel
       * loyihasi). Frontend tezroq chiqib ketsa, u backend hali
       * yubormayotgan maydonni o'qiydi va `undefined.join()` butun
       * sahifani oq qilib qo'yadi — aynan shu bo'ldi.
       *
       * Shuning uchun javob BIR JOYDA normallashtiriladi: har yangi
       * maydonga xavfsiz sukut. Komponent ichida `?.` tarqatib yurish
       * emas — u bitta joyda unutiladi va xato takrorlanadi.
       */
      setData({
        ...r,
        voronkalar: r.voronkalar ?? [],
        nomzodlar: r.nomzodlar ?? [],
        maydonlar: r.maydonlar ?? [],
        kontaktNomzodlari: r.kontaktNomzodlari ?? [],
        liniyaNomzodlari: r.liniyaNomzodlari ?? [],
        reklamaLiniyalari: r.reklamaLiniyalari ?? [],
        nomdaTopildi: r.nomdaTopildi ?? 0,
        nomNoyob: r.nomNoyob ?? 0,
        nomNamunalar: r.nomNamunalar ?? [],
        tegdaTopildi: r.tegdaTopildi ?? 0,
        tegNoyob: r.tegNoyob ?? 0,
        tegNamunalar: r.tegNamunalar ?? [],
        atribusiya: r.atribusiya ?? {
          utm_term: 0,
          utm_campaign: 0,
          utm_content: 0,
          utm_source: 0,
          fbclid: 0,
        },
      });
      setTanlov(r.tanlangan ?? '');
      setLiniyaMaydoni(r.liniyaMaydoni ?? '');
      setReklamaLiniyalari(r.reklamaLiniyalari ?? []);
    } catch (err) {
      setXato(errMsg(err, 'Maydonlarni o\'qib bo\'lmadi'));
    } finally {
      setYuklanmoqda(false);
    }
  }, []);

  // Sahifa ochilganda avtomatik yuklanmaydi: bu amoCRM'ga ikkita
  // so'rov, ya'ni limitdan yeydi. Faqat tugma bosilganda.
  useEffect(() => {
    setSaqlandi(false);
  }, [tanlov, liniyaMaydoni, reklamaLiniyalari]);

  const saqla = async () => {
    setSaqlanmoqda(true);
    setXato('');
    try {
      await amocrmApi.saveLeadIdField({
        fieldId: tanlov || null,
        lineField: liniyaMaydoni || null,
        adLines: reklamaLiniyalari,
      });
      setSaqlandi(true);
    } catch (err) {
      setXato(errMsg(err, 'Saqlanmadi'));
    } finally {
      setSaqlanmoqda(false);
    }
  };

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className={LABEL}>4-qadam · Meta Lead ID maydoni (ixtiyoriy)</span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-ink-3">
        Meta'ga «bu lid sifatli bo'ldi / sotuvga aylandi» degan signalni
        yuborishda eng kuchli moslik kaliti — Meta Lead ID. Lid reklamasi
        (Instant Form) orqali kelgan lidlarda u amoCRM maydonida turadi.
        Tugma amoCRM'dagi oxirgi lidlarni o'qib, qaysi maydon shu qiymatni
        saqlayotganini topadi. <span className="text-ink-2">amoCRM'ga hech narsa yozilmaydi.</span>
      </p>

      {xato && <ErrorRow message={xato} onRetry={() => void yukla()} />}

      {!data && !yuklanmoqda && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void yukla()}
          icon={<Search className="h-3.5 w-3.5" />}
        >
          Maydonlarni tekshirish
        </Button>
      )}

      {yuklanmoqda && <SkeletonText lines={3} />}

      {data && (
        <div className="flex flex-col gap-4">
          {/* Voronka kesimi. O'rtachalash xulosani buzadi: hajmi katta
              voronka namunani to'ldirib, boshqasini ko'rinmas qiladi. */}
          <div className="overflow-x-auto rounded-md border-[1.5px] border-line bg-surface-2">
            <table className="w-full min-w-[440px] text-xs tabular-nums">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="px-3 py-2 text-left font-semibold">Voronka</th>
                  <th className="px-3 py-2 text-right font-semibold">Namuna</th>
                  <th className="px-3 py-2 text-right font-semibold">Avtomatik</th>
                  <th className="px-3 py-2 text-right font-semibold">UTM</th>
                  <th className="px-3 py-2 text-right font-semibold">fbclid</th>
                  <th className="px-3 py-2 text-right font-semibold">Lead ID</th>
                </tr>
              </thead>
              <tbody>
                {data.voronkalar.map((v) => (
                  <tr key={v.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 text-ink-2">{v.nom}</td>
                    <td className="px-3 py-2 text-right text-ink-3">{v.jami}</td>
                    <td className="px-3 py-2 text-right text-ink-3">
                      {foiz(v.avtomatik, v.jami)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-medium',
                        v.utm_term ? 'text-ok' : 'text-bad'
                      )}
                    >
                      {foiz(v.utm_term, v.jami)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-medium',
                        v.fbclid ? 'text-ok' : 'text-bad'
                      )}
                    >
                      {foiz(v.fbclid, v.jami)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-medium',
                        v.leadIdTopildi ? 'text-ok' : 'text-bad'
                      )}
                    >
                      {foiz(v.leadIdTopildi, v.jami)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs leading-relaxed text-ink-3">
            «Avtomatik» — lidni integratsiya yaratgan (odam emas). Lid formasi yoki
            telefoniya ulangan voronkada bu ko'rsatkich yuqori bo'ladi. «Lead ID» —
            maydon, lid nomi yoki kontakt maydonida Meta Lead ID shakli topilgan
            lidlar ulushi. Jami {data.tekshirilganLid} ta lid tekshirildi.
          </p>

          {/* ⚠ 15–17 xonali son Meta Lead ID bo'lishi SHART EMAS: forma ID si,
              kampaniya ID si va ad ID si ham aynan shu uzunlikda. Farq —
              takrorlanishida. Buni ko'rsatmasdan tanlash noto'g'ri
              identifikatorni Meta'ga yuborish demak. */}
          {(data.nomdaTopildi > 0 || data.tegdaTopildi > 0) && (
            <div className="rounded-md border-[1.5px] border-line bg-surface-2 px-3 py-2.5">
              <p className="mb-1.5 text-xs font-semibold text-ink-2">
                Maydon emas, matn ichida topildi — tekshirish kerak
              </p>
              {data.nomdaTopildi > 0 && (
                <p className="text-xs leading-relaxed text-ink-3">
                  <span className="text-ink-2">Lid nomida:</span> {data.nomdaTopildi} ta
                  lidda, shundan <span className="font-medium">{data.nomNoyob} ta noyob</span>.
                  Misol: <span className="font-mono">{data.nomNamunalar.join(', ') || '—'}</span>
                </p>
              )}
              {data.tegdaTopildi > 0 && (
                <p className="mt-1 text-xs leading-relaxed text-ink-3">
                  <span className="text-ink-2">Tegda:</span> {data.tegdaTopildi} ta lidda,
                  shundan <span className="font-medium">{data.tegNoyob} ta noyob</span>.
                  Misol: <span className="font-mono">{data.tegNamunalar.join(', ') || '—'}</span>
                </p>
              )}
              <p
                className={cn(
                  'mt-2 text-xs leading-relaxed',
                  data.nomNoyob > data.nomdaTopildi * 0.9 ? 'text-ok' : 'text-bad'
                )}
              >
                {data.nomNoyob > data.nomdaTopildi * 0.9
                  ? 'Deyarli har lidda boshqa qiymat — bu Meta Lead ID ga o\'xshaydi.'
                  : 'Qiymatlar TAKRORLANMOQDA — bu Lead ID emas, ehtimol forma yoki reklama ID si. Facebook\'da 15–17 xonali bo\'ladigan narsalar: lead ID, forma ID, kampaniya ID, ad ID, ad account ID. Faqat lead ID har lidda boshqa bo\'ladi.'}
              </p>
            </div>
          )}

          {data.atribusiya.utm_term === 0 && data.atribusiya.fbclid === 0 && (
            <p className="text-xs leading-relaxed text-bad">
              Hech bir voronkada UTM ham, fbclid ham yo'q. Ya'ni reklama havolalariga
              UTM qo'yilmagan — bu holatda reklama kesimidagi atribusiya ishlamaydi.
              Meta Lead ID bu muammoni CAPI tomonida chetlab o'tadi, lekin
              dashboard'dagi «qaysi reklama» ustuni baribir bo'sh qoladi.
            </p>
          )}

          {data.kontaktNomzodlari.length > 0 && (
            <p className="text-xs leading-relaxed text-ok">
              Kontakt maydonlarida ham nomzod bor:{' '}
              {data.kontaktNomzodlari.map((f) => f.field_name).join(', ')}. Hozircha
              faqat LID maydoni sozlanadi — kerak bo'lsa kontakt maydonini ham
              o'qiydigan qilamiz.
            </p>
          )}

          <div>
            <label className={LABEL} htmlFor="lead-id-field">
              Qaysi maydon Meta Lead ID ni saqlaydi
            </label>
            <select
              id="lead-id-field"
              className={SELECT}
              value={tanlov}
              onChange={(e) => setTanlov(e.target.value)}
            >
              <option value="">Sozlanmagan</option>
              {data.nomzodlar.length > 0 && (
                <optgroup label="Nomzodlar (qiymat shakli mos keladi)">
                  {data.nomzodlar.map((f) => (
                    <option key={f.field_id} value={f.field_id}>
                      {yorliq(f)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Barcha maydonlar">
                {data.maydonlar.map((f) => (
                  <option key={f.field_id} value={f.field_id}>
                    {yorliq(f)}
                  </option>
                ))}
              </optgroup>
            </select>

            {data.nomzodlar.length === 0 && (
              <p className="mt-2 text-xs leading-relaxed text-ink-3">
                Nomzod topilmadi — tekshirilgan {data.tekshirilganLid} ta lidning
                hech birida 15–17 xonali son saqlaydigan maydon yo'q. Agar lidlar
                lid formasi orqali kelayotgan bo'lsa, integratsiya Meta Lead ID ni
                umuman uzatmayapti — buni amoCRM–Facebook integratsiyasi
                sozlamalaridan tekshirish kerak. Qo'ng'iroq voronkasida esa u
                bo'lmaydi: telefoniya faqat raqamni biladi. Bunday holatda moslik
                telefon va email orqali ketadi.
              </p>
            )}

            {tanlov && (
              <p className="mt-2 font-mono text-xs text-ink-3">
                Namuna:{' '}
                {data.maydonlar.find((f) => f.field_id === tanlov)?.namunalar?.join(', ') ||
                  'qiymat topilmadi'}
              </p>
            )}
          </div>

          {/* Qo'ng'iroq liniyasi. Facebook call reklamasida hech qanday
              identifikator bermaydi — yagona belgi shu: odam QAYSI
              raqamga qo'ng'iroq qildi. Reklama raqamidan kelmagan
              qo'ng'iroq organik, va uni reklama hisobiga yozish CAC ni
              aslidan yaxshiroq ko'rsatadi. */}
          <div className="border-t border-line pt-4">
            <label className={LABEL} htmlFor="line-field">
              Qo'ng'iroq liniyasi maydoni (call reklamasi uchun)
            </label>
            <p className="mb-2 text-xs leading-relaxed text-ink-3">
              Telefoniya "qayerga qo'ng'iroq qilindi" raqamini yozadigan maydon.
              Nomzodlar shakl bo'yicha topiladi: qiymat telefonga o'xshaydi, lekin
              kam xil bo'ladi (mijoz raqami har lidda boshqa, liniya takrorlanadi).
            </p>
            <select
              id="line-field"
              className={SELECT}
              value={liniyaMaydoni}
              onChange={(e) => {
                setLiniyaMaydoni(e.target.value);
                setReklamaLiniyalari([]);
              }}
            >
              <option value="">Sozlanmagan</option>
              {data.liniyaNomzodlari.map((f) => (
                <option key={f.field_id} value={f.field_id}>
                  {f.field_name} — {f.noyob} xil raqam, {f.toldirilgan} ta lidda
                </option>
              ))}
            </select>

            {data.liniyaNomzodlari.length === 0 && (
              <p className="mt-2 text-xs leading-relaxed text-ink-3">
                Liniya nomzodi topilmadi — telefoniya integratsiyasi "qayerga
                qo'ng'iroq qilindi" raqamini alohida maydonga yozmayapti. U holda
                reklama qo'ng'irog'ini organikdan ajratib bo'lmaydi.
              </p>
            )}

            {liniyaMaydoni && (
              <div className="mt-3">
                <span className={LABEL}>Qaysi raqamlar reklama uchun</span>
                <div className="flex flex-col gap-1.5">
                  {(
                    data.liniyaNomzodlari.find((f) => f.field_id === liniyaMaydoni)
                      ?.noyobQiymatlar ?? []
                  ).map((raqam) => (
                    <label
                      key={raqam}
                      className="flex items-center gap-2 text-xs text-ink-2"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-[var(--halo)]"
                        checked={reklamaLiniyalari.includes(raqam)}
                        onChange={(e) =>
                          setReklamaLiniyalari((oldingi) =>
                            e.target.checked
                              ? [...oldingi, raqam]
                              : oldingi.filter((x) => x !== raqam)
                          )
                        }
                      />
                      <span className="font-mono tabular-nums">{raqam}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-3">
                  Hech biri belgilanmasa filtr qo'llanmaydi — hamma qo'ng'iroq
                  reklama deb hisoblanadi (bugungi holat). Bu ataylab: filtrni
                  yoqish ongli qadam bo'lishi kerak.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" loading={saqlanmoqda} onClick={() => void saqla()}>
              Sozlamani saqlash
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void yukla()}>
              Qayta tekshirish
            </Button>
            {saqlandi && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-ok">
                <Check className="h-3.5 w-3.5" />
                Saqlandi
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
