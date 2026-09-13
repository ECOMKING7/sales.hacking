# Vercel'ga deploy — qadamma-qadam

Ikkala qism ham Vercel'da, bepul (Hobby). Railway varianti `DEPLOYMENT.md` da qoladi.

```
GitHub repo
   ├──► Vercel loyiha 1: attribution-frontend   (Root Directory: frontend)
   └──► Vercel loyiha 2: attribution-api        (Root Directory: backend)
                              ▲
   cron-job.org ──────────────┘  har 15 daq → GET /api/sync/cron
   amoCRM webhook ────────────┘  sotuv bo'lganda → real vaqtda
```

**⚠ Vercel Hobby faqat notijorat loyihalar uchun.** Mijozlarga sota boshlasangiz
Pro ($20/oy) ga o'tish shart.

---

## 0. Push

```bash
cd ~/Desktop/attribution-platform
git push origin main
```

---

## 1. Supabase — transaction pooler'ga o'tish

**Bu qadam o'tkazib yuborilsa, platforma bir necha so'rovdan keyin javob bermay qoladi.**

Serverless'da har sovuq start yangi DB ulanishi ochadi. Session pooler (port 5432)
ulanishni butun sessiya davomida ushlab turadi → limit tugaydi.

1. Supabase → **Project Settings → Database → Connection string**
2. **Transaction pooler** ni tanlang (port **6543**, `session` emas)
3. Nusxa oling, paroldagi maxsus belgilarni URL-encode qiling

```
postgresql://postgres.<ref>:<parol>@aws-0-<region>.pooler.supabase.com:6543/postgres
                                                                      ^^^^
```

Kod tomondan `src/db/pool.ts` o'zi `max: 1` ga tushadi (`VERCEL` env o'zgaruvchisini ko'rib).

---

## 2. Backend loyihasi (attribution-api)

Vercel → **Add New → Project** → repo → **Import**

| Sozlama | Qiymat |
|---|---|
| Root Directory | `backend` |
| Framework Preset | Other |
| Build Command | (bo'sh qoldiring) |
| Output Directory | (bo'sh qoldiring) |

`backend/vercel.json` barcha yo'llarni `api/index.ts` ga yo'naltiradi,
`maxDuration: 300`, `memory: 2048`.

### Environment Variables

Production uchun:

| Nomi | Qiymat |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | 1-qadamdagi **6543** portli satr |
| `PGSSL` | `true` |
| `JWT_SECRET` | 48+ tasodifiy belgi |
| `JWT_EXPIRES_IN` | `7d` |
| `BCRYPT_SALT_ROUNDS` | `12` |
| `ENCRYPTION_KEY` | 32+ tasodifiy belgi |
| `FRONTEND_URL` | frontend URL (3-qadamdan keyin to'ldiriladi) |
| `FB_APP_ID` | Facebook app ID |
| `FB_APP_SECRET` | Facebook app secret |
| `FB_REDIRECT_URI` | `https://<backend>.vercel.app/api/auth/facebook/callback` |
| `AMOCRM_CLIENT_ID` | amoCRM integratsiya ID |
| `AMOCRM_CLIENT_SECRET` | amoCRM secret |
| `AMOCRM_REDIRECT_URI` | `https://<backend>.vercel.app/api/auth/amocrm/callback` |
| `AMOCRM_WEBHOOK_SECRET` | tasodifiy satr |
| `CRON_SECRET` | tasodifiy satr (4-qadamda kerak) |

**`REDIS_URL` va `USE_REDIS` qo'yilmaydi** — serverless'da Bull navbati ishlamaydi,
sync inline ketadi. Kesh ham fail-soft, Redis'siz ishlaydi.

Tasodifiy satr generatsiya qilish:

```bash
openssl rand -base64 48
```

### Migratsiyalar

Vercel deploy paytida migratsiya ishga tushirmaydi. Bir marta lokal terminaldan:

```bash
cd backend
DATABASE_URL="<6543 portli satr>" PGSSL=true npm run migrate
```

### Tekshiruv

```bash
curl https://<backend>.vercel.app/health
# kutilgan: {"status":"ok","runtime":"vercel-serverless","timestamp":"..."}
```

`runtime` `vercel-serverless` bo'lishi shart. `node-server` chiqsa — `api/index.ts`
ishlatilmayapti, `vercel.json` yoki Root Directory noto'g'ri.

---

## 3. Frontend loyihasi (attribution-frontend)

Vercel → **Add New → Project** → shu repo → **Import**

| Sozlama | Qiymat |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

### Environment Variables

| Nomi | Qiymat |
|---|---|
| `VITE_API_URL` | `https://<backend>.vercel.app` |

Deploy bo'lgach, backend loyihasiga qaytib `FRONTEND_URL` ni frontend URL'iga
to'ldiring va **Redeploy** qiling (CORS shunga bog'liq).

---

## 4. Cron — har 15 daqiqada sync

Vercel Hobby cron'i kuniga 1 marta. Shuning uchun tetik tashqaridan.

[cron-job.org](https://cron-job.org) → **Create cronjob**:

| Maydon | Qiymat |
|---|---|
| Title | Attribution FB sync |
| URL | `https://<backend>.vercel.app/api/sync/cron` |
| Schedule | Every 15 minutes |
| Request method | `GET` |
| Header | `X-Cron-Secret: <CRON_SECRET>` |

Qo'lda sinash:

```bash
curl -H "X-Cron-Secret: <CRON_SECRET>" https://<backend>.vercel.app/api/sync/cron
```

Kutilgan javob:

```json
{"success":true,"workspaces":1,"failed":0,"durationMs":4210,
 "pool":{"mode":"serverless (max 1)","total":1,"idle":0,"waiting":0},
 "results":[{"workspaceId":"...","ok":true}]}
```

- `401` → sir noto'g'ri
- `503` → `CRON_SECRET` env o'zgaruvchisi qo'yilmagan
- `workspaces: 0` → hech bir workspace'da FB ulanmagan yoki ad account tanlanmagan

---

## 5. OAuth callback manzillarini yangilash

**Facebook** — developers.facebook.com → App → Facebook Login → Settings →
Valid OAuth Redirect URIs:

```
https://<backend>.vercel.app/api/auth/facebook/callback
```

Scope faqat `ads_read` bo'lib qolsin. Boshqa ruxsat qo'shilsa "Invalid Scopes" chiqadi.

**amoCRM** — integratsiya sozlamalari → Redirect URI:

```
https://<backend>.vercel.app/api/auth/amocrm/callback
```

**amoCRM webhook** — sozlamalar → Webhooks:

```
https://<backend>.vercel.app/api/webhooks/amocrm?secret=<AMOCRM_WEBHOOK_SECRET>
```

Hodisalar: `Сделка добавлена`, `Сделка изменена` (status), `Контакт добавлен`.

---

## Serverless'da nima o'zgardi

| | Ilgari | Endi |
|---|---|---|
| Server | `app.listen()` | `api/index.ts` → `export default app` |
| Sync cron | `node-cron` ichkarida | tashqi tetik → `/api/sync/cron` |
| Webhook | 200 qaytar → keyin async | `awaitWithDeadline(8s)` + `waitUntil` |
| DB pool | `max: 10`, session pooler | `max: 1`, transaction pooler |
| Redis/Bull | ixtiyoriy | ishlatilmaydi |

**Webhook nega o'zgardi:** serverless'da javob ketishi bilan funksiya o'ldiriladi.
Eski kod 200 qaytarib, keyin `processLeadAttribution` ni chaqirardi — u yarim yo'lda
uzilib, **sotuv yo'qolardi**. Endi ish javobdan oldin tugatiladi (odatda 1–3 s),
ulgurmasa `waitUntil` ushlab qoladi.

---

## Tekshirilishi kerak bo'lgan joylar

1. **pgbouncer transaction rejimi va prepared statement'lar.** `node-pg`
   parametrli so'rovlarda nomsiz statement ishlatadi (bu ruxsat etilgan), lekin
   birinchi deploy'dan keyin dashboard va webhook yo'llarini real ma'lumot bilan
   sinash shart.
2. **`waitUntil`** — `@vercel/functions` paketidan. Agar deadline ichida
   ulgurilmasa va `waitUntil` ishlamasa, qolgan ish uzilishi mumkin.
   `WEBHOOK_DEADLINE_MS` ni oshirish bilan xavfni kamaytirsa bo'ladi.
3. **FB sync 300 s ichida tugashi.** Hozir hisoblarda 6–10 sahifalangan chaqiruv
   bor — bu odatda 10–40 s. Ad account kattalashsa `/api/sync/cron` javobidagi
   `durationMs` ni kuzatib boring.
