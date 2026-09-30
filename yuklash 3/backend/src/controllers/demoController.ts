import { Request, Response } from 'express';
import { DemoRadEtildi, demoOchir, demoYarat } from '../services/demoWorkspace';

/** POST /api/workspace/demo — bo'sh workspace'ni namunaviy ma'lumot bilan to'ldiradi. */
export async function yarat(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    res.json({ success: true, ...(await demoYarat(workspaceId)) });
  } catch (err) {
    if (err instanceof DemoRadEtildi) {
      res.status(409).json({ error: err.message });
      return;
    }
    console.error('demo yaratish xatosi:', (err as Error).message);
    res.status(500).json({ error: "Demo ma'lumot yaratilmadi. Qayta urinib ko'ring." });
  }
}

/** DELETE /api/workspace/demo — faqat demo qatorlarni o'chiradi. */
export async function ochir(req: Request, res: Response): Promise<void> {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    res.json({ success: true, ochirildi: await demoOchir(workspaceId) });
  } catch (err) {
    console.error('demo ochirish xatosi:', (err as Error).message);
    res.status(500).json({ error: "Demo o'chirilmadi. Qayta urinib ko'ring." });
  }
}
