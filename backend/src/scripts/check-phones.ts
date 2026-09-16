/**
 * Diagnostika: amoCRM kontaktlaridagi telefon raqamlari qanday
 * formatda saqlanganini ko'rish va normalizatsiya ularni E.164 ga
 * keltira olishini tekshirish.
 *
 * ⚠ Raqamning O'ZI hech qachon chop etilmaydi — faqat "shakli"
 * (uzunlik, prefiks) va normalizatsiya natijasi ha/yo'q.
 *
 * Ishga tushirish:
 *   cd backend && npx ts-node src/scripts/check-phones.ts <workspaceId> [limit]
 *
 * Natija shunday ko'rinadi:
 *   Tekshirildi: 250 ta kontakt, 243 ta telefon
 *   ✅ E.164 ga keldi: 241 (99.2%)
 *   ❌ Kelmadi:          2 (0.8%)
 *   Shakllar:
 *     +/len12/998     198
 *     raw/len9/other   43
 *     raw/len3/other    2   ← bular normalizatsiya qilinmadi
 */
import 'dotenv/config';
import { pool } from '../db/pool';
import { getContact } from '../services/amocrmService';
import { normalizePhoneE164, phoneShape } from '../utils/phone';

interface AmoContactRow {
  id: number;
}

async function main(): Promise<void> {
  const workspaceId = process.argv[2];
  const limit = Number(process.argv[3] ?? 250);

  if (!workspaceId) {
    console.error('Ishlatish: npx ts-node src/scripts/check-phones.ts <workspaceId> [limit]');
    process.exit(1);
  }

  const { rows } = await pool.query<{
    amocrm_domain: string | null;
    cc: string;
  }>(
    `SELECT amocrm_domain, COALESCE(phone_country_code, '998') AS cc
       FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const ws = rows[0];
  if (!ws) throw new Error('Workspace topilmadi');
  if (!ws.amocrm_domain) throw new Error('Bu workspace amoCRM ga ulanmagan');

  console.log(`Workspace: ${workspaceId}`);
  console.log(`amoCRM:    ${ws.amocrm_domain}`);
  console.log(`Mamlakat kodi: +${ws.cc}\n`);

  // Kontakt ID larini lidlardan olamiz — alohida ro'yxat endpointi kerak emas.
  const { rows: leadRows } = await pool.query<{ crm_contact_id: string }>(
    `SELECT DISTINCT crm_contact_id
       FROM leads
      WHERE workspace_id = $1 AND crm_contact_id IS NOT NULL
      ORDER BY crm_contact_id DESC
      LIMIT $2`,
    [workspaceId, limit]
  );

  if (!leadRows.length) {
    console.log('Bu workspace da kontaktli lid yo\'q — hali webhook kelmagan bo\'lishi mumkin.');
    return;
  }

  const shapes = new Map<string, number>();
  const failedShapes = new Map<string, number>();
  let phones = 0;
  let ok = 0;

  for (const row of leadRows) {
    let info: { phone: string | null };
    try {
      info = await getContact(workspaceId, row.crm_contact_id);
    } catch (err) {
      console.error(`kontakt ${row.crm_contact_id} o'qilmadi:`, (err as Error).message);
      continue;
    }
    if (!info.phone) continue;
    phones++;

    const shape = phoneShape(info.phone, ws.cc);
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);

    if (normalizePhoneE164(info.phone, ws.cc)) ok++;
    else failedShapes.set(shape, (failedShapes.get(shape) ?? 0) + 1);
  }

  const pct = (n: number) => (phones ? ((n / phones) * 100).toFixed(1) : '0.0');

  console.log(`Tekshirildi: ${leadRows.length} ta kontakt, ${phones} ta telefon`);
  console.log(`✅ E.164 ga keldi: ${ok} (${pct(ok)}%)`);
  console.log(`❌ Kelmadi:        ${phones - ok} (${pct(phones - ok)}%)\n`);
  console.log('Shakllar:');
  for (const [shape, count] of [...shapes].sort((a, b) => b[1] - a[1])) {
    const mark = failedShapes.has(shape) ? '   ← normalizatsiya qilinmadi' : '';
    console.log(`  ${shape.padEnd(18)} ${String(count).padStart(4)}${mark}`);
  }

  if (phones && ok / phones < 0.9) {
    console.log(
      '\n⚠ 10% dan ortiq raqam E.164 ga kelmadi — Meta match rate past bo\'ladi.\n' +
        '  utils/phone.ts dagi qoidalarni yuqoridagi shakllarga qarab to\'g\'irlang.'
    );
  }
}

main()
  .catch((err) => {
    console.error('Xato:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
