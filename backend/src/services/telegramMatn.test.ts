import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  METRIKA_KALITLARI,
  STANDART_METRIKALAR,
  esc,
  hisobotMatni,
  metrikalarniTozala,
  pulFormat,
  qisqart,
  sonFormat,
  sotuvMatni,
  type HisobotMalumot,
} from './telegramMatn';
import { davrOraligi, sanaMahalliy } from './telegramHisobot';

/* ═══════════════════════════════════════════════════════════════════════
   Toza funksiyalar — bazasiz va tarmoqsiz.

   Bu yerdagi eng qimmat xato: hisobotda noto'g'ri raqam. Dashboarddagi
   xatoni odam ko'zi bilan tekshiradi, telegramdagini — yo'q.
   ═══════════════════════════════════════════════════════════════════════ */

const BOSH: HisobotMalumot = {
  sarf: 0,
  korishlar: 0,
  bosishlar: 0,
  lidlar: 0,
  sifatli: 0,
  sotuvlar: 0,
  daromad: 0,
  dealTimeOrtacha: null,
  fbValyuta: 'USD',
  crmValyuta: 'UZS',
  sarfCrmda: null,
  valyutaSababi: null,
  fbLidlar: 0,
};

/* ---- formatlash ---- */

test('son probel bilan guruhlanadi', () => {
  assert.equal(sonFormat(1234567), '1 234 567');
  assert.equal(sonFormat(999), '999');
  assert.equal(sonFormat(0), '0');
});

test('UZS da tiyin yo‘q, USD da bor', () => {
  assert.equal(pulFormat(39000000, 'UZS'), '39 000 000 UZS');
  assert.equal(pulFormat(13.294, 'USD'), '13.29 USD');
});

test('HTML belgilari ekranlanadi — reklama nomi xabarni buzmaydi', () => {
  assert.equal(esc('A & B <video>'), 'A &amp; B &lt;video&gt;');
});

test('uzun nom qisqaradi, bo‘sh nom "(nomsiz)" bo‘ladi', () => {
  assert.equal(qisqart('abcdefghij', 5), 'abcd…');
  assert.equal(qisqart('   ', 10), '(nomsiz)');
});

/* ---- metrika tanlovi ---- */

test('noma\'lum kalit tashlanadi', () => {
  assert.deepEqual(metrikalarniTozala(['sarf', 'yo_q_metrika', 'roas']), ['sarf', 'roas']);
});

test('bo‘sh tanlov standart ro‘yxatga tushadi — hisobot bo‘sh ketmaydi', () => {
  assert.deepEqual(metrikalarniTozala([]), STANDART_METRIKALAR);
  assert.deepEqual(metrikalarniTozala(null), STANDART_METRIKALAR);
});

test('tartib katalogdan olinadi, tanlash tartibidan emas', () => {
  // Foydalanuvchi ROAS ni birinchi bosdi — baribir voronka tartibi.
  assert.deepEqual(metrikalarniTozala(['roas', 'lidlar', 'sarf']), [
    'sarf',
    'lidlar',
    'roas',
  ]);
});

test('standart metrikalarning hammasi katalogda bor', () => {
  for (const k of STANDART_METRIKALAR) {
    assert.ok(METRIKA_KALITLARI.includes(k), `katalogda yo'q: ${k}`);
  }
});

/* ---- hisobot matni ---- */

function matn(d: Partial<HisobotMalumot>, metrikalar = STANDART_METRIKALAR): string {
  return hisobotMatni({
    akkaunt: 'IMD',
    davrNomi: 'Kecha',
    since: '2026-09-21',
    until: '2026-09-21',
    metrikalar,
    malumot: { ...BOSH, ...d },
    tafsilotSarlavha: null,
    tafsilot: [],
  });
}

test('nolga bo‘linish — chiziqcha, nol emas', () => {
  // ⚠ 0 lid bo'lsa CPL "0.00 USD" emas. Nol narx "reklama tekin lid
  // berdi" degani bo'lardi; chiziqcha "hisoblab bo'lmaydi".
  const m = matn({ sarf: 100, lidlar: 0 });
  assert.match(m, /CPL: <b>—<\/b>/);
});

test('valyuta ajratilmasa ROAS ko‘rsatilmaydi', () => {
  // sarfCrmda === null => kurs yo'q
  const m = matn({ sarf: 100, daromad: 39000000, sarfCrmda: null });
  assert.match(m, /ROAS: <b>—<\/b>/);
});

test('kurs bo‘lsa ROAS daromad/sarf(CRM valyutada)', () => {
  const m = matn({ sarf: 100, daromad: 3_000_000, sarfCrmda: 1_200_000 });
  assert.match(m, /ROAS: <b>2\.50x<\/b>/);
});

test('xarajat FB valyutasida, daromad CRM valyutasida yoziladi', () => {
  const m = matn({ sarf: 13.29, daromad: 39000000, sarfCrmda: 160000 });
  assert.match(m, /Sarf: <b>13\.29 USD<\/b>/);
  assert.match(m, /Daromad: <b>39 000 000 UZS<\/b>/);
});

test('FB va CRM lid tafovuti ko‘rsatiladi (§7 majburiy)', () => {
  const m = matn({ fbLidlar: 50, lidlar: 34 });
  assert.match(m, /FB: 50 lid/);
  assert.match(m, /CRM: 34/);
  assert.match(m, /-16/);
});

test('tafovut nol bo‘lsa ogohlantirish yo‘q — shovqin qilmaydi', () => {
  const m = matn({ fbLidlar: 34, lidlar: 34 });
  assert.ok(!m.includes('tafovut'));
});

/* ---- sotuv xabari ---- */

test('sotuv xabarida kampaniya, guruh, reklama va summa bor', () => {
  const m = sotuvMatni({
    akkaunt: 'IMD',
    summa: 39000000,
    valyuta: 'UZS',
    kampaniya: 'Klinika — Lidlar',
    guruh: 'Toshkent 25-45',
    reklama: 'klinika bir yil bo‘lmasdan ahvol video',
    crmLeadId: '60338775',
    dealTimeKun: 14,
    moslikUsuli: 'lead_id',
  });
  assert.match(m, /39 000 000 UZS/);
  assert.match(m, /Klinika — Lidlar/);
  assert.match(m, /Toshkent 25-45/);
  assert.match(m, /klinika bir yil/);
  assert.match(m, /Meta Lead ID/);
  assert.match(m, /14 kun/);
});

test('reklama topilmasa yolg‘on yozilmaydi', () => {
  const m = sotuvMatni({
    akkaunt: 'IMD',
    summa: 1000,
    valyuta: 'UZS',
    kampaniya: null,
    guruh: null,
    reklama: null,
    crmLeadId: '1',
    dealTimeKun: null,
    moslikUsuli: null,
  });
  assert.match(m, /Reklama aniqlanmadi/);
  assert.ok(!m.includes('Kampaniya:'));
});

/* ---- davr oralig'i ---- */

test('kecha — bitta kun, bugundan bir kun oldin', () => {
  assert.deepEqual(davrOraligi('kecha', '2026-09-22'), {
    since: '2026-09-21',
    until: '2026-09-21',
    nomi: 'Kecha',
  });
});

test('oy chegarasida kecha to‘g‘ri hisoblanadi', () => {
  assert.equal(davrOraligi('kecha', '2026-03-01').since, '2026-02-28');
});

test('7kun — kechagacha, bugunni qo‘shmaydi', () => {
  const r = davrOraligi('7kun', '2026-09-22');
  assert.equal(r.since, '2026-09-15');
  assert.equal(r.until, '2026-09-21');
});

test('noma\'lum davr — kechaga tushadi, yiqilmaydi', () => {
  assert.equal(davrOraligi('allambalo', '2026-09-22').nomi, 'Kecha');
});

test('mahalliy sana vaqt zonasi bo‘yicha o‘zgaradi', () => {
  // 2026-09-21 21:00 UTC = Toshkentda 2026-09-22 02:00
  const d = new Date('2026-09-21T21:00:00Z');
  assert.equal(sanaMahalliy(d, 'UTC'), '2026-09-21');
  assert.equal(sanaMahalliy(d, 'Asia/Tashkent'), '2026-09-22');
});
