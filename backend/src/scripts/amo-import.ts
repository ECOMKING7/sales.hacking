/**
 * amoCRM tarixini import qilish.
 *
 *   npm run amo:import                      # eng katta workspace, butun tarix
 *   npm run amo:import -- --days=90         # oxirgi 90 kun
 *   npm run amo:import -- <workspaceId>     # aniq workspace
 *
 * ⚠ E'tibor: npm argumentlarni `--` dan keyin uzatadi.
 * ⚠ Buyruq yoniga izoh (#) yozmang — zsh uni argument qilib yuboradi.
 *
 * amoCRM ga faqat O'QISH so'rovi ketadi (GET). Yozish bizning bazaga.
 */
import { pool } from '../db/pool';
import { importAmoLeads } from '../services/amocrmImport';

function wsArgOrThrow(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID.test(v.trim())) return v.trim();
  throw new Error(`Workspace ID noto'g'ri: "${v}". UUID kutilgan.`);
}

/** amoCRM ulangan, eng ko'p lid/ad'i bor workspace. */
async function workspaceTop(): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM workspaces
      WHERE amocrm_access_token IS NOT NULL AND amocrm_domain IS NOT NULL
      ORDER BY created_at ASC LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const kunlarArg = args.find((a) => a.startsWith('--days='));
  const kunlar = kunlarArg ? Number(kunlarArg.split('=')[1]) : undefined;
  const wsArg = wsArgOrThrow(args.find((a) => !a.startsWith('--')));

  const workspaceId = wsArg ?? (await workspaceTop());
  if (!workspaceId) {
    console.log('⚠ amoCRM ulangan workspace topilmadi.');
    return;
  }

  console.log(`Workspace: ${workspaceId}`);
  console.log(`Davr: ${kunlar && kunlar > 0 ? `oxirgi ${kunlar} kun` : 'butun tarix'}`);
  console.log('');

  const boshlandi = Date.now();
  const n = await importAmoLeads(workspaceId, kunlar, (s) => console.log(s));
  const sekund = ((Date.now() - boshlandi) / 1000).toFixed(1);

  console.log('');
  console.log('✅ Import tugadi');
  console.log(`   lidlar:        ${n.lidlar}  (yangilangan: ${n.yangilangan})`);
  console.log(`   sifatli:       ${n.sifatli}`);
  console.log(`   yutilgan:      ${n.yutilgan}`);
  console.log(`   kontaktlar:    ${n.kontaktlar}`);
  console.log(`   amoCRM so'rov: ${n.sorovlar}`);
  console.log(`   xatolar:       ${n.xatolar}`);
  console.log(`   vaqt:          ${sekund}s`);
}

main()
  .catch((err) => {
    console.error('❌ Import bajarilmadi:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
