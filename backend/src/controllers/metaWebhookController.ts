/* ═══════════════════════════════════════════════════════════════════════
   META WEBHOOK — leadgen (Lead Ads formasi to'ldirildi)

   GET  /api/webhooks/meta  — Meta obunani tasdiqlaydi:
        hub.mode=subscribe & hub.verify_token=<META_WEBHOOK_VERIFY_TOKEN>
        → hub.challenge ni qaytaramiz.
   POST /api/webhooks/meta  — hodisa. `X-Hub-Signature-256` FB_APP_SECRET
        bilan tekshiriladi (xom tana kerak — app.ts dagi `verify`).

   Meta 2xx'ni tez kutadi va non-2xx da qayta yuboradi. Shuning uchun
   amoCRM webhook'idagi kabi: ishni deadline gacha kutamiz, ulgurmasa
   fonda davom etadi (waitUntil), javob baribir 200.
   ═══════════════════════════════════════════════════════════════════════ */
import { Request, Response } from 'express';
import { imzoTogrimi, leadgenHodisalari, leadgenniQaytaIshla } from '../services/metaSahifalar';
import { processLeadAttribution } from '../services/attributionEngine';
import { awaitWithDeadline } from '../utils/background';
import { xatoQayd } from '../utils/xatolar';

const DEADLINE_MS = 8000;

export function metaWebhookTasdiq(req: Request, res: Response): void {
  const q = req.query as Record<string, string | undefined>;
  const kutilgan = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (q['hub.mode'] === 'subscribe' && kutilgan && q['hub.verify_token'] === kutilgan) {
    res.status(200).type('text/plain').send(q['hub.challenge'] ?? '');
    return;
  }
  res.sendStatus(403);
}

export async function metaWebhook(req: Request, res: Response): Promise<void> {
  const xom = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!imzoTogrimi(xom, req.header('x-hub-signature-256'), process.env.FB_APP_SECRET)) {
    res.sendStatus(401);
    return;
  }

  const hodisalar = leadgenHodisalari(req.body);
  if (!hodisalar.length) {
    res.status(200).json({ ok: true, hodisa: 0 });
    return;
  }

  const ish = (async () => {
    for (const h of hodisalar) {
      try {
        const n = await leadgenniQaytaIshla(h, (leadId, workspaceId) =>
          processLeadAttribution(leadId, workspaceId)
        );
        console.log(
          `meta leadgen ${h.leadgenId}: ${n.workspacelar} workspace, ${n.boglandi} CRM lid bog'landi`
        );
      } catch (err) {
        xatoQayd(err, { joy: 'meta-leadgen', qoshimcha: { leadgenId: h.leadgenId } });
      }
    }
  })();

  const { finished } = await awaitWithDeadline(ish, DEADLINE_MS, 'meta leadgen');
  res.status(200).json({ ok: true, hodisa: hodisalar.length, processed: finished });
}
