/**
 * MA'LUMOTLARNI O'CHIRISH.
 *
 * ⚠ META BU SAHIFANI ALOHIDA MAYDONDA SO'RAYDI ("Data Deletion
 * Instructions URL"). U ochiq bo'lishi va aniq YO'L-YO'RIQ berishi
 * kerak — "biz bilan bog'laning" degan bir qator yetmaydi.
 *
 * ⚠ MATN VA'DA BERADI: 30 kun ichida o'chirish. Bu bajarilishi SHART.
 * Hozirda o'chirish QO'LDA qilinadi — avtomatik endpoint yo'q. Shuning
 * uchun matnda "so'rov yuboring" deyiladi, "tugmani bosing" emas:
 * mavjud bo'lmagan tugmani va'da qilish — yolg'on hujjat.
 *
 * KEYINGI QADAM (hozir yo'q): `DELETE /api/workspace` endpointi va
 * sozlamalardagi "Akkauntni o'chirish" tugmasi. Qo'shilganda shu
 * sahifa ham yangilanadi.
 */
import LegalLayout, { Bolim } from './LegalLayout';
import { HUQUQIY } from '../../config/huquqiy';

export default function DataDeletionPage() {
  return (
    <LegalLayout
      sarlavha="Ma'lumotlarni o'chirish"
      izoh="Ma'lumotingizni o'chirishni qanday so'rash mumkin va nima o'chiriladi."
    >
      <Bolim nom="Kimga murojaat qilinadi">
        <p>
          <strong className="text-ink">{HUQUQIY.yuridikNom}</strong>
          {HUQUQIY.royxatRaqami ? ` · davlat ro'yxat raqami ${HUQUQIY.royxatRaqami}` : ''}
          {HUQUQIY.manzil ? ` · ${HUQUQIY.manzil}` : ''}, {HUQUQIY.mamlakat}
        </p>
      </Bolim>

      <Bolim raqam={1} nom="Qanday so'rash mumkin">
        <p>
          Quyidagi manzilga xat yuboring:{' '}
          <a href={`mailto:${HUQUQIY.email}`} className="text-accent hover:underline">
            {HUQUQIY.email}
          </a>
        </p>
        <p>Xatda quyidagilar bo'lsin:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Mavzu: <code className="text-xs">Ma'lumotlarni o'chirish</code></li>
          <li>Akkauntingiz ro'yxatdan o'tgan email manzili</li>
          <li>
            Nima o'chirilsin: <strong className="text-ink">butun akkaunt</strong> yoki
            faqat ma'lum bir ulanish (masalan Facebook)
          </li>
        </ul>
        <p>
          So'rov shu email'ning egasidan kelganligi tekshiriladi — boshqa odamning
          ma'lumotini o'chirib yuborish xavfi bor.
        </p>
      </Bolim>

      <Bolim raqam={2} nom="Nima o'chiriladi">
        <p>Butun akkaunt o'chirilganda quyidagilar butunlay yo'q qilinadi:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Akkaunt yozuvi — email va parol xeshi</li>
          <li>
            Facebook va CRM ulanish tokenlari (shifrlangan holda saqlangan edi)
          </li>
          <li>Import qilingan lidlar, bitimlar va ular bilan bog'liq xeshlar</li>
          <li>Reklama statistikasi — kampaniya, ad set, reklama yozuvlari</li>
          <li>Piksel yozgan hodisalar (touchpoint) va ularning xeshlari</li>
          <li>Telegram ulanishlari va sozlamalari</li>
        </ul>
      </Bolim>

      <Bolim raqam={3} nom="Qancha vaqtda">
        <p>
          So'rov <strong className="text-ink">30 kun ichida</strong> bajariladi. Amalda
          odatda bir necha ish kuni ichida. Bajarilgach tasdiq xati yuboriladi.
        </p>
        <p className="text-ink-3">
          ⚠ Hozirda o'chirish qo'lda bajariladi — avtomatik tugma hali yo'q. Shuning uchun
          so'rov email orqali yuboriladi.
        </p>
      </Bolim>

      <Bolim raqam={4} nom="Faqat ulanishni uzish">
        <p>
          Butun akkauntni o'chirmasdan bitta ulanishni uzish uchun xat kerak emas:
          platformadagi <strong className="text-ink">Sozlamalar → Integratsiyalar</strong>{' '}
          bo'limidan tegishli kartani oching va ulanishni uzing.
        </p>
        <p>
          Facebook tomonidan ham uzish mumkin: Facebook → Settings → Business Integrations →
          ilovani olib tashlash. Bu holda bizdagi token ishlamay qoladi, lekin allaqachon
          import qilingan ma'lumot bazada qoladi — uni o'chirish uchun 1-bo'limdagi
          so'rovni yuboring.
        </p>
      </Bolim>

      <Bolim raqam={5} nom="Nima qolishi mumkin">
        <p>
          Biz allaqachon <strong className="text-ink">Meta'ga yuborilgan</strong> konversiya
          hodisalarini o'chira olmaymiz — ular Meta tomonida saqlanadi va ularni o'chirish
          Meta'ning o'z siyosatiga bo'ysunadi.
        </p>
        <p>
          Shuningdek, qonun talab qilgan hollarda ayrim texnik jurnallar cheklangan muddat
          saqlanishi mumkin. Ular shaxsni aniqlovchi ma'lumot saqlamaydi.
        </p>
      </Bolim>

      <Bolim raqam={6} nom="Savollar">
        <p>
          Ma'lumot bilan bog'liq har qanday savol uchun:{' '}
          <a href={`mailto:${HUQUQIY.email}`} className="text-accent hover:underline">
            {HUQUQIY.email}
          </a>
        </p>
        <p>
          Qanday ma'lumot yig'ilishi va qayerga borishi —{' '}
          <a href="/privacy" className="text-accent hover:underline">
            Maxfiylik siyosatida
          </a>
          .
        </p>
      </Bolim>
    </LegalLayout>
  );
}
