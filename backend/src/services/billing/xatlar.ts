import type { Xat } from '../email';
import { PLAN_NOMI, sanaToshkent, somFormat, type PullikPlan } from './qoidalar';

/* Billing xatlari — o'zbekcha + ruscha bitta xatda (mijozning tili
   bizda saqlanmaydi). Toza funksiyalar — testlanadi. */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function qobiq(sarlavha: string, bloklar: string[], tugma?: { matn: string; url: string }): string {
  const t = tugma
    ? `<p style="margin:24px 0"><a href="${esc(tugma.url)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(tugma.matn)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 16px">${esc(sarlavha)}</h2>
${bloklar.map((b) => `<p style="line-height:1.55;margin:0 0 14px">${b}</p>`).join('\n')}
${t}
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
<p style="color:#777;font-size:12px">McQueen AI · mcqueen.uz</p>
</body></html>`;
}

export interface XatMalumot {
  kimga: string;
  plan: PullikPlan;
  summa: number;
  sana: Date;
  karta: string;
  billingUrl: string;
}

/** 7 kun oldin: "N-sanada kartangizdan X so'm yechiladi". */
export function eslatmaXati(m: XatMalumot): Xat {
  const sana = sanaToshkent(m.sana);
  const plan = PLAN_NOMI[m.plan];
  const s = somFormat(m.summa);
  const uz = `${sana} kuni McQueen AI <b>${plan}</b> obunangiz avtomatik yangilanadi va <b>${esc(m.karta)}</b> kartangizdan <b>${s} so'm</b> yechiladi.`;
  const uz2 = `Hech narsa qilish shart emas. Yangilashni xohlamasangiz yoki kartani almashtirmoqchi bo'lsangiz — ${sana} gacha "To'lov" bo'limida avto-yangilashni o'chiring.`;
  const ru = `${sana} подписка McQueen AI <b>${plan}</b> продлится автоматически, с карты <b>${esc(m.karta)}</b> будет списано <b>${s} сум</b>.`;
  const ru2 = `Ничего делать не нужно. Чтобы отключить автопродление или сменить карту — зайдите в раздел «Оплата» до ${sana}.`;
  return {
    kimga: m.kimga,
    mavzu: `${sana} kuni obuna yangilanadi — ${s} so'm / Продление подписки ${sana}`,
    html: qobiq('Obunangiz 7 kundan keyin yangilanadi', [uz, uz2, '—', ru, ru2], {
      matn: "To'lov sozlamalari / Настройки оплаты",
      url: m.billingUrl,
    }),
    matn: [
      `${sana} kuni McQueen AI ${plan} obunangiz avtomatik yangilanadi: ${m.karta} kartadan ${s} so'm yechiladi.`,
      `Bekor qilish yoki kartani almashtirish: ${m.billingUrl}`,
      '',
      `${sana} подписка McQueen AI ${plan} продлится: с карты ${m.karta} будет списано ${s} сум.`,
      `Отключить или сменить карту: ${m.billingUrl}`,
    ].join('\n'),
  };
}

/** To'lov o'tdi. `sana` = yangi muddat oxiri. */
export function tolovOtdiXati(m: XatMalumot): Xat {
  const sana = sanaToshkent(m.sana);
  const plan = PLAN_NOMI[m.plan];
  const s = somFormat(m.summa);
  return {
    kimga: m.kimga,
    mavzu: `To'lov qabul qilindi — ${s} so'm / Оплата получена`,
    html: qobiq(
      "To'lov qabul qilindi",
      [
        `${esc(m.karta)} kartangizdan <b>${s} so'm</b> yechildi. ${plan} obunasi <b>${sana}</b> gacha faol.`,
        `С карты ${esc(m.karta)} списано <b>${s} сум</b>. Подписка ${plan} активна до <b>${sana}</b>.`,
      ],
      { matn: "To'lovlar tarixi / История платежей", url: m.billingUrl }
    ),
    matn: `${m.karta}: ${s} so'm yechildi. ${plan} ${sana} gacha faol.\nСписано ${s} сум, ${plan} активна до ${sana}.\n${m.billingUrl}`,
  };
}

/** Yechib bo'lmadi. `keyingi` null = urinishlar tugadi, obuna to'xtadi. */
export function tolovOtmadiXati(m: XatMalumot & { keyingi: Date | null; sabab?: string }): Xat {
  const s = somFormat(m.summa);
  const plan = PLAN_NOMI[m.plan];
  const sabab = m.sabab ? ` (${esc(m.sabab)})` : '';
  const uz = m.keyingi
    ? `${esc(m.karta)} kartangizdan ${s} so'm yechib bo'lmadi${sabab}. ${sanaToshkent(m.keyingi)} kuni qayta urinamiz — kartada mablag' borligini tekshiring yoki boshqa karta ulang. Shu paytgacha ${plan} ishlab turadi.`
    : `${esc(m.karta)} kartangizdan ${s} so'm yechib bo'lmadi${sabab}. ${plan} obunasi to'xtatildi va akkaunt Free tarifiga o'tdi. Ma'lumotlaringiz saqlanadi — karta ulab, istalgan payt qayta yoqishingiz mumkin.`;
  const ru = m.keyingi
    ? `Не удалось списать ${s} сум с карты ${esc(m.karta)}${sabab}. Повторим ${sanaToshkent(m.keyingi)} — проверьте баланс или привяжите другую карту. До этого ${plan} работает.`
    : `Не удалось списать ${s} сум с карты ${esc(m.karta)}${sabab}. Подписка ${plan} остановлена, аккаунт переведён на Free. Данные сохранены — подключите карту, чтобы возобновить.`;
  return {
    kimga: m.kimga,
    mavzu: m.keyingi ? `To'lov o'tmadi / Платёж не прошёл` : `Obuna to'xtatildi / Подписка остановлена`,
    html: qobiq(m.keyingi ? "To'lov o'tmadi" : "Obuna to'xtatildi", [uz, ru], {
      matn: 'Kartani yangilash / Обновить карту',
      url: m.billingUrl,
    }),
    matn: `${uz.replace(/<[^>]+>/g, '')}\n\n${ru.replace(/<[^>]+>/g, '')}\n${m.billingUrl}`,
  };
}
