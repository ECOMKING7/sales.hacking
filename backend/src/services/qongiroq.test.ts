import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qongiroqKampaniyasi, xaritaniTozala } from './qongiroq';
import { kanalAniqla, actionSourceFor } from './metaCapi';

/* 046: qo'ng'iroq voronkasi → call kampaniya. */

const GULI = '7712345';
const KAMP = '120210000000000001';
const xarita = { [GULI]: KAMP };

test("qo'ng'iroq: xaritadagi voronkada yaratilgan lid — kampaniya qaytadi", () => {
  assert.equal(qongiroqKampaniyasi(GULI, xarita), KAMP);
  assert.equal(qongiroqKampaniyasi(Number(GULI) as unknown as string, xarita), KAMP);
});

test("qo'ng'iroq: boshqa voronka yoki voronka noma'lum — null", () => {
  assert.equal(qongiroqKampaniyasi('999', xarita), null);
  assert.equal(qongiroqKampaniyasi(null, xarita), null);
  assert.equal(qongiroqKampaniyasi(GULI, {}), null);
});

test("qo'ng'iroq: kuchliroq kalit bor — bu qo'ng'iroq EMAS (forma/sayt lidi shu voronkada ochilgan)", () => {
  assert.equal(qongiroqKampaniyasi(GULI, xarita, { fbLeadId: '1397022212571979' }), null);
  assert.equal(qongiroqKampaniyasi(GULI, xarita, { fbclid: 'IwAR0abc' }), null);
  assert.equal(qongiroqKampaniyasi(GULI, xarita, { utmSource: 'fb' }), null);
  assert.equal(qongiroqKampaniyasi(GULI, xarita, { fbLeadId: null, fbclid: null, utmSource: null }), KAMP);
});

test("xarita tozalash: faqat raqamli ID juftliklari qoladi", () => {
  assert.deepEqual(
    xaritaniTozala({ [GULI]: KAMP, ' 55 ': 66, abc: '1', '7': 'xyz', '8': null }),
    { [GULI]: KAMP, '55': '66' }
  );
  assert.deepEqual(xaritaniTozala(null), {});
  assert.deepEqual(xaritaniTozala([1, 2]), {});
  assert.deepEqual(xaritaniTozala('{"1":"2"}'), {});
});

test("CAPI kanal: lid kanali 'qongiroq' — phone_call (boshqa belgilardan ustun)", () => {
  const bosh = { fb_lead_id: null, source_line: null, fbclid: null, utm_source: null };
  assert.equal(kanalAniqla({ ...bosh, kanal: 'qongiroq' }), 'qongiroq');
  assert.equal(actionSourceFor(kanalAniqla({ ...bosh, kanal: 'qongiroq' })), 'phone_call');
  // Kanal yo'q — eski xulq o'zgarmagan
  assert.equal(kanalAniqla({ ...bosh, kanal: null }), 'boshqa');
  assert.equal(kanalAniqla({ ...bosh }), 'boshqa');
});
