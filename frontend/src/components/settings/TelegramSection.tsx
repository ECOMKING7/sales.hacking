/**
 * TELEGRAM — hisobot va sotuv xabari
 *
 * IKKI ISH:
 *   1. Tanlangan vaqtda hisobot. Metrikalarni HAR CHAT o'zi tanlaydi —
 *      direktorga ROAS, targetologga CPM kerak.
 *   2. Sotuv bo'lgan zahoti xabar: qaysi kampaniya, guruh, reklama,
 *      qancha summa.
 *
 * ⚠ BU YERDA TOKEN MAYDONI YO'Q va bo'lmaydi. Bot bitta, tokeni
 * serverning `.env` ida (`TELEGRAM_BOT_TOKEN`) — §4.1. Ekranda faqat
 * "sozlangan / sozlanmagan" ko'rinadi.
 *
 * Ulanish kodi — VAQTINCHALIK PAROL: uni bilgan odam shu akkauntning
 * sotuv summalarini o'z telegramiga ulaydi. Shuning uchun 15 daqiqa
 * yashaydi va bir marta ishlaydi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { telegramApi } from '../../services/api';
import type { TelegramChat, TelegramHolat } from '../../types';
import { Badge, Button, Card, CardHeader, SkeletonText, cn, toast } from '../ui';
import { CardFooterRow, ErrorRow, LABEL, SELECT, errMsg } from './shared';

/** 30 daqiqalik qadamlar — cron shundan tez kelmaydi (pastdagi izohga qarang). */
const VAQTLAR = Array.from({ length: 48 }, (_, i) => {
  const s = String(Math.floor(i / 2)).padStart(2, '0');
  const d = i % 2 === 0 ? '00' : '30';
  return `${s}:${d}`;
});

const DAVR_NOMI: Record<string, string> = {
  kecha: 'Kecha',
  bugun: 'Bugun',
  '7kun': "So'nggi 7 kun",
};

const TAFSILOT_NOMI: Record<string, string> = {
  yoq: "Faqat umumiy raqamlar",
  kampaniya: 'Top kampaniyalar',
  reklama: 'Top reklamalar',
};

/** 'HH:MM:SS' -> 'HH:MM'. Bazadan vaqt sekundlar bilan keladi. */
function vaqtQisqa(v: string | null): string {
  return v ? v.slice(0, 5) : '';
}

export default function TelegramSection() {
  const [holat, setHolat] = useState<TelegramHolat | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kod, setKod] = useState<{ kod: string; havola: string | null; guruh: string } | null>(
    null
  );
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setHolat(await telegramApi.status());
    } catch (err) {
      setError(errMsg(err, 'Telegram holati yuklanmadi'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kodOl = async () => {
    setBusy(true);
    setXabar(null);
    try {
      const k = await telegramApi.kod();
      setKod({ kod: k.kod, havola: k.havola, guruh: k.guruhUchun });
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, 'Kod olinmadi') });
    } finally {
      setBusy(false);
    }
  };

  const webhookUla = async () => {
    setBusy(true);
    setXabar(null);
    try {
      const n = await telegramApi.webhook();
      setXabar({
        ok: n.ok,
        matn: n.ok ? `Bot ulandi: ${n.manzil}` : (n.xato ?? 'Ulanmadi'),
      });
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, 'Bot ulanmadi') });
    } finally {
      setBusy(false);
    }
  };

  const yangila = async (id: string, patch: Partial<TelegramChat>) => {
    // Optimistik: tanlov darhol ko'rinsin, so'rov fonda ketsin.
    setHolat((h) =>
      h
        ? { ...h, chatlar: h.chatlar.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
        : h
    );
    try {
      const yangi = await telegramApi.yangila(id, patch);
      setHolat((h) =>
        h ? { ...h, chatlar: h.chatlar.map((c) => (c.id === id ? yangi : c)) } : h
      );
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, 'Saqlanmadi') });
      await load(); // serverdagi haqiqiy holatga qaytamiz
    }
  };

  const sinovYubor = async (id: string) => {
    setBusy(true);
    setXabar(null);
    try {
      const n = await telegramApi.sinov(id);
      setXabar({
        ok: n.success,
        matn: n.success ? 'Hisobot yuborildi — telegramni tekshiring.' : (n.xato ?? 'Yuborilmadi'),
      });
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, 'Sinov yuborilmadi') });
    } finally {
      setBusy(false);
    }
  };

  const chatOchir = async (id: string, nom: string | null) => {
    if (!window.confirm(`"${nom ?? 'chat'}" bilan bog'lanish uzilsinmi?`)) return;
    try {
      await telegramApi.ochir(id);
      toast.ok("Bog'lanish uzildi");
      await load();
    } catch (err) {
      setXabar({ ok: false, matn: errMsg(err, "O'chirilmadi") });
    }
  };

  const webhookBor = Boolean(holat?.webhook.manzil);
  const chatlar = holat?.chatlar ?? [];
  const faollar = useMemo(() => chatlar.filter((c) => c.faol).length, [chatlar]);

  return (
    <Card>
      <CardHeader
        icon={<Send className="h-4 w-4" />}
        title="Telegram — hisobot va sotuv xabari"
        description="Rejali hisobot + sotuv bo'lgan zahoti darhol xabar"
        action={
          !holat?.botSozlangan ? (
            <Badge tone="neutral">Bot yo'q</Badge>
          ) : faollar > 0 ? (
            <Badge tone="ok" dot>
              {faollar} ta chat
            </Badge>
          ) : (
            <Badge tone="neutral">Chat ulanmagan</Badge>
          )
        }
      />

      {loading ? (
        <SkeletonText lines={3} />
      ) : error ? (
        <ErrorRow message={error} onRetry={() => void load()} />
      ) : !holat?.botSozlangan ? (
        <div className="rounded-sm border-[1.5px] border-line-2 bg-surface-2 px-3 py-3 text-xs text-ink-2">
          <p className="mb-2 font-semibold text-ink">Bot hali sozlanmagan.</p>
          <p className="mb-1">
            1. Telegramda <span className="text-ink">@BotFather</span> ga{' '}
            <code>/newbot</code> yozing va bot yarating.
          </p>
          <p className="mb-1">
            2. BotFather bergan tokenni serverning muhit o'zgaruvchisiga qo'ying:{' '}
            <code>TELEGRAM_BOT_TOKEN</code>.
          </p>
          <p className="mb-1">3. Serverni qayta deploy qiling va shu sahifani yangilang.</p>
          <p className="mt-2">
            Token bu yerga kiritilmaydi va hech qachon bazaga tushmaydi.
          </p>
        </div>
      ) : (
        <>
          {!webhookBor && (
            <div className="mb-4 rounded-sm border-[1.5px] border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              Bot Telegram'ga ulanmagan — `/start` buyrug'i ishlamaydi. "Botni ulash" ni
              bosing.
            </div>
          )}

          {holat.webhook.oxirgiXato && (
            <p className="mb-4 rounded-sm border-[1.5px] border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">
              Telegram oxirgi xatosi: {holat.webhook.oxirgiXato}
            </p>
          )}

          {kod && (
            <div className="mb-4 rounded-sm border-[1.5px] border-ok/30 bg-ok/10 px-3 py-3 text-xs text-ink">
              <p className="mb-2">
                Kod: <span className="font-bold tracking-widest">{kod.kod}</span>{' '}
                <span className="text-ink-2">(15 daqiqa)</span>
              </p>
              {kod.havola && (
                <p className="mb-1">
                  Shaxsiy chat:{' '}
                  <a
                    className="underline"
                    href={kod.havola}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {kod.havola}
                  </a>
                </p>
              )}
              <p className="text-ink-2">
                Guruhga: botni guruhga qo'shing va guruhda <code>{kod.guruh}</code> deb
                yozing.
              </p>
            </div>
          )}

          {xabar && (
            <p
              className={cn(
                'mb-4 rounded-sm border-[1.5px] px-3 py-2 text-xs',
                xabar.ok
                  ? 'border-ok/30 bg-ok/10 text-ok'
                  : 'border-bad/30 bg-bad/10 text-bad'
              )}
            >
              {xabar.matn}
            </p>
          )}

          {chatlar.length === 0 ? (
            <p className="mb-4 text-sm text-ink-2">
              Hali bitta ham chat ulanmagan. "Kod olish" ni bosing va botga yuboring.
            </p>
          ) : (
            <div className="mb-4 space-y-4">
              {chatlar.map((c) => (
                <ChatKartasi
                  key={c.id}
                  chat={c}
                  metrikalar={holat.metrikalar}
                  davrlar={holat.davrlar}
                  tafsilotlar={holat.tafsilotlar}
                  busy={busy}
                  onYangila={(p) => void yangila(c.id, p)}
                  onSinov={() => void sinovYubor(c.id)}
                  onOchir={() => void chatOchir(c.id, c.nom)}
                />
              ))}
            </div>
          )}

          <CardFooterRow>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void kodOl()} disabled={busy}>
                {busy ? 'Kutilyapti…' : 'Kod olish'}
              </Button>
              <Button variant="secondary" onClick={() => void webhookUla()} disabled={busy}>
                Botni ulash
              </Button>
              <span className="text-xs text-ink-2">
                Hisobot 30 daqiqalik aniqlikda keladi — cron shu oraliqda ishlaydi.
              </span>
            </div>
          </CardFooterRow>
        </>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   BITTA CHAT
   ═══════════════════════════════════════════════════════════════════════ */

function ChatKartasi({
  chat,
  metrikalar,
  davrlar,
  tafsilotlar,
  busy,
  onYangila,
  onSinov,
  onOchir,
}: {
  chat: TelegramChat;
  metrikalar: Array<{ kalit: string; yorliq: string }>;
  davrlar: string[];
  tafsilotlar: string[];
  busy: boolean;
  onYangila: (p: Partial<TelegramChat>) => void;
  onSinov: () => void;
  onOchir: () => void;
}) {
  const tanlangan = new Set(chat.metrikalar);

  const metrikaBos = (kalit: string) => {
    const yangi = new Set(tanlangan);
    if (yangi.has(kalit)) yangi.delete(kalit);
    else yangi.add(kalit);
    // Bo'sh ro'yxat serverda standartga qaytadi — bu yerda ham
    // hech bo'lmasa bittasi qolishini talab qilmaymiz.
    onYangila({ metrikalar: [...yangi] });
  };

  return (
    <div className="rounded-sm border-[1.5px] border-line-2 bg-surface-2 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {chat.nom ?? chat.chat_id}
          </p>
          <p className="text-xs text-ink-2">
            {chat.tur === 'private' ? 'shaxsiy' : (chat.tur ?? 'chat')} · {chat.chat_id}
          </p>
        </div>
        {!chat.faol && <Badge tone="bad">To'xtatilgan</Badge>}
      </div>

      {chat.oxirgi_xato && (
        <p className="mb-3 rounded-sm border-[1.5px] border-bad/30 bg-bad/10 px-2 py-1.5 text-xs text-bad">
          {chat.oxirgi_xato}
        </p>
      )}

      {/* ── 2-ish: sotuv xabari ── */}
      <label className="mb-3 flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={chat.sotuv_xabari}
          onChange={(e) => onYangila({ sotuv_xabari: e.target.checked })}
        />
        <span>
          Sotuv bo'lganda darhol xabar
          <span className="block text-xs text-ink-2">
            Kampaniya, reklama guruhi, reklama nomi va summa bilan
          </span>
        </span>
      </label>

      {/* ── 1-ish: rejali hisobot ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL}>Hisobot vaqti</label>
          <select
            className={SELECT}
            value={vaqtQisqa(chat.hisobot_vaqti)}
            onChange={(e) =>
              onYangila({ hisobot_vaqti: e.target.value ? `${e.target.value}:00` : null })
            }
          >
            <option value="">O'chirilgan</option>
            {VAQTLAR.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-2">{chat.vaqt_zonasi}</p>
        </div>

        <div>
          <label className={LABEL}>Davr</label>
          <select
            className={SELECT}
            value={chat.hisobot_davri}
            onChange={(e) => onYangila({ hisobot_davri: e.target.value })}
          >
            {davrlar.map((d) => (
              <option key={d} value={d}>
                {DAVR_NOMI[d] ?? d}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL}>Tafsilot</label>
          <select
            className={SELECT}
            value={chat.tafsilot}
            onChange={(e) => onYangila({ tafsilot: e.target.value })}
          >
            {tafsilotlar.map((t) => (
              <option key={t} value={t}>
                {TAFSILOT_NOMI[t] ?? t}
              </option>
            ))}
          </select>
          {chat.tafsilot !== 'yoq' && (
            <p className="mt-1 text-xs text-ink-2">Eng ko'p sarflagan {chat.tafsilot_soni} ta</p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <label className={LABEL}>Qaysi metrikalar yuborilsin</label>
        <div className="flex flex-wrap gap-1.5">
          {metrikalar.map((m) => {
            const bor = tanlangan.has(m.kalit);
            return (
              <button
                key={m.kalit}
                type="button"
                onClick={() => metrikaBos(m.kalit)}
                className={cn(
                  'rounded-sm border-[1.5px] px-2 py-1 text-xs transition-colors',
                  bor
                    ? 'border-accent/40 bg-accent/15 text-accent'
                    : 'border-line-2 bg-surface text-ink-2 hover:text-ink'
                )}
              >
                {m.yorliq}
              </button>
            );
          })}
        </div>
        {chat.metrikalar.length === 0 && (
          <p className="mt-1 text-xs text-ink-2">
            Hech biri tanlanmagan — standart to'plam yuboriladi.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onSinov} disabled={busy}>
          Sinov hisoboti
        </Button>
        {!chat.faol && (
          <Button variant="secondary" size="sm" onClick={() => onYangila({ faol: true })}>
            Qayta yoqish
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onOchir}>
          Uzish
        </Button>
        {chat.oxirgi_yuborildi && (
          <span className="text-xs text-ink-2">
            Oxirgi: {new Date(chat.oxirgi_yuborildi).toLocaleString('uz-UZ')}
          </span>
        )}
      </div>
    </div>
  );
}
