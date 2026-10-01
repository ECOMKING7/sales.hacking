import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kanalAniqla, actionSourceFor, externalIdOf } from './metaCapi';

/* Kanal → action_source. Xato tanlov Meta'da konversiyani noto'g'ri
   turga yozadi; `website` esa user_agent'siz RAD etiladi. */

const bosh = { fb_lead_id: null, source_line: null, fbclid: null, utm_source: null };

test('kanal: Lead ID — forma (boshqa belgilar bo\'lsa ham)', () => {
  assert.equal(kanalAniqla({ ...bosh, fb_lead_id: '1397022212571979', fbclid: 'x', source_line: '998712000000' }), 'forma');
});

test('kanal: liniya — qo\'ng\'iroq; reklama liniyalari sozlangan bo\'lsa faqat o\'shalar', () => {
  assert.equal(kanalAniqla({ ...bosh, source_line: '998712000000' }), 'qongiroq');
  assert.equal(kanalAniqla({ ...bosh, source_line: '998712000000' }, ['998712000000']), 'qongiroq');
  assert.equal(kanalAniqla({ ...bosh, source_line: '998719999999' }, ['998712000000']), 'boshqa');
});

test('kanal: fbclid yoki UTM — sayt; hech narsa — boshqa', () => {
  assert.equal(kanalAniqla({ ...bosh, fbclid: 'IwAR' }), 'sayt');
  assert.equal(kanalAniqla({ ...bosh, utm_source: 'fb' }), 'sayt');
  assert.equal(kanalAniqla(bosh), 'boshqa');
});

test('action_source: faqat qo\'ng\'iroq phone_call; sayt website EMAS (user_agent yo\'q)', () => {
  assert.equal(actionSourceFor('forma'), 'system_generated');
  assert.equal(actionSourceFor('qongiroq'), 'phone_call');
  assert.equal(actionSourceFor('sayt'), 'system_generated');
  assert.equal(actionSourceFor('boshqa'), 'system_generated');
});

test('external_id: kontakt bo\'yicha barqaror, workspace bo\'yicha ajralgan, xom ID chiqmaydi', () => {
  const a = externalIdOf('ws1', { id: 'u1', crm_lead_id: '100', crm_contact_id: '555' });
  const b = externalIdOf('ws1', { id: 'u2', crm_lead_id: '101', crm_contact_id: '555' });
  const c = externalIdOf('ws2', { id: 'u1', crm_lead_id: '100', crm_contact_id: '555' });
  assert.equal(a, b, 'bir odamning ikki lidi — bitta external_id');
  assert.notEqual(a, c, 'boshqa workspace — boshqa external_id');
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.ok(!a.includes('555'));
});
