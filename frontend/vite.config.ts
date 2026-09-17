import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* ═══════════════════════════════════════════════════════════════
   MUHIM — brauzerga ketgan kodni "o'qib bo'lmaydigan" qilish
   TO'LIQ imkonsiz. Brauzer kodni ishga tushirishi uchun uni o'qishi
   kerak, ya'ni foydalanuvchi ham o'qiy oladi. Bu yerdagi sozlamalar
   kodni YASHIRMAYDI — faqat eng arzon va eng katta teshiklarni yopadi:

     • sourcemap: false — asosiysi. Sourcemap chiqsa, Inspect'da
       minifikatsiya qilingan kod emas, ASL TypeScript fayllari
       izohlari va papka strukturasi bilan ko'rinadi. Vite'da
       standart qiymat allaqachon false, lekin bu yerda ATAYLAB
       yozilgan: kelajakda kimdir debug uchun yoqib, keyin
       o'chirishni unutmasin.
   Console chiqishini o'chirish (`drop`) bu yerda YO'Q va ataylab:
   Vite 8 transformatsiyani oxc bilan qiladi, oxc esa bu sozlamani
   qo'llamaydi. Build'dagi 21 ta console chaqiruvi tekshirildi —
   hammasi kutubxonalardan (React, React Router, zustand, axios),
   bizning kodimizdan birortasi ham emas. Ya'ni o'chiradigan narsa yo'q.

   Haqiqiy himoya esa boshqa joyda: qimmatli mantiq (atribusiya
   dvigateli, lidni reklamaga bog'lash, CAPI, tokenlar) — hammasi
   backendda. Frontend faqat ko'rsatadi. Raqobatchi bu bundle'ni
   to'liq ko'chirib olsa ham, uning hisob-kitobi yo'q.
   ═══════════════════════════════════════════════════════════════ */

export default defineConfig(() => ({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },

  build: {
    // Inspect'da asl TS fayllari ko'rinmasin.
    sourcemap: false,
    // Vite 8 standarti — oxc. `minify: 'esbuild'` deb yozish
    // eskirgan yo'lni ishga soladi va esbuild'ni alohida talab qiladi.
    minify: true,
  },
}));
