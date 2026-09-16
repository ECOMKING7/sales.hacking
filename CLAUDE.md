# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A multi-tenant marketing attribution SaaS. It connects a customer's **Facebook Ads** account and **amoCRM** account, ingests ad spend and CRM leads, and credits won-deal revenue back to the specific Facebook ads that drove it — computing ROAS per ad/adset/campaign. A lightweight tracking pixel captures the `fbclid → conversion` touchpoint chain on the customer's own website.

Two apps in one repo: `backend/` (Express + TypeScript API) and `frontend/` (React + Vite). `shared/` holds cross-cutting types.

## Commands

Infra (Postgres :5432, Redis :6379) via `docker-compose up -d` from repo root.

**Backend** (`cd backend`):
- `npm run dev` — nodemon dev server on :4000
- `npm run migrate` — apply SQL migrations (dev, uses ts-node)
- `npm run migrate:prod` — apply migrations from compiled `dist/` (prod image has no ts-node)
- `npm run build` — `tsc` → `dist/`
- `npm run typecheck` — `tsc --noEmit`

**Frontend** (`cd frontend`):
- `npm run dev` — Vite dev server on :5173
- `npm run build` — `tsc && vite build`
- `npm run typecheck` — `tsc --noEmit`

There is **no test runner and no linter** configured. `typecheck` is the only automated check — run it in both packages after changes.

### Local dev gotchas

- **Backend `tsconfig` is CommonJS + `moduleResolution: node10`** (with `ignoreDeprecations: "6.0"`) so `ts-node` runs `src/` directly. Write relative imports **without** a `.js` extension (`import { pool } from '../db/pool'`) — adding `.js` type-checks fine but breaks `ts-node` at runtime.
- **`nodemon` watches `src/` only, not `.env`.** After editing `backend/.env` (e.g. new FB creds), **restart the backend manually** — a running dev server keeps the old env.
- This machine has **no local Docker/Redis/Postgres**. The dev DB is **Supabase cloud** (session pooler; the password in `DATABASE_URL` must be URL-encoded). `USE_REDIS` is unset, so syncs run inline. The `docker-compose.yml` is for a from-scratch/self-hosted setup, not the current dev DB.

## Architecture

### Attribution engine — the core

`backend/src/services/attributionEngine.ts` is the heart of the system. Two responsibilities:

1. **`recordTouchpoint`** — links an incoming event to a lead. Matching order: existing touchpoint by `fbclid`, then `leads` by hashed email/phone (for CRM-sourced leads). Assigns the next `touch_number` in that lead's path.
2. **`processLeadAttribution`** — recomputes credit for one lead inside a single DB transaction (`SELECT ... FOR UPDATE` on the lead). It is **idempotent by design**: each run first *reverses* the lead's prior contribution to `ads` metrics, clears old weights, then applies fresh ones. Re-reads the persisted (rounded) weights before distributing revenue so a later reverse pass reads identical values. When editing this file, preserve the reverse-then-reapply invariant or ad metrics will drift on reprocessing.

Four attribution models (`first_click`, `last_click`, `linear`, `time_decay`); the default is **`last_click`**, matching the documented MVP decision. Models are pure functions — keep them pure.

### How a lead reaches an ad (`services/leadMatcher.ts`)

The pixel writes a touchpoint *before* the CRM lead exists, so its `lead_id` is `NULL`. Three mechanisms close that gap, tried in order:

1. **UTM** — `leads.utm_term` normalized (decodeURIComponent, `+`→space, trim, lowercase) against `ads.name`. This is the primary key per the project's UTM standard; the column used is configurable via `workspaces.attribution_key`.
2. **`fbclid`** — `processLeadAttribution` adopts orphan touchpoints (`UPDATE touchpoints SET lead_id … WHERE fbclid = … AND lead_id IS NULL`) before reading the path.
3. **hashed phone/email** — weakest, only works if the pixel collected PII.

Whichever succeeded is recorded in `leads.match_method` (`utm` / `fbclid` / `contact` / `NULL`), which is what makes a discrepancy diagnosable.

**Duplicate ad names are a hard stop, not a tiebreak.** If two ads normalize to the same name, the matcher returns `ambiguous` and attributes nothing — crediting an arbitrary one would silently misreport spend.

When no touchpoint exists but UTM matches, the engine **creates** a touchpoint with `attribution_weight = 1.0` rather than writing to `ads` directly. This is load-bearing: the reverse pass only knows about contributions recorded in `touchpoints.attribution_weight`, so an unrecorded direct write would double-count on every reprocess.

⚠ **`ads.revenue` currently has two writers** — this engine (incremental `revenue + delta`) and the Facebook sync (`revenue = EXCLUDED.revenue`). A sync between two attribution runs makes the reverse pass subtract against a value that no longer contains the contribution, and `GREATEST(…, 0)` hides the drift instead of surfacing it. Fix planned: derive revenue from `leads` at query time (as `funnelController` already does) and keep Facebook's own figure in a separate column.

### Data flow

```
Facebook Ads API ──(sync)──► campaigns/adsets/ads (spend, impressions)
                                        ▲ revenue + purchase counts credited here
Customer website ──(pixel)──► touchpoints (fbclid chain) ──┐
amoCRM webhook ───(lead/won)─► leads ─────────────────────┴─► processLeadAttribution
```

- **Sync** (`jobs/syncJob.ts` + `services/facebookAdsService.ts`): pulls FB ad data. Runs on a **node-cron every 15 min** for every workspace with FB creds (`startSyncCron`, launched in `index.ts`). Also triggerable via `POST /api/sync/trigger`. The connected FB app is a **Marketing-API-type app** and the OAuth scope is **`ads_read` only** — adding other scopes (`ads_management`, `business_management`, `email`, brand permissions) triggers "Invalid Scopes". Insights are fetched **account-level in bulk** (`level=campaign|adset|ad`, ~6–10 paginated calls total) rather than per-entity, to stay under FB's tight dev-mode ad-account rate limit; on error **code 17** (ad-account "too many calls") the fetch **fails fast without retrying** (retrying extends the cooldown). Entity metrics (`spend`, `impressions`) are the latest sync snapshot — **not time-bucketed** — while revenue/won metrics filter by `leads.won_at`.
- **amoCRM webhook** (`controllers/webhookController.ts`): `POST /api/webhooks/amocrm`. Acknowledges 200 *immediately* then processes async (amoCRM retries on non-2xx). Handles both `lead` events (a lead becomes `won` when it hits the workspace-configured won stage, triggering `processLeadAttribution` + dashboard cache invalidation) and `contact.add` events (enriches a lead's hashed email/phone via `services/amocrmService.ts`, which is what lets `recordTouchpoint` later match a pixel touchpoint to a CRM-sourced lead). Verified by a shared secret in `?secret=` / `X-Webhook-Secret` (amoCRM can't HMAC-sign).
- **Pixel** (`controllers/pixelController.ts`, routes under `/api/pixel`): CORS `*`, rate-limited 100/min/workspace, and **must never return an error** — the global error handler in `index.ts` forces 200 for any `/api/pixel` path.
- **OAuth connect** (`controllers/authController.ts`, `controllers/workspaceController.ts`, `services/facebookOAuth.ts`): a workspace connects FB/amoCRM through an OAuth redirect + callback; exchanged tokens are AES-encrypted before being stored on the workspace row (see Privacy).

### Multi-tenancy & auth

Every domain table is scoped by `workspace_id`; every query filters on it. JWT (`middleware/auth.ts`) carries `{ userId, email, workspaceId }` and populates `req.user`. `middleware/planLimits.ts` enforces free/pro/agency limits (`checkLeadQuota`, `requireFeature`). Always scope new queries by `workspaceId`.

### Resilience: Redis and the queue are optional

The app is built to run **without Redis**:
- `utils/cache.ts` — fail-soft dashboard cache; every op no-ops silently if Redis is unreachable.
- `jobs/syncJob.ts` — the Bull queue is only used when `USE_REDIS=true`; otherwise syncs run **inline**. Importing the module must never open a Redis connection (it would crash on ECONNREFUSED).
- `index.ts` installs `unhandledRejection` / `uncaughtException` guards as a last-resort net.

Keep this fail-soft posture when touching Redis/queue code.

### Database & migrations

Plain `.sql` files in `backend/migrations/` (`001_*` … `010_*`), applied in filename order by a custom runner (`src/db/migrate.ts`) tracked in a `schema_migrations` table — idempotent and transactional per file. **To change schema, add a new numbered `.sql` file**; never edit an applied migration. Uses `pg` `Pool` directly (`src/db/pool.ts`) — no ORM. Core tables: `users`, `workspaces`, `campaigns`, `adsets`, `ads`, `leads`, `touchpoints`, `sync_logs`, `workspace_members`.

### Privacy

Email, phone, and IP are **SHA-256 hashed on arrival**; raw PII is never stored. OAuth tokens (FB, amoCRM) are AES-256 encrypted at rest (`utils/encryption.ts`, `ENCRYPTION_KEY`).

### Frontend

Standard Vite + React 19 SPA. Routing in `App.tsx` (React Router 7); auth guarded by `ProtectedRoute` reading a Zustand store (`store/authStore.ts`, token persisted). API layer in `services/api.ts` (Axios; injects bearer token, redirects to `/login` on 401). Server state via TanStack Query (5 min `staleTime`); the dashboard (`pages/DashboardPage.tsx` + `components/dashboard/`) is styled after the FB Ads Manager table. `DashboardPage` owns the shared toolbar state (ad-account, date range, view, search, visible columns) and drives a **controlled** `EntityTable` that drills campaigns → ad sets → ads (clickable name links + breadcrumb); visible columns persist in `localStorage`. `VITE_API_URL` points at the backend.

Note: **`lucide-react` is v1 — brand icons (e.g. `Facebook`) were removed.** Use a generic icon (the code uses `Megaphone` for the Facebook section) or the build fails.

## Conventions

- Controllers are thin; business logic lives in `services/`. Money/metric mutations belong in the attribution engine's transaction, not scattered across controllers.
- Layered backend: `routes/ → controllers/ → services/ → db`.
- Validation with `zod`. Config via env (`backend/.env.example` is the source of truth for required vars).

## Deployment

Backend → Railway (Docker, root dir `backend`), Frontend → Vercel (root dir `frontend`). Run `railway run npm run migrate:prod` after deploy. Full runbook in `DEPLOYMENT.md`; OAuth callback URLs must be updated in the FB/amoCRM apps once Railway assigns a domain.
