/**
 * Foydalanuvchi yo'naltiriladigan ASOSIY frontend manzili.
 *
 * FRONTEND_URL CORS uchun vergul bilan ajratilgan RO'YXAT bo'lishi mumkin
 * (app.ts): "https://www.mcqueen.uz,https://sales-hacking-web.vercel.app".
 * Yo'naltirishda butun satrni ishlatib bo'lmaydi — birinchisi asosiy.
 */
export function frontendUrl(): string {
  const first = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((s) => s.trim())
    .find(Boolean);
  return (first || 'http://localhost:5173').replace(/\/$/, '');
}
