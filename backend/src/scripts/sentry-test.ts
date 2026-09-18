/**
 * Sentry ulanishini tekshirish. BIR MARTALIK, hech narsani o'zgartirmaydi.
 *
 *   npm run sentry:test
 *
 * Nima qiladi:
 *   1. Ataylab bitta xato yasaydi — ichida SOXTA token bor.
 *   2. Uni xatoQayd() orqali yuboradi.
 *   3. Sentry ga yetib borguncha kutadi (flush).
 *
 * Keyin Sentry'da "Issues" bo'limida "SENTRY TEST" degan xato ko'rinadi.
 * Xato matnida token O'RNIDA yulduzcha turishi kerak — agar haqiqiy
 * token ko'rinsa, maskalash ishlamayapti va bu XAVFSIZLIK NUQSONI.
 *
 * Bazaga, CRM ga, Facebook'ga TEGMAYDI. Faqat bitta xato yuboradi.
 */
import dotenv from 'dotenv';
dotenv.config();

import { xatoQayd, xatolarniYubor, maskla } from '../utils/xatolar';

async function main(): Promise<void> {
  if (!process.env.SENTRY_DSN) {
    console.log('SENTRY_DSN qo\'yilmagan — .env ga qo\'shing va qayta urinib ko\'ring.');
    console.log('DSN yo\'q bo\'lsa xatolar faqat konsolga yoziladi (ilova baribir ishlaydi).');
    return;
  }

  // Soxta maxfiy qiymatlar — haqiqiylari emas, shunchaki maskani sinash uchun.
  const soxta =
    'SENTRY TEST — Authorization: Bearer soxta_token_12345 ' +
    'https://demo.bitrix24.ru/rest/1/soxtakod9876/crm.lead.list?secret=soxta_secret';

  console.log('Yuborilmoqda...');
  console.log('Maskadan keyin:', maskla(soxta));

  xatoQayd(new Error(soxta), {
    joy: 'sentry-test',
    workspaceId: null,
    qoshimcha: { izoh: 'qo\'lda yuborilgan tekshiruv' },
  });

  await xatolarniYubor(5000);
  console.log('\nTayyor. Sentry → Issues bo\'limini oching.');
  console.log('Xato matnida "soxta_token_12345" KO\'RINMASLIGI kerak.');
}

main().catch((err) => {
  console.error('Tekshiruv bajarilmadi:', (err as Error).message);
  process.exit(1);
});
