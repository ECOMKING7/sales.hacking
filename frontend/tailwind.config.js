/** @type {import('tailwindcss').Config} */

// Har bir rang src/styles/tokens.css dagi CSS o'zgaruvchisidan o'qiladi.
// <alpha-value> Tailwind'ga bg-accent/20 kabi shaffoflikni beradi.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: token('ground'),
        surface: {
          DEFAULT: token('surface'),
          2: token('surface-2'),
          3: token('surface-3'),
        },
        line: {
          DEFAULT: token('line'),
          2: token('line-2'),
        },
        ink: {
          DEFAULT: token('ink'),
          2: token('ink-2'),
          3: token('ink-3'),
        },
        accent: {
          DEFAULT: token('accent'),
          ink: token('accent-ink'),
        },
        edge: {
          DEFAULT: token('edge'),
          soft: token('edge-soft'),
        },
        tint: token('tint'),
        // Uchinchi rang — bezak. ok/warn/bad bilan aralashtirilmaydi.
        halo: {
          DEFAULT: token('halo'),
          ink: token('halo-ink'),
          soft: token('halo-soft'),
          tint: token('halo-tint'),
        },
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
      },

      fontFamily: {
        // Montserrat — asosiy. Apple qurilmalarida fayl yuklanmasa SF ga tushadi.
        sans: [
          'Montserrat',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        // Yorliqlar, ustun sarlavhalari, token qiymatlari — tor va tekis raqamli.
        mono: [
          'IBM Plex Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },

      fontSize: {
        // Dizayn tizimidagi shkala. Boshqa o'lchamlar ishlatilmaydi.
        label: ['0.625rem', { lineHeight: '1.4', letterSpacing: '0.1em' }], // 10
        xs: ['0.75rem', { lineHeight: '1.5' }], // 12
        sm: ['0.8125rem', { lineHeight: '1.55' }], // 13 — jadval
        base: ['0.875rem', { lineHeight: '1.62' }], // 14 — matn
        lg: ['1.125rem', { lineHeight: '1.4', letterSpacing: '-0.015em' }], // 18
        xl: ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.025em' }], // 24
        '2xl': ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.03em' }], // 28 — metrika
        '3xl': ['2rem', { lineHeight: '1.08', letterSpacing: '-0.03em' }], // 32
      },

      borderRadius: {
        // Oltita radius o'rniga uchta.
        sm: '9px',
        md: '14px',
        lg: '18px',
      },

      // Tailwind standart shkalasi 5/10/20/25... — dizayn tizimi esa
      // yengil fonlar uchun oraliq qiymatlarni talab qiladi.
      // Bularsiz bg-ok/12 kabi klasslar CSS ga UMUMAN tushmaydi va fon shaffof qoladi.
      opacity: {
        7: '0.07',
        8: '0.08',
        9: '0.09',
        12: '0.12',
        14: '0.14',
        16: '0.16',
        18: '0.18',
        28: '0.28',
        45: '0.45',
      },

      boxShadow: {
        'glow-xs': 'var(--glow-xs)',
        'glow-sm': 'var(--glow-sm)',
        'glow-md': 'var(--glow-md)',
        'glow-lg': 'var(--glow-lg)',
      },

      keyframes: {
        breathe: {
          '0%, 100%': { boxShadow: 'var(--glow-xs)' },
          '50%': { boxShadow: 'var(--glow-md)' },
        },
        blip: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // ── Orb: uchta tezlik, ataylab har xil ──
        // Hammasi bir ritmda pulslasa ekran miltillaydi.
        'orb-nafas': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.035)' },
        },
        'orb-yonish': {
          '0%, 100%': { opacity: '0.12' },
          '50%': { opacity: '0.92' },
        },
        'orb-tebranish': {
          '0%, 100%': { opacity: '0.78' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        // Faqat "hozir bir narsa sodir bo'lyapti" holati uchun.
        breathe: 'breathe 2.6s ease-in-out infinite',
        blip: 'blip 1.7s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        // Orb — brend belgisi. Sekin: diqqatni tortmaydi, e'tiborni ushlaydi.
        'orb-nafas': 'orb-nafas 7s ease-in-out infinite',
        'orb-yonish': 'orb-yonish 3.4s ease-in-out infinite',
        'orb-tebranish': 'orb-tebranish 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
