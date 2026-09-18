/**
 * Atribusiyani qaytadan hisoblash.
 *
 *   npm run attribution:rebuild            # eng katta workspace
 *   npm run attribution:rebuild <wsId>     # aniq workspace
 *
 * NEGA KERAK
 * `npm run seed:clean` demo lidlarni o'chiradi va ads/adsets/campaigns
 * dagi revenue, purchases_count, roas ustunlarini NOLGA qaytaradi.
 * Bu ustunlar atribusiya dvigatelining mulki: Facebook sync ularga
 * tegmaydi (CLAUDE.md — "One owner per column"). Ya'ni tozalashdan
 * keyin REAL lidlarning puli ham jadvalda 0 bo'lib qoladi, toki har
 * bir lid qayta ishlanmaguncha.
 *
 * Voronka sahifasi bundan zarar ko'rmaydi — u daromadni `leads`
 * jadvalidan o'qiydi. Dashboard jadvali esa `ads.revenue` dan o'qiydi,
 * shuning uchun tozalashdan keyin shu skript ishga tushirilishi kerak.
 *
 * XAVFSIZ: faqat hisob-kitob. CRM ga hech narsa yozmaydi, lid
 * o'chirmaydi. Qayta ishga tushirish ham xavfsiz — recomputeAdMetrics
 * mutlaq qayta hisob (delta emas), natija bir xil chiqadi.
 */
import { pool } from '../db/pool';
import { processLeadAttribution } from '../services/attributionEngine';

/** Eng ko'p ad'i bor workspace — seed-demo bilan bir xil tanlov. */
async function workspaceTop(): Promise<string | null> {
  const { rows } = await pool.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM ads GROUP BY workspace_id ORDER BY COUNT(*) DESC LIMIT 1`
  );
  return rows[0]?.workspace_id ?? null;
}

async function main(): Promise<void> {
  const workspaceId = process.argv[2] ?? (await workspaceTop());
  if (!workspaceId) {
    console.log('⚠ Workspace topilmadi.');
    return;
  }
  console.log(`Workspace: ${workspaceId}`);

  // Faqat pul keltirgan lidlar: ads.revenue shulardan yig'iladi.
  // Demo lidlar allaqachon o'chgan bo'lsa ham, ehtiyot uchun filtr.
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM leads
      WHERE workspace_id = $1
        AND status = 'won'
        AND COALESCE(is_demo, false) = false
      ORDER BY won_at ASC NULLS LAST`,
    [workspaceId]
  );

  if (rows.length === 0) {
    console.log('Yutilgan real lid yo\'q — qayta hisoblash shart emas.');
    return;
  }

  console.log(`${rows.length} ta yutilgan lid qayta hisoblanadi...`);

  let ok = 0;
  let xato = 0;
  for (const [i, lead] of rows.entries()) {
    try {
      await processLeadAttribution(lead.id, workspaceId);
      ok += 1;
    } catch (err) {
      // Bitta lid qolganlarini to'xtatmasin.
      xato += 1;
      console.error(`  lid ${lead.id}: ${(err as Error).message}`);
    }
    // Uzoq jarayonda jim turmasin.
    if ((i + 1) % 200 === 0) console.log(`  ${i + 1} / ${rows.length}`);
  }

  console.log(`✅ Tayyor: ${ok} ta hisoblandi, ${xato} ta xato.`);
  console.log('   ads/adsets/campaigns: revenue, purchases_count, roas qayta yozildi.');
}

main()
  .catch((err) => {
    console.error('❌ Xato:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
