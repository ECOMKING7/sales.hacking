/**
 * Vercel serverless kirish nuqtasi.
 *
 * Vercel `app.listen()` ni chaqirmaydi — u Express ilovasini to'g'ridan-to'g'ri
 * (req, res) ishlovchisi sifatida ishlatadi. Shuning uchun bu yerda faqat
 * ilovaning o'zi eksport qilinadi; server ochish va cron `src/index.ts` da qoladi.
 *
 * vercel.json barcha yo'llarni shu faylga yo'naltiradi.
 */
import app from '../src/app';

export default app;
