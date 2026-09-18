/**
 * HALO orbi — brend belgisi.
 *
 * Uchta rang, uchta rol:
 *   edge  (havorang)  — asos, tinch turadi
 *   tint  (och ko'k)  — hajm beradi
 *   halo  (binafsha)  — uchinchi rang, YONIB-O'CHADI
 *
 * Nega faqat bittasi yonadi: hammasi bir vaqtda pulslasa ekran
 * miltillaydi va ko'z qayerga qarashni bilmaydi. Bitta element
 * harakatlanadi, qolgani fon bo'lib turadi.
 *
 * Harakat `prefers-reduced-motion` da to'liq o'chadi — bu sozlamani
 * odatda vestibulyar sezgirligi bor odam yoqadi, unga pulslash
 * jismonan noqulaylik beradi.
 *
 * Ranglar tokens.css dan keladi; bu yerda hex yozilmagan.
 */

interface Props {
  /** Diametr, px. Favicon o'lchamida (<48) ichki belgi chizilmaydi. */
  size?: number;
  /** Markazdagi belgi. Bo'sh qoldirilsa faqat yorug'lik qoladi. */
  children?: React.ReactNode;
  className?: string;
}

export default function Orb({ size = 160, children, className = '' }: Props) {
  return (
    <span
      aria-hidden
      className={`relative inline-grid place-items-center motion-safe:animate-orb-nafas ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Oq yadro — chekkasi yumshoq so'nadi, ramka yo'q. */}
      <span
        className="absolute inset-0 rounded-full bg-surface"
        style={{
          background:
            'radial-gradient(circle at 50% 44%, rgb(var(--surface)) 0%, rgb(var(--surface)) 52%, rgb(var(--surface) / 0) 72%)',
          filter: 'blur(4px)',
        }}
      />

      {/* Havorang — o'ng yuqori. Asos rang, sekin tebranadi. */}
      <span
        className="absolute inset-0 rounded-full motion-safe:animate-orb-tebranish"
        style={{
          background:
            'radial-gradient(circle at 72% 20%, rgb(var(--edge) / 0.95) 0%, rgb(var(--edge) / 0.35) 34%, rgb(var(--edge) / 0) 62%)',
          filter: `blur(${Math.round(size / 20)}px)`,
        }}
      />

      {/* Chuqur ko'k — faqat chekkada, hajm uchun. */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 66% 10%, rgb(var(--accent) / 0.5) 0%, rgb(var(--accent) / 0.12) 30%, rgb(var(--accent) / 0) 55%)',
          filter: `blur(${Math.round(size / 18)}px)`,
        }}
      />

      {/* Och ko'k — pastki chap. */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 26% 74%, rgb(var(--tint)) 0%, rgb(var(--tint) / 0.5) 38%, rgb(var(--tint) / 0) 66%)',
          filter: `blur(${Math.round(size / 22)}px)`,
        }}
      />

      {/* UCHINCHI RANG — chap tomon, yonib-o'chadi. */}
      <span
        className="absolute inset-0 rounded-full motion-safe:animate-orb-yonish"
        style={{
          background:
            'radial-gradient(circle at 22% 36%, rgb(var(--halo) / 0.85) 0%, rgb(var(--halo) / 0) 58%)',
          filter: `blur(${Math.round(size / 18)}px)`,
          // Harakat o'chirilganda ham rang ko'rinib tursin.
          opacity: 0.55,
        }}
      />

      {children && <span className="relative">{children}</span>}
    </span>
  );
}
