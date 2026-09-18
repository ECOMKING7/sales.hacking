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
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [saqlandi, setSaqlandi] = useState(false);

  const yukla = useCallback(async () => {
    setYuklanmoqda(true);
    setXato('');
    try {
      const r = await amocrmApi.fields();
      setData(r);
      setTanlov(r.tanlangan ?? '');
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
  }, [tanlov]);

  const saqla = async () => {
    setSaqlanmoqda(true);
    setXato('');
    try {
      await amocrmApi.saveLeadIdField(tanlov || null);
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
          {/* Atribusiya diagnostikasi — "nega hech narsa bog'lanmayapti"
              savoliga raqam bilan javob. */}
          <div className="rounded-md border-[1.5px] border-line bg-surface-2 px-3 py-2.5">
            <p className="mb-1.5 text-xs font-semibold text-ink-2">
              Oxirgi {data.tekshirilganLid} ta lidda atribusiya kalitlari
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-ink-3">
              <span>
                utm_term:{' '}
                <span className={cn('font-medium', data.atribusiya.utm_term ? 'text-ok' : 'text-bad')}>
                  {foiz(data.atribusiya.utm_term, data.tekshirilganLid)}
                </span>
              </span>
              <span>
                utm_campaign:{' '}
                <span className="font-medium text-ink-2">
                  {foiz(data.atribusiya.utm_campaign, data.tekshirilganLid)}
                </span>
              </span>
              <span>
                fbclid:{' '}
                <span className={cn('font-medium', data.atribusiya.fbclid ? 'text-ok' : 'text-bad')}>
                  {foiz(data.atribusiya.fbclid, data.tekshirilganLid)}
                </span>
              </span>
            </div>
            {data.atribusiya.utm_term === 0 && data.atribusiya.fbclid === 0 && (
              <p className="mt-2 text-xs leading-relaxed text-bad">
                Hech bir lidda UTM ham, fbclid ham yo'q. Ya'ni reklama havolalariga
                UTM qo'yilmagan — bu holatda reklama kesimidagi atribusiya ishlamaydi.
                Meta Lead ID bu muammoni CAPI tomonida chetlab o'tadi, lekin
                dashboard'dagi «qaysi reklama» ustuni baribir bo'sh qoladi.
              </p>
            )}
          </div>

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
                Nomzod topilmadi — oxirgi {data.tekshirilganLid} ta lidning hech
                birida 15–17 xonali son saqlaydigan maydon yo'q. Ehtimol lidlar
                lid reklamasi orqali kelmaydi (masalan qo'ng'iroq yoki qo'lda
                kiritish). Bunday holatda moslik telefon va email orqali ketadi.
              </p>
            )}

            {tanlov && (
              <p className="mt-2 font-mono text-xs text-ink-3">
                Namuna:{' '}
                {data.maydonlar.find((f) => f.field_id === tanlov)?.namunalar.join(', ') ||
                  'qiymat topilmadi'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" loading={saqlanmoqda} onClick={() => void saqla()}>
              Maydonni saqlash
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
