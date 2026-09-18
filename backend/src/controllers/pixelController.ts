import { Request, Response } from 'express';
import crypto from 'crypto';
import { recordTouchpoint } from '../services/attributionEngine';
import { hashPhone, hashEmail } from '../services/amocrmService';
import { pool } from '../db/pool';
import { pikselCheklovi } from '../utils/pixelThrottle';

// 1x1 transparent GIF.
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const VALID_EVENTS = ['view', 'click', 'lead', 'purchase'] as const;
type EventType = (typeof VALID_EVENTS)[number];

// Cheklov endi `utils/pixelThrottle.ts` da: xotira tez yo'l sifatida,
// baza esa hamma funksiya nusxasi uchun yagona haqiqat. Sabab u yerda
// yozilgan — qisqasi: serverless'da xotiradagi hisoblagich to'smaydi.

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex');
}

/**
 * Workspace'ning telefon mamlakat kodi (§3.1 — kodda qotirilmaydi).
 * Qiymat kamdan-kam o'zgaradi, shuning uchun 5 daqiqaga eslab qolinadi;
 * so'rov faqat piksel telefon yuborganda ketadi.
 */
const CC_TTL_MS = 5 * 60_000;
const ccCache = new Map<string, { value: string; expiresAt: number }>();

async function phoneCountryCode(workspaceId: string): Promise<string> {
  const hit = ccCache.get(workspaceId);
  if (hit && Date.now() < hit.expiresAt) return hit.value;
  try {
    const { rows } = await pool.query<{ cc: string }>(
      `SELECT COALESCE(phone_country_code, '998') AS cc FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    const value = rows[0]?.cc ?? '998';
    ccCache.set(workspaceId, { value, expiresAt: Date.now() + CC_TTL_MS });
    return value;
  } catch {
    // Piksel yo'li hech qachon xato qaytarmaydi — standartga tushamiz.
    return '998';
  }
}

// ---- POST /api/pixel/event (public, called from customer sites) ----
// Always responds 200 — tracking must never break a customer's page.
export async function trackEvent(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body ?? {};
    const workspaceId: string | undefined = body.workspaceId;
    const eventType: EventType = VALID_EVENTS.includes(body.eventType)
      ? body.eventType
      : 'view';

    if (!workspaceId) {
      res.status(200).json({ success: true, eventId: null });
      return;
    }

    const cheklov = await pikselCheklovi(workspaceId);
    if (cheklov.bloklandi) {
      // 200 qaytaramiz: piksel mijoz saytida xato ko'rsatmasligi kerak.
      res.status(200).json({ success: true, eventId: null, rateLimited: true });
      return;
    }

    // Hash PII immediately — raw email/phone/IP are never stored.
    const emailHash = body.email ? hashEmail(String(body.email)) : null;
    // Mamlakat kodi konfiguratsiyadan (§3.1). Qo'shimcha so'rov faqat
    // telefon kelganda ketadi — piksel yo'li tez qolishi kerak.
    const phoneHash = body.phone
      ? hashPhone(String(body.phone), await phoneCountryCode(workspaceId))
      : null;
    const ipHash = hashIp((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip);
    const fbEventId = `evt_${crypto.randomUUID()}`;

    await recordTouchpoint({
      workspaceId,
      eventType,
      fbclid: body.fbclid ?? null,
      adId: body.adId ?? null,
      adsetId: body.adsetId ?? null,
      campaignId: body.campaignId ?? null,
      fbEventId,
      ipHash,
      userAgent: req.headers['user-agent'] ?? null,
      emailHash,
      phoneHash,
    });

    res.status(200).json({ success: true, eventId: fbEventId });
  } catch (err) {
    // Swallow all errors — the client must still get a 200.
    console.error('pixel trackEvent error:', (err as Error).message);
    res.status(200).json({ success: true, eventId: null });
  }
}

// ---- GET /api/pixel/script.js ----
export function script(req: Request, res: Response): void {
  const workspaceId = String(req.query.workspaceId || req.query.w || '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.headers.host || `localhost:${process.env.PORT || 4000}`;
  const endpoint = `${proto}://${host}/api/pixel/event`;

  const js = `(function(){
  var WS=${JSON.stringify(workspaceId)};
  var API=${JSON.stringify(endpoint)};
  var KEY="_ap_fbclid";
  function save(){try{var p=new URLSearchParams(location.search);var f=p.get("fbclid");if(f)sessionStorage.setItem(KEY,f);}catch(e){}}
  function fbclid(){try{return sessionStorage.getItem(KEY);}catch(e){return null;}}
  function track(eventType,data){
    data=data||{};
    var payload={workspaceId:WS,eventType:eventType,fbclid:fbclid(),
      adId:data.adId||null,adsetId:data.adsetId||null,campaignId:data.campaignId||null,
      email:data.email||null,phone:data.phone||null,value:data.value||null,currency:data.currency||null};
    try{
      var b=JSON.stringify(payload);
      if(navigator.sendBeacon){navigator.sendBeacon(API,new Blob([b],{type:"application/json"}));}
      else{fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:b,keepalive:true,mode:"cors"}).catch(function(){});}
    }catch(e){}
  }
  save();
  window.AttributionPixel={track:track,getFbclid:fbclid};
  track("view",{});
})();`;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(js);
}

// ---- GET /api/pixel/1x1.gif ----
export async function pixelGif(req: Request, res: Response): Promise<void> {
  const workspaceId = req.query.workspaceId ? String(req.query.workspaceId) : null;

  // Rasm DARHOL qaytariladi, hisob esa orqa fonda. GIF mijoz sahifasida
  // turadi — uni cheklov so'rovi kutib turmasligi kerak.
  if (workspaceId) {
    void pikselCheklovi(workspaceId)
      .then((cheklov) => {
        if (cheklov.bloklandi) return;
        const ipHash = hashIp(
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip
        );
        return recordTouchpoint({
          workspaceId,
          eventType: 'view',
          ipHash,
          userAgent: req.headers['user-agent'] ?? null,
        });
      })
      .catch((err) => console.error('pixel gif record error:', (err as Error).message));
  }

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.status(200).end(TRANSPARENT_GIF);
}
