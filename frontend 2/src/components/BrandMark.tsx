/* ═══════════════════════════════════════════════════════════════
   BrandMark — logoning jonli varianti.

     .bm-tile — shaffof konteyner (fon yo'q)
     .bm-mark — oq chiziqlar (public/mark-mask.png niqob), sekin aylanadi
     .bm-glow — kvadrat ortidagi rangli nur, yonib-o'chib turadi

   prefers-reduced-motion yoqilgan bo'lsa — harakat to'xtaydi,
   nur o'rtacha yorqinlikda qoladi.
   ═══════════════════════════════════════════════════════════════ */

interface Props {
  /** Kvadrat tomoni, px. */
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
      <span className="bm-glow" />
      <span className="bm-tile">
        <span className="bm-mark" />
      </span>
    </span>
  );
}
