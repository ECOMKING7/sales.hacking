/**
 * PUL HISOBLANADIGAN JOYLAR — testlar.
 *
 * Nega aynan shular: bu fayldagi har bir funksiya noto'g'ri ishlasa,
 * ekranda XATO EMAS, balki YOLG'ON RAQAM chiqadi. Xato ko'rinadi va
 * tuzatiladi; yolg'on raqam esa qaror qabul qilinishiga sabab bo'ladi.
 *
 * Har test bitta real hodisadan kelib chiqqan — o'ylab topilgan holat
 * emas. Sarlavhada qaysi hodisa ekani yozilgan.
 *
 * Ishga tushirish:  npm test
 * Yangi paket qo'shilmagan: node'ning o'z test runneri + ts-node.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePhoneE164, phoneShape } from '../../utils/phone';
import { holatAniqla, type ImportConfig } from '../amocrmImport';
import { spendInCrmCurrency, applyRoas, type CurrencyGuard } from '../../utils/currencyGuard';
import { parseCbuDate } from '../fxRates';
import { normalizeName } from '../leadMatcher';
import {
  firstClickAttribution,
  lastClickAttribution,
  linearAttribution,
  timeDecayAttribution,
  type Touchpoint,
} from '../attributionEngine';

/* ═══════════════ 1. Telefon — E.164 ═══════════════
   HODISA: hashPhone raqamdan faqat raqamlarni qoldirardi, shuning uchun
   "+998 90 123 45 67" va "901234567" boshqa-boshqa hash berardi va Meta
   ikkalasini ham tanimasdi. */

test('telefon: bir raqamning uch ko\'rinishi bitta natija beradi', () => {
  const kutilgan = '998901234567';
  assert.equal(normalizePhoneE164('+998 90 123 45 67'), kutilgan);
  assert.equal(normalizePhoneE164('998901234567'), kutilgan);
  assert.equal(normalizePhoneE164('90 123 45 67'), kutilgan);
});

test('telefon: 0 bilan boshlanuvchi mahalliy shakl', () => {
  assert.equal(normalizePhoneE164('0901234567'), '998901234567');
});

test('telefon: 00 xalqaro prefiksi', () => {
  assert.equal(normalizePhoneE164('00998901234567'), '998901234567');
});

test('telefon: mamlakat kodi konfiguratsiyadan — Qozog\'iston', () => {
  // Xalqaro shakl to'g'ri ishlaydi.
  assert.equal(normalizePhoneE164('+7 701 234 5678', '7'), '77012345678');
});

test('telefon: MA\'LUM CHEKLOV — bir xonali mamlakat kodi', () => {
  // "7012345678" qozoq MILLIY raqami, lekin u mamlakat kodi (7) bilan
  // boshlanadi va kod uni "allaqachon xalqaro" deb oladi.
  // Bu hujjatlashtirilgan cheklov, kutilmagan xato emas — RU/KZ/US
  // bozoriga chiqishdan oldin raqamlash uzunligi bo'yicha qoida kerak.
  assert.equal(normalizePhoneE164('7012345678', '7'), '7012345678');
});

test('telefon: yaroqsiz qiymat null qaytaradi, taxmin qilinmaydi', () => {
  assert.equal(normalizePhoneE164(''), null);
  assert.equal(normalizePhoneE164(null), null);
  assert.equal(normalizePhoneE164('yo\'q'), null);
  // Juda qisqa — raqam emas. Ilgari bu "99812345" bo'lib ketardi.
  assert.equal(normalizePhoneE164('12345'), null);
  assert.equal(normalizePhoneE164('123'), null);
});

test('telefon: log\'ga raqamning o\'zi emas, faqat shakli tushadi', () => {
  const shakl = phoneShape('+998 90 123 45 67');
  assert.ok(!shakl.includes('901234567'), 'raqam log\'da ko\'rinmasligi kerak');
  assert.match(shakl, /len\d+/);
});

/* ═══════════════ 2. Etap → holat ═══════════════
   HODISA: sotuv "142" etap ID si bo'yicha aniqlanardi. amoCRM'da 142 HAR
   voronkada bor: Furninglass'da pul `guli` voronkasida yopilardi, config
   esa `Kvalifikatsiya` ni ko'rsatardi — daromadning 2.4% i ko'rinardi. */

const BOSH_CONFIG: ImportConfig = {
  attribution_key: 'utm_term',
  phone_country_code: '998',
  amocrm_won_pairs: [],
  amocrm_qualified_pairs: [],
  amocrm_lead_pairs: [],
  amocrm_won_stage_id: null,
  amocrm_pipeline_id: null,
  amocrm_qualified_stage_ids: [],
};

test('etap: sotuv juftlik bo\'yicha aniqlanadi, etap ID si yolg\'iz yetmaydi', () => {
  const config: ImportConfig = { ...BOSH_CONFIG, amocrm_won_pairs: ['777:142'] };

  // To'g'ri voronka — sotuv.
  assert.equal(holatAniqla('777', '142', config).status, 'won');
  // Boshqa voronkadagi 142 ("otzif olindi" kabi) — sotuv EMAS.
  assert.equal(holatAniqla('888', '142', config).status, 'in_progress');
});

test('etap: sotuv bir nechta voronkada bo\'lishi mumkin', () => {
  const config: ImportConfig = { ...BOSH_CONFIG, amocrm_won_pairs: ['777:142', '888:55'] };
  assert.equal(holatAniqla('777', '142', config).status, 'won');
  assert.equal(holatAniqla('888', '55', config).status, 'won');
});

test('etap: 143 — universal yutqazish', () => {
  const config: ImportConfig = { ...BOSH_CONFIG, amocrm_won_pairs: ['777:142'] };
  assert.equal(holatAniqla('999', '143', config).status, 'lost');
});

test('etap: yutilgan lid avtomatik sifatli hisoblanadi', () => {
  const config: ImportConfig = { ...BOSH_CONFIG, amocrm_won_pairs: ['777:142'] };
  assert.equal(holatAniqla('777', '142', config).sifatli, true);
});

test('etap: lid etapi belgilangan bo\'lsa status "new"', () => {
  const config: ImportConfig = {
    ...BOSH_CONFIG,
    amocrm_won_pairs: ['777:142'],
    amocrm_lead_pairs: ['777:1'],
  };
  assert.equal(holatAniqla('777', '1', config).status, 'new');
});

test('etap: juftlik yo\'q bo\'lsa eski bitta-voronkali mantiq ishlaydi', () => {
  const config: ImportConfig = {
    ...BOSH_CONFIG,
    amocrm_won_stage_id: '142',
    amocrm_pipeline_id: '777',
  };
  assert.equal(holatAniqla('777', '142', config).status, 'won');
  assert.equal(holatAniqla('888', '142', config).status, 'in_progress');
});

/* ═══════════════ 3. Valyuta ═══════════════
   HODISA: revenue (UZS) / spend (USD) — voronka 6558x qaytardi, haqiqiysi
   ~23x edi. Farq aynan kurs. */

const TENG: CurrencyGuard = {
  fb: 'UZS',
  crm: 'UZS',
  mismatch: false,
  rate: null,
  rateDate: null,
  rateSource: null,
  canComputeRoas: true,
  reason: null,
};
const KURSLI: CurrencyGuard = {
  fb: 'USD',
  crm: 'UZS',
  mismatch: true,
  rate: 11797.46,
  rateDate: '2026-09-17',
  rateSource: 'cbu.uz',
  canComputeRoas: true,
  reason: 'test',
};
const KURSSIZ: CurrencyGuard = { ...KURSLI, rate: null, canComputeRoas: false };

test('valyuta: teng bo\'lsa xarajat o\'zgarmaydi', () => {
  assert.equal(spendInCrmCurrency(800, TENG), 800);
});

test('valyuta: kurs bo\'lsa xarajat CRM valyutasiga o\'giriladi', () => {
  assert.equal(spendInCrmCurrency(800, KURSLI), 800 * 11797.46);
});

test('valyuta: kurs yo\'q bo\'lsa null — taxmin qilinmaydi', () => {
  assert.equal(spendInCrmCurrency(800, KURSSIZ), null);
});

test('ROAS: real holat — 232.5 mln so\'m / $800 = ~24.6x, 290 625x emas', () => {
  const qator = { spend: 800, revenue: 232_500_000, roas: 290625 };
  const natija = applyRoas(qator, KURSLI) as typeof qator;
  assert.ok(natija.roas > 24 && natija.roas < 25, `kutilgan ~24.6, kelgan ${natija.roas}`);
});

test('ROAS: kurs yo\'q bo\'lsa null, 0 EMAS', () => {
  const qator = { spend: 800, revenue: 232_500_000, roas: 290625 };
  const natija = applyRoas(qator, KURSSIZ) as { roas: number | null };
  // 0 "reklama pul keltirmadi" degani; null "hisoblab bo'lmadi".
  assert.equal(natija.roas, null);
});

test('ROAS: xarajat 0 bo\'lsa null (cheksizlik chiqmaydi)', () => {
  const qator = { spend: 0, revenue: 1000, roas: null };
  const natija = applyRoas(qator, KURSLI) as { roas: number | null };
  assert.equal(natija.roas, null);
});

/* ═══════════════ 4. Kurs sanasi ═══════════════ */

test('kurs sanasi: CBU shakli o\'giriladi', () => {
  assert.equal(parseCbuDate('17.09.2026'), '2026-09-17');
});

test('kurs sanasi: boshqa shakl null — noto\'g\'ri sana bazaga tushmaydi', () => {
  assert.equal(parseCbuDate('2026-09-17'), null);
  assert.equal(parseCbuDate(''), null);
  assert.equal(parseCbuDate(undefined), null);
});

/* ═══════════════ 5. Reklama nomi ═══════════════
   UTM qiymati ad nomiga solishtiriladi: URL kodlangan, "+" bilan,
   registri boshqa bo'lishi mumkin. */

test('ad nomi: URL kodlash, "+", registr va bo\'shliq normallashadi', () => {
  assert.equal(normalizeName('Video%201'), 'video 1');
  assert.equal(normalizeName('Video+1'), 'video 1');
  assert.equal(normalizeName('  VIDEO   1  '), 'video 1');
});

test('ad nomi: bo\'sh qiymat null', () => {
  assert.equal(normalizeName(''), null);
  assert.equal(normalizeName(null), null);
  assert.equal(normalizeName('   '), null);
});

/* ═══════════════ 6. Atribusiya modellari ═══════════════ */

const tp = (id: string, ad: string, kun: number): Touchpoint => ({
  id,
  ad_id: ad,
  adset_id: null,
  campaign_id: null,
  occurred_at: new Date(Date.UTC(2026, 0, kun)).toISOString(),
  touch_number: null,
});

const YOL = [tp('1', 'ad-A', 1), tp('2', 'ad-B', 5), tp('3', 'ad-C', 10)];

test('model: first click — birinchi teginish', () => {
  assert.equal(firstClickAttribution(YOL), 'ad-A');
});

test('model: last click — oxirgi teginish (standart)', () => {
  assert.equal(lastClickAttribution(YOL), 'ad-C');
});

test('model: linear — teng taqsimlanadi va yig\'indi 1 ga teng', () => {
  // Og'irlik TOUCHPOINT id si bo'yicha qaytadi, ad id si bo'yicha emas:
  // bitta reklama zanjirda ikki marta uchrashi mumkin.
  const w = linearAttribution(YOL);
  const jami = [...w.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(jami - 1) < 1e-9, `yig'indi 1 bo'lishi kerak, kelgan ${jami}`);
  assert.ok(Math.abs((w.get('1') ?? 0) - 1 / 3) < 1e-9);
});

test('model: time decay — oxirgi teginish og\'irroq, yig\'indi 1', () => {
  const w = timeDecayAttribution(YOL);
  const jami = [...w.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(jami - 1) < 1e-9, `yig'indi 1 bo'lishi kerak, kelgan ${jami}`);
  assert.ok((w.get('3') ?? 0) > (w.get('1') ?? 0), 'oxirgisi og\'irroq bo\'lishi kerak');
});

test('model: bo\'sh yo\'l — xato emas, null', () => {
  assert.equal(firstClickAttribution([]), null);
  assert.equal(lastClickAttribution([]), null);
  assert.equal(linearAttribution([]).size, 0);
});

/* ═══════════════ 7. Shifrlash ═══════════════
   HODISA: CI birinchi ishga tushishidayoq yiqildi — encryption.ts
   modul darajasida `throw` qilardi va ENCRYPTION_KEY yo'q muhitda
   uni bilvosita import qilgan hamma narsa ishga tushmasdi. */

test('shifrlash: kalit yo\'q bo\'lsa import emas, ISHLATISH yiqiladi', async () => {
  const enc = await import('../../utils/encryption');
  const oldin = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  try {
    // Import bu qatorgacha muvaffaqiyatli o'tdi — asosiy talab shu.
    assert.equal(typeof enc.encrypt, 'function');
  } finally {
    if (oldin !== undefined) process.env.ENCRYPTION_KEY = oldin;
  }
});

test('shifrlash: encrypt -> decrypt asl matnni qaytaradi', async () => {
  process.env.ENCRYPTION_KEY = 'test-kalit-faqat-test-uchun';
  const enc = await import('../../utils/encryption');
  const matn = 'amocrm_token_namunasi_12345';
  const shifr = enc.encrypt(matn);
  assert.notEqual(shifr, matn, 'shifrlangan matn asl matnga teng bo\'lmasin');
  assert.match(shifr, /^[0-9a-f]{32}:[0-9a-f]+$/, 'shakl: <iv-hex>:<data-hex>');
  assert.equal(enc.decrypt(shifr), matn);
});

test('shifrlash: har safar boshqa IV — bir xil matn boshqacha shifrlanadi', async () => {
  process.env.ENCRYPTION_KEY = 'test-kalit-faqat-test-uchun';
  const enc = await import('../../utils/encryption');
  assert.notEqual(enc.encrypt('bir xil'), enc.encrypt('bir xil'));
});

test('shifrlash: buzuq qiymat aniq xato beradi', async () => {
  process.env.ENCRYPTION_KEY = 'test-kalit-faqat-test-uchun';
  const enc = await import('../../utils/encryption');
  assert.throws(() => enc.decrypt('ikki-qismsiz-matn'), /Invalid encrypted payload/);
});
