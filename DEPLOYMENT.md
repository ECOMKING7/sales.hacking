# Deployment Guide

Backend → **Railway.app** (Docker), Frontend → **Vercel**.

## Architecture

```
Vercel (frontend, nginx/static)  ──►  Railway (backend API, :4000)
                                          ├── PostgreSQL plugin
                                          └── Redis plugin
```

---

## 1. Railway project

1. Create an account at [railway.app](https://railway.app) and **New Project → Deploy from GitHub repo**.
2. Select this repository. Railway detects `backend/railway.json` and builds the
   backend `Dockerfile`.
3. Set the service **Root Directory** to `backend` (Settings → Source).

## 2. Add PostgreSQL plugin

- **New → Database → PostgreSQL**.
- Railway exposes `DATABASE_URL`. Reference it in the backend service variables
  (`DATABASE_URL = ${{Postgres.DATABASE_URL}}`).

## 3. Add Redis plugin

- **New → Database → Redis**.
- Reference `REDIS_URL = ${{Redis.REDIS_URL}}` in the backend service.

## 4. Set environment variables

In the backend service **Variables** tab set everything from
[`backend/.env.example`](backend/.env.example):

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `JWT_SECRET` | long random string (48+ chars) |
| `JWT_EXPIRES_IN` | `7d` |
| `BCRYPT_SALT_ROUNDS` | `12` |
| `ENCRYPTION_KEY` | random secret |
| `FRONTEND_URL` | your Vercel URL (e.g. `https://app.yourdomain.com`) |
| `FB_APP_ID` / `FB_APP_SECRET` | from Facebook app |
| `FB_REDIRECT_URI` | `https://<railway-domain>/api/auth/facebook/callback` |
| `AMOCRM_CLIENT_ID` / `AMOCRM_CLIENT_SECRET` | from amoCRM integration |
| `AMOCRM_REDIRECT_URI` | `https://<railway-domain>/api/auth/amocrm/callback` |
| `AMOCRM_WEBHOOK_SECRET` | random string |

## 5. Update OAuth redirect URIs

After Railway assigns a public domain, update the **production callback URLs**:

- **Facebook** → developers.facebook.com → your app → Facebook Login → Valid OAuth
  Redirect URIs: `https://<railway-domain>/api/auth/facebook/callback`
- **amoCRM** → integration settings → Redirect URI:
  `https://<railway-domain>/api/auth/amocrm/callback`
- amoCRM webhook URL:
  `https://<railway-domain>/api/webhooks/amocrm?secret=<AMOCRM_WEBHOOK_SECRET>`

## 6. Run database migrations

Once the service is deployed:

```bash
railway run npm run migrate:prod
```

`migrate:prod` runs the compiled `dist/db/migrate.js` against `DATABASE_URL`
(the production image has no `ts-node`). This applies all 10 migrations and is
idempotent.

## 7. Deploy the frontend on Vercel

1. [vercel.com](https://vercel.com) → **New Project** → import the repo.
2. **Root Directory:** `frontend`. Framework preset: **Vite**.
3. Build command `npm run build`, output dir `dist`.
4. Environment variable: `VITE_API_URL = https://<railway-domain>`.
5. Deploy. Add the resulting domain to the backend's `FRONTEND_URL`.

> Alternative: deploy the frontend `Dockerfile` (nginx) anywhere, passing
> `--build-arg VITE_API_URL=https://<railway-domain>`.

## 8. Test all integrations

- [ ] `GET https://<railway-domain>/health` → `{ "status": "ok", "timestamp": ... }`
- [ ] Register / login from the Vercel frontend.
- [ ] Settings → Connect Facebook → select ad account.
- [ ] Settings → Connect amoCRM → choose pipeline + won stage.
- [ ] Trigger a sync: `POST /api/sync/trigger`.
- [ ] Move an amoCRM lead to the won stage → webhook marks it won, revenue captured.
- [ ] Dashboard + Purchases show data.
- [ ] Embed the pixel snippet on a test page and confirm `/api/pixel/event` records touchpoints.

---

### Local Docker smoke test

```bash
# Backend
cd backend && docker build -t attribution-api .
docker run -p 4000:4000 --env-file .env attribution-api

# Frontend
cd frontend && docker build --build-arg VITE_API_URL=http://localhost:4000 -t attribution-web .
docker run -p 8080:80 attribution-web
```
