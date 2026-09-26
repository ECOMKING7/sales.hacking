/**
 * HUQUQIY SAHIFALAR UCHUN UMUMIY QOBIQ.
 *
 * ⚠ BU SAHIFALAR OCHIQ — login talab qilinmaydi va qilinmasligi SHART.
 * Meta, amoCRM va Bitrix24 tekshiruvchilari ularni akkauntsiz ochadi.
 * Agar URL login sahifasiga yo'naltirsa — review rad etiladi.
 *
 * Shuning uchun `App.tsx` da bu yo'llar `ProtectedRoute` dan TASHQARIDA
 * turadi. Ularni Layout ichiga ko'chirish — review'ni buzish demak.
 */
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { HUQUQIY, huquqiyQator } from '../../config/huquqiy';
import ThemeToggle from '../../components/ThemeToggle';

interface Props {
  sarlavha: string;
  /** Sarlavha ostidagi bir qator — sahifa nima haqida. */
  izoh: string;
  children: ReactNode;
}

export default function LegalLayout({ sarlavha, izoh, children }: Props) {
  /**
   * ⚠ BRAUZER SARLAVHASI SAHIFAGA MOS BO'LSIN.
   *
   * `index.html` da yagona `<title>` turadi va SPA uni o'zgartirmaydi.
   * Natijada maxfiylik sahifasi ochilganda ham eski sarlavha ko'rinadi.
   * Meta tekshiruvchisi URL va sarlavhani birga skrinshot qiladi —
   * ikkalasi mos kelmasa savol tug'iladi.
   *
   * react-helmet qo'shilmadi: bitta `useEffect` yetarli bo'lganda
   * kutubxona qo'shish — ortiqcha bog'liqlik.
   */
  useEffect(() => {
    const eski = document.title;
    document.title = `${sarlavha} — ${HUQUQIY.mahsulot}`;
    return () => {
      document.title = eski;
    };
  }, [sarlavha]);

  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b-[1.5px] border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            {HUQUQIY.mahsulot}
          </Link>
          <ThemeToggle variant="inline" />
        </div>
      </header>

      {/* max-w-3xl — o'qiladigan qator uzunligi. Huquqiy matn uzun,
          keng ustunda ko'z qatorni yo'qotadi. */}
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-ink">{sarlavha}</h1>
        <p className="mt-2 text-sm text-ink-2">{izoh}</p>
        <p className="mt-1 text-xs text-ink-3">
          Oxirgi yangilanish: {HUQUQIY.yangilandi}
        </p>

        <div className="mt-8 space-y-8">{children}</div>

        <footer className="mt-12 border-t-[1.5px] border-line pt-6 text-xs text-ink-3">
          <p>{huquqiyQator()}</p>
          <p className="mt-1">
            Savollar:{' '}
            <a href={`mailto:${HUQUQIY.email}`} className="text-accent hover:underline">
              {HUQUQIY.email}
            </a>
          </p>
          <nav className="mt-3 flex flex-wrap gap-4">
            <Link to="/privacy" className="hover:text-ink">
              Maxfiylik siyosati
            </Link>
            <Link to="/terms" className="hover:text-ink">
              Foydalanish shartlari
            </Link>
            <Link to="/data-deletion" className="hover:text-ink">
              Ma'lumotlarni o'chirish
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

/**
 * Bo'lim — uchala sahifada bir xil ko'rinish.
 * `raqam` berilmasa raqamsiz chiqadi (kirish bo'limlari uchun).
 */
export function Bolim({
  raqam,
  nom,
  children,
}: {
  raqam?: number;
  nom: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink">
        {raqam !== undefined && <span className="mr-2 text-ink-3">{raqam}.</span>}
        {nom}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}
