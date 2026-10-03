/**
 * FOYDALANISH SHARTLARI.
 *
 * ⚠ BU YERDA VA'DA BERILMAYDI. Mahsulot hali bitta mijozda ishlaydi,
 * SLA yo'q, zaxira nusxa jarayoni rasmiylashtirilmagan. "99.9% uptime"
 * deb yozish — bajarilmaydigan majburiyat olish demak.
 *
 * Loyihaning asosiy tamoyili shu yerda ham amal qiladi: noto'g'ri
 * raqam yo'q raqamdan yomon. Noto'g'ri va'da ham shunday.
 *
 * ⚠ MEN YURIST EMASMAN. Bu matn Meta / amoCRM / Bitrix24 ning TEXNIK
 * talabini qoplaydi. O'zbekiston qonunchiligi bo'yicha yurist ko'rigi
 * alohida ish va u qilinmaguncha bu hujjat to'liq deb hisoblanmaydi.
 */
import LegalLayout, { Bolim } from './LegalLayout';
import { HUQUQIY } from '../../config/huquqiy';

export default function TermsPage() {
  return (
    <LegalLayout
      sarlavha="Foydalanish shartlari"
      izoh={`${HUQUQIY.mahsulot} xizmatidan foydalanish qoidalari.`}
    >
      <Bolim raqam={1} nom="Kim xizmat ko'rsatadi">
        <p>
          Xizmatni <strong className="text-ink">{HUQUQIY.yuridikNom}</strong>
          {HUQUQIY.royxatRaqami ? ` (davlat ro'yxat raqami ${HUQUQIY.royxatRaqami})` : ''}
          {HUQUQIY.manzil ? `, ${HUQUQIY.manzil}` : ''}, {HUQUQIY.mamlakat}, ko'rsatadi.
        </p>
        <p>
          Akkaunt yaratish yoki xizmatdan foydalanish — shu shartlarga rozilik bildirish
          demak.
        </p>
      </Bolim>

      <Bolim raqam={2} nom="Xizmat nima qiladi">
        <p>
          {HUQUQIY.mahsulot} sizning Facebook Ads akkauntingiz va CRM tizimingizni
          bog'laydi, reklama xarajati bilan CRM daromadini solishtiradi va har reklama
          kesimida ROAS, CAC, CPL kabi ko'rsatkichlarni hisoblaydi.
        </p>
        <p>
          Xizmat <strong className="text-ink">faqat o'qiydi</strong>: reklama akkauntingizga
          o'zgartirish kiritmaydi, byudjetni boshqarmaydi.
        </p>
      </Bolim>

      <Bolim raqam={3} nom="Sizning majburiyatlaringiz">
        <p>
          Siz faqat o'zingizga tegishli yoki qonuniy ruxsat olingan reklama akkaunti va CRM
          ni ulashga majbursiz. Boshqa shaxsning ma'lumotini uning roziligisiz ulash
          taqiqlanadi.
        </p>
        <p>
          Akkauntingizning maxfiyligi sizning zimmangizda. Ruxsatsiz kirishni sezsangiz
          darhol xabar bering.
        </p>
      </Bolim>

      <Bolim raqam={4} nom="Ma'lumot kimniki">
        <p>
          <strong className="text-ink">
            Siz ulagan ma'lumot sizniki bo'lib qoladi.
          </strong>{' '}
          Biz uni faqat sizga hisobot ko'rsatish uchun qayta ishlaymiz. Uni sotmaymiz,
          boshqa mijozga ko'rsatmaymiz va sizning ruxsatingizsiz uchinchi tomonga
          bermaymiz.
        </p>
        <p>
          Qanday ma'lumot va qayerga borishi —{' '}
          <a href="/privacy" className="text-accent hover:underline">
            Maxfiylik siyosatida
          </a>{' '}
          batafsil yozilgan.
        </p>
      </Bolim>

      <Bolim raqam={5} nom="Raqamlarning aniqligi">
        <p>
          Hisob-kitob uchinchi tomon manbalariga tayanadi: Facebook Marketing API va
          sizning CRM'ingiz. Bu manbalarning o'zi ba'zan to'liq bo'lmagan yoki kechikkan
          ma'lumot beradi.
        </p>
        <p>
          Xizmat <strong className="text-ink">hisoblab bo'lmaydigan ko'rsatkichni taxmin
          qilmaydi</strong> — uning o'rniga "—" belgisi va sababi ko'rsatiladi. Shunga
          qaramay, platformadagi raqam moliyaviy hisobot o'rnini bosmaydi. Byudjet
          qarorlari sizniki.
        </p>
      </Bolim>

      <Bolim raqam={6} nom="Xizmatning mavjudligi">
        <p>
          Xizmat "qanday bo'lsa shunday" (as is) taqdim etiladi. Hozirda rasmiy SLA yoki
          kafolatlangan uzluksizlik darajasi{' '}
          <strong className="text-ink">e'lon qilinmaydi</strong>. Uchinchi tomon API'lari
          (Facebook, amoCRM) ishlamay qolsa, ma'lumot yangilanishi kechikishi mumkin.
        </p>
        <p>
          Texnik ishlar yoki uzilish yuz berganda ko'rsatilgan email orqali xabar
          beriladi.
        </p>
      </Bolim>

      <Bolim raqam={7} nom="Mas'uliyat chegarasi">
        <p>
          Xizmat qonun ruxsat etgan darajada bilvosita zararlar — boy berilgan foyda,
          noto'g'ri qabul qilingan marketing qarori, uchinchi tomon xizmatining uzilishi
          natijasidagi zarar — uchun javobgar emas.
        </p>
        <p>
          Bu band sizning qonun bilan berilgan huquqlaringizni cheklamaydi.
        </p>
      </Bolim>

      <Bolim raqam={8} nom="To'lov va avtomatik yangilanish">
        <p>
          Pullik tariflar oylik obuna asosida ishlaydi. Narx so'mda, "Tariflar va to'lov"
          sahifasida ko'rsatiladi. To'lov Payme yoki Click orqali Uzcard/Humo karta bilan
          qabul qilinadi.
        </p>
        <p>
          Birinchi to'lov obuna boshlanganda yechiladi. Keyin{' '}
          <strong className="text-ink">har oy o'sha sanada shu kartadan avtomatik
          yechiladi</strong> — buning uchun to'lov oynasida alohida rozilik beriladi.
          Har yechishdan <strong className="text-ink">7 kun oldin</strong> akkaunt
          emailiga summa va sana ko'rsatilgan xat yuboriladi.
        </p>
        <p>
          Avto-yangilashni yoki kartani istalgan payt "Tariflar va to'lov" sahifasida
          o'chirishingiz mumkin; to'langan davr oxirigacha tarif ishlab turadi, keyin
          Free tarifiga o'tadi. To'lov o'tmasa 1 va 3 kundan keyin qayta urinamiz;
          uchinchi urinish ham o'tmasa obuna to'xtatiladi. Ma'lumotlaringiz o'chirilmaydi.
        </p>
        <p>
          Karta raqami bizning serverlarimizda saqlanmaydi — faqat to'lov tizimi bergan
          token saqlanadi. Xato yechilgan to'lov bo'yicha 14 kun ichida{' '}
          {HUQUQIY.email ? (
            <a href={`mailto:${HUQUQIY.email}`} className="text-accent hover:underline">
              {HUQUQIY.email}
            </a>
          ) : (
            'qo\'llab-quvvatlash xizmatiga'
          )}{' '}
          murojaat qiling.
        </p>
      </Bolim>

      <Bolim raqam={9} nom="To'xtatish va bekor qilish">
        <p>
          Siz istalgan vaqtda ulanishni uzishingiz yoki akkauntni o'chirishingiz mumkin —{' '}
          <a href="/data-deletion" className="text-accent hover:underline">
            Ma'lumotlarni o'chirish
          </a>{' '}
          sahifasiga qarang.
        </p>
        <p>
          Biz shartlar buzilgan taqdirda (boshqa shaxsning ma'lumotini ruxsatsiz ulash,
          tizimga zarar yetkazishga urinish) akkauntni to'xtatishimiz mumkin. Bunda
          sababni email orqali ma'lum qilamiz.
        </p>
      </Bolim>

      <Bolim raqam={10} nom="O'zgarishlar va nizolar">
        <p>
          Shartlar o'zgarsa yuqoridagi sana yangilanadi; muhim o'zgarishda email yuboriladi.
        </p>
        <p>
          Nizolar avval muzokara yo'li bilan hal qilinadi. Kelishuv bo'lmasa —{' '}
          {HUQUQIY.mamlakat} qonunchiligi va sudlari qo'llaniladi.
        </p>
      </Bolim>
    </LegalLayout>
  );
}
