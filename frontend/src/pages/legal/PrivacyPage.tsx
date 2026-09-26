/**
 * MAXFIYLIK SIYOSATI.
 *
 * ⚠ BU MATN SHABLON EMAS — u kodda haqiqatan nima bo'layotganini
 * yozadi. Meta tekshiruvchisi umumiy iboralarni ("biz sizning
 * maxfiyligingizni qadrlaymiz") rad etadi va aniq javob qidiradi:
 * qanday maydon, qayerdan, qancha muddat, kimga uzatiladi.
 *
 * Har band ortida real kod turadi:
 *   - SHA-256 xeshlash        → pixelController.ts, amocrmService.ts
 *   - AES-256 token shifri    → utils/encryption.ts
 *   - user_agent XOM saqlanadi → pixelController.ts (ataylab oshkor qilingan)
 *   - Meta CAPI'ga qaytarish  → services/metaCapi.ts
 *   - Sentry (ixtiyoriy)      → utils/xatolar.ts
 *
 * ⚠ KOD O'ZGARSA — SHU MATN HAM O'ZGARADI. Yangi maydon yig'ila
 * boshlansa yoki yangi uchinchi tomon qo'shilsa, bu sahifa eskiradi
 * va u holda yolg'on hujjatga aylanadi.
 */
import LegalLayout, { Bolim } from './LegalLayout';
import { HUQUQIY } from '../../config/huquqiy';

export default function PrivacyPage() {
  return (
    <LegalLayout
      sarlavha="Maxfiylik siyosati"
      izoh={`${HUQUQIY.mahsulot} qanday ma'lumot yig'adi, nega yig'adi va u bilan nima qiladi.`}
    >
      <Bolim raqam={1} nom="Kim qayta ishlaydi">
        <p>
          Ma'lumotlarni qayta ishlovchi —{' '}
          <strong className="text-ink">{HUQUQIY.yuridikNom}</strong>
          {HUQUQIY.royxatdanOtgan ? '' : ' (jismoniy shaxs)'}.
        </p>
        {/* Reyestr ma'lumoti — ochiq va tekshiriladigan. Meta
            tekshiruvchisi aynan shu qatorni qidiradi. */}
        <dl className="space-y-1">
          {HUQUQIY.royxatRaqami && (
            <div className="flex gap-2">
              <dt className="text-ink-3">Davlat ro'yxat raqami:</dt>
              <dd className="text-ink">{HUQUQIY.royxatRaqami}</dd>
            </div>
          )}
          {HUQUQIY.royxatSanasi && (
            <div className="flex gap-2">
              <dt className="text-ink-3">Ro'yxatdan o'tgan sana:</dt>
              <dd className="text-ink">{HUQUQIY.royxatSanasi}</dd>
            </div>
          )}
          {HUQUQIY.faoliyat && (
            <div className="flex gap-2">
              <dt className="text-ink-3">Faoliyat turi:</dt>
              <dd className="text-ink">{HUQUQIY.faoliyat}</dd>
            </div>
          )}
          {HUQUQIY.manzil && (
            <div className="flex gap-2">
              <dt className="text-ink-3">Manzil:</dt>
              <dd className="text-ink">
                {HUQUQIY.manzil}, {HUQUQIY.mamlakat}
              </dd>
            </div>
          )}
        </dl>
        <p>
          Har qanday savol, so'rov yoki shikoyat uchun:{' '}
          <a href={`mailto:${HUQUQIY.email}`} className="text-accent hover:underline">
            {HUQUQIY.email}
          </a>
        </p>
      </Bolim>

      <Bolim raqam={2} nom="Xizmat nima qiladi">
        <p>
          {HUQUQIY.mahsulot} — reklama atribusiyasi platformasi. U mijozning Facebook Ads
          akkaunti va CRM tizimini bog'laydi va har reklama qancha daromad keltirganini
          hisoblaydi.
        </p>
        <p>
          Ya'ni biz yig'adigan ma'lumotning katta qismi —{' '}
          <strong className="text-ink">mijozning o'z ma'lumoti</strong>: uning reklama
          xarajati va uning CRM'idagi lidlar. Biz ularni mijoz nomidan va uning ko'rsatmasi
          bilan qayta ishlaymiz.
        </p>
      </Bolim>

      <Bolim raqam={3} nom="Qanday ma'lumot yig'iladi">
        <p className="font-medium text-ink">a) Akkaunt ma'lumoti</p>
        <p>Email va paroldan olingan xesh. Parol hech qachon ochiq saqlanmaydi.</p>

        <p className="font-medium text-ink">b) Facebook Ads</p>
        <p>
          <code className="text-xs">ads_read</code> ruxsati bilan: kampaniya, ad set va
          reklama nomlari, xarajat, ko'rsatishlar, kliklar, valyuta va vaqt zonasi.
          Reklama akkauntiga <strong className="text-ink">yozish huquqi so'ralmaydi</strong> —
          biz reklamani o'zgartira olmaymiz.
        </p>

        <p className="font-medium text-ink">c) CRM (amoCRM)</p>
        <p>
          Lid identifikatori, yaratilgan va yopilgan sana, voronka va etap, bitim summasi,
          UTM belgilari. Kontakt ma'lumoti — telefon va email — olinadi, lekin{' '}
          <strong className="text-ink">
            kelishi bilanoq SHA-256 bilan xeshlanadi va xom holda saqlanmaydi
          </strong>
          .
        </p>

        <p className="font-medium text-ink">d) Saytdagi piksel</p>
        <p>
          Mijoz o'z saytiga piksel qo'ysa, quyidagilar yoziladi: <code className="text-xs">fbclid</code>,
          UTM belgilari, hodisa turi (ko'rish, klik, lid, xarid), reklama identifikatorlari,
          IP manzilning <strong className="text-ink">SHA-256 xeshi</strong> (xom IP
          saqlanmaydi) va brauzerning <code className="text-xs">User-Agent</code> qatori.
        </p>
        <p className="text-ink-3">
          ⚠ <code className="text-xs">User-Agent</code> xom holda saqlanadi — u brauzer va
          qurilma turini ko'rsatadi, shaxsni aniqlamaydi.
        </p>
      </Bolim>

      <Bolim raqam={4} nom="Nima YIG'ILMAYDI">
        <p>
          Xom telefon raqami · xom email (mijoz akkauntidan tashqari) · xom IP manzil ·
          pasport yoki shaxsiy hujjat ma'lumoti · to'lov karta raqami · joylashuv (GPS) ·
          reklama akkaunti yoki CRM'ga yozish huquqi.
        </p>
      </Bolim>

      <Bolim raqam={5} nom="Qayerda saqlanadi va qanday himoyalanadi">
        <p>
          Ma'lumotlar Supabase (PostgreSQL) bazasida, ilova esa Vercel infratuzilmasida
          joylashgan.
        </p>
        <p>
          Facebook va CRM'ga ulanish tokenlari bazada{' '}
          <strong className="text-ink">AES-256 bilan shifrlangan holda</strong> yotadi.
          Shaxsni aniqlovchi maydonlar (email, telefon, IP) kelishi bilanoq SHA-256 bilan
          xeshlanadi — xesh orqali asl qiymatni tiklab bo'lmaydi.
        </p>
      </Bolim>

      <Bolim raqam={6} nom="Kimga uzatiladi">
        <p className="font-medium text-ink">Meta (Conversions API) — ixtiyoriy</p>
        <p>
          Mijoz yoqsa, CRM natijasi (lid, sifatli lid, xarid) Meta'ga qaytariladi.
          Yuboriladigan identifikatorlar — <strong className="text-ink">xeshlangan</strong>{' '}
          telefon va email, <code className="text-xs">fbclid</code> dan qurilgan{' '}
          <code className="text-xs">fbc</code>, Meta Lead ID. Bu funksiya sozlamalardan
          o'chirilishi mumkin.
        </p>

        <p className="font-medium text-ink">Telegram — ixtiyoriy</p>
        <p>
          Mijoz ulasa, hisobot va sotuv xabari uning Telegram guruhi yoki kanaliga
          yuboriladi. Xabarda reklama nomi va bitim summasi bo'ladi; kontakt ma'lumoti
          yuborilmaydi.
        </p>

        <p className="font-medium text-ink">Xato monitoringi — ixtiyoriy</p>
        <p>
          Sentry yoqilgan bo'lsa, xato xabarlari yuboriladi. Yuborishdan oldin tokenlar,
          sarlavhalar va sirlar avtomatik maskalanadi.
        </p>

        <p>
          Boshqa hech kimga uzatilmaydi.{' '}
          <strong className="text-ink">Ma'lumot sotilmaydi va reklama uchun ijaraga
          berilmaydi.</strong>
        </p>
      </Bolim>

      <Bolim raqam={7} nom="Qancha muddat saqlanadi">
        <p>
          Mijoz akkaunti faol turgan davrda. Akkaunt o'chirilganda unga tegishli hamma
          yozuv o'chiriladi — 4-bo'limga qarang:{' '}
          <a href="/data-deletion" className="text-accent hover:underline">
            Ma'lumotlarni o'chirish
          </a>
          .
        </p>
      </Bolim>

      <Bolim raqam={8} nom="Sizning huquqlaringiz">
        <p>
          Siz o'zingiz haqingizdagi ma'lumotni so'rashingiz, tuzatishingiz yoki
          o'chirishingiz mumkin. Facebook yoki CRM ulanishini istalgan vaqtda uzishingiz
          mumkin — sozlamalar sahifasidan yoki tegishli platformaning o'zidan.
        </p>
        <p>
          Murojaat:{' '}
          <a href={`mailto:${HUQUQIY.email}`} className="text-accent hover:underline">
            {HUQUQIY.email}
          </a>
          . Javob 30 kun ichida beriladi.
        </p>
      </Bolim>

      <Bolim raqam={9} nom="O'zgarishlar">
        <p>
          Bu siyosat o'zgarsa, yuqoridagi "Oxirgi yangilanish" sanasi yangilanadi. Muhim
          o'zgarish bo'lsa mijozlarga email orqali xabar beriladi.
        </p>
      </Bolim>
    </LegalLayout>
  );
}
