import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taqsimotYig, nomXaritasi, type AmoVoronka } from './etapTaqsimoti';

/* ═══════════════════════════════════════════════════════════════════════
   Bu testlar FurniGlass akkauntining haqiqiy shaklidan olingan.

   To'rt voronka bor va to'rttasida ham `142` etapi mavjud, lekin
   ma'nosi har xil:
     Kvalifikatsiya  142 = "sotuvga o'tkazildi"  ← SOTUV EMAS
     Qayta sotuv     142 = "qayta sotuv"          ← daromad
     Sotib olganlar  142 = "otzif olindi"         ← SOTUV EMAS (sotuvdan keyin)
     guli            142 = "sotib oldi"           ← sotuv

   Ya'ni `142` ni sotuv deb sanash — daromadni bir necha barobar
   ko'rsatish demak. Shakl bo'yicha hukm chiqarib bo'lmasligining
   aniq isboti.
   ═══════════════════════════════════════════════════════════════════════ */

const VORONKALAR: AmoVoronka[] = [
  {
    id: 6953126,
    name: 'Kvalifikatsiya',
    _embedded: {
      statuses: [
        { id: 58450306, name: 'Lidlar' },
        { id: 71760434, name: 'uchrashuv belgilandi' },
        { id: 142, name: "sotuvga o'tkazildi" },
      ],
    },
  },
  {
    id: 8611862,
    name: 'Sotib olganlar',
    _embedded: { statuses: [{ id: 142, name: 'otzif olindi' }] },
  },
  {
    id: 10742882,
    name: 'guli',
    _embedded: { statuses: [{ id: 142, name: 'sotib oldi' }] },
  },
];

const BOSH = { yutildi: [], sifatli: [], yangi: [] } as {
  yutildi: string[];
  sifatli: string[];
  yangi: string[];
};

test('bir xil 142 turli voronkada turli nom oladi', () => {
  const { etapNomi } = nomXaritasi(VORONKALAR);
  assert.equal(etapNomi.get('6953126:142'), "sotuvga o'tkazildi");
  assert.equal(etapNomi.get('8611862:142'), 'otzif olindi');
  assert.equal(etapNomi.get('10742882:142'), 'sotib oldi');
});

test('juftlik kesimida soni va summa yig\'iladi', () => {
  const n = taqsimotYig(
    [
      { pipeline_id: 6953126, status_id: 142, price: 1000 },
      { pipeline_id: 6953126, status_id: 142, price: 500 },
      { pipeline_id: 10742882, status_id: 142, price: 7000 },
    ],
    VORONKALAR,
    BOSH
  );
  assert.equal(n.jami_lid, 3);
  assert.equal(n.jami_summa, 8500);
  const kval = n.qatorlar.find((q) => q.juftlik === '6953126:142');
  assert.equal(kval?.soni, 2);
  assert.equal(kval?.summa, 1500);
});

test("eng ko'p pul turgan etap tepada", () => {
  const n = taqsimotYig(
    [
      { pipeline_id: 6953126, status_id: 142, price: 100 },
      { pipeline_id: 10742882, status_id: 142, price: 9000 },
    ],
    VORONKALAR,
    BOSH
  );
  assert.equal(n.qatorlar[0].juftlik, '10742882:142');
});

test("bo'sh won_pairs — aniq ogohlantirish", () => {
  const n = taqsimotYig([{ pipeline_id: 6953126, status_id: 142, price: 100 }], VORONKALAR, BOSH);
  assert.ok(n.ogohlantirishlar.some((o) => o.includes('belgilanmagan')));
});

test("belgilangan etapda 0 pul, boshqa joyda bor — ogohlantiradi", () => {
  const n = taqsimotYig(
    [
      { pipeline_id: 6953126, status_id: 71760434, price: 0 },
      { pipeline_id: 10742882, status_id: 142, price: 5000 },
    ],
    VORONKALAR,
    { yutildi: ['6953126:71760434'], sifatli: [], yangi: [] }
  );
  assert.ok(n.ogohlantirishlar.some((o) => o.includes('0 pul turibdi')));
});

test("amoCRM 142 deydi, biz sotuv demaymiz — ogohlantiriladi", () => {
  const n = taqsimotYig(
    [{ pipeline_id: 10742882, status_id: 142, price: 5000 }],
    VORONKALAR,
    { yutildi: ['6953126:71760434'], sifatli: [], yangi: [] }
  );
  assert.ok(n.ogohlantirishlar.some((o) => o.includes('sotib oldi') && o.includes('YUTILDI')));
});

test("biz sotuv deymiz, amoCRM yakuniy etap demaydi — ogohlantiriladi", () => {
  const n = taqsimotYig(
    [{ pipeline_id: 6953126, status_id: 71760434, price: 5000 }],
    VORONKALAR,
    { yutildi: ['6953126:71760434'], sifatli: [], yangi: [] }
  );
  assert.ok(
    n.ogohlantirishlar.some(
      (o) => o.includes('uchrashuv belgilandi') && o.includes('haqiqatan sotuvmi')
    )
  );
});

test("qamrov 30% dan past bo'lsa ogohlantiradi", () => {
  const n = taqsimotYig(
    [
      { pipeline_id: 6953126, status_id: 71760434, price: 1000 },
      { pipeline_id: 10742882, status_id: 142, price: 9000 },
    ],
    VORONKALAR,
    { yutildi: ['6953126:71760434'], sifatli: [], yangi: [] }
  );
  assert.ok(n.ogohlantirishlar.some((o) => o.includes('10% ini qamrab')));
});

test("noma'lum voronka yo'qolmaydi — ko'rinadi", () => {
  const n = taqsimotYig([{ pipeline_id: 999, status_id: 5, price: 10 }], VORONKALAR, BOSH);
  assert.equal(n.qatorlar[0].voronka, "(noma'lum voronka 999)");
});

test('narx null/matn bo\'lsa 0 deb sanaladi, NaN emas', () => {
  const n = taqsimotYig(
    [
      { pipeline_id: 6953126, status_id: 142, price: null },
      { pipeline_id: 6953126, status_id: 142 },
    ],
    VORONKALAR,
    BOSH
  );
  assert.equal(n.jami_summa, 0);
  assert.equal(n.qatorlar[0].soni, 2);
});

test("voronkasiz lid ham sanaladi — jimgina tashlanmaydi", () => {
  const n = taqsimotYig([{ price: 100 }], VORONKALAR, BOSH);
  assert.equal(n.jami_lid, 1);
  assert.equal(n.qatorlar[0].juftlik, '?:?');
});
