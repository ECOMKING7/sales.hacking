/* ═══════════════════════════════════════════════════════════════
   BrandMark — logoning jonli varianti.

     .bm-mark — gradient chiziqlar (public/mark-mask.png niqob),
                fon yo'q, sekin aylanadi

   prefers-reduced-motion yoqilgan bo'lsa — aylanish to'xtaydi.
   ═══════════════════════════════════════════════════════════════ */

interface Props {
  /** Belgi o'lchami, px. */
  size?: number;
  className?: string;
}

export default function BrandMark({ size = 64, className = '' }: Props) {
  return (
    <span
      role="img"
      aria-label="Sales Hacking"
      className={`bm-wrap ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="bm-mark" />
    </span>
  );
}
