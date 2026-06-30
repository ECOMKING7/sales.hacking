# Attribution Platform

A full-stack marketing attribution platform.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| Cache / Queue | Redis, Bull |
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Data fetching | TanStack Query, Axios |
| State | Zustand |
| Charts | Recharts |

## Project Structure

```
attribution-platform/
├── backend/          Node.js + Express API (TypeScript)
│   └── src/
│       ├── routes/        Express route definitions
│       ├── controllers/   Request handlers
│       ├── services/      Business logic
│       ├── models/        Data models / DB access
│       ├── middleware/    Express middleware
│       ├── jobs/          Background jobs (Bull / node-cron)
│       ├── utils/         Helpers
│       └── types/         Shared TypeScript types
├── frontend/         React + TypeScript + Vite
│   └── src/
│       ├── pages/         Route-level pages
│       ├── components/    Reusable UI components
│       ├── hooks/         Custom React hooks
│       ├── services/      API clients
│       ├── store/         Zustand stores
│       ├── types/         TypeScript types
│       └── utils/         Helpers
├── shared/           Types/constants shared across backend & frontend
├── docker-compose.yml
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL + Redis)

### 1. Start infrastructure

```bash
docker-compose up -d   # PostgreSQL :5432, Redis :6379
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev            # Server running on port 4000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev            # Vite dev server on port 5173
```

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full list of required variables.

## Pixel Tracking Integration

The platform exposes a lightweight tracking pixel that website owners embed to
capture `fbclid` and conversion events. All endpoints are under `/api/pixel`,
allow any origin (CORS `*`), and never block or break the host page.

### 1. Embed the script

Add this to the site, replacing `WORKSPACE_ID`:

```html
<script async src="https://YOUR_API_HOST/api/pixel/script.js?workspaceId=WORKSPACE_ID"></script>
```

On load the script:
- captures `fbclid` from the URL and stores it in `sessionStorage`;
- fires a `view` event automatically;
- exposes `window.AttributionPixel.track(eventType, data)`.

### 2. Track custom events

```js
// e.g. on a purchase
window.AttributionPixel.track('purchase', {
  email: 'buyer@example.com',   // hashed server-side, raw value never stored
  phone: '+998901234567',       // hashed server-side
  value: 99.0,
  currency: 'USD'
});
```

Events are sent with `navigator.sendBeacon` (falling back to `fetch` with
`keepalive`), so they never delay navigation.

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/pixel/event` | Record an event. Body: `{ workspaceId, eventType, fbclid, adId, adsetId, campaignId, email?, phone?, value?, currency? }`. Always returns `200`. |
| `GET /api/pixel/script.js?workspaceId=...` | Returns the tracking snippet (<5 KB). |
| `GET /api/pixel/1x1.gif?workspaceId=...&leadId=...` | 1×1 transparent GIF for email-open / no-JS tracking. |

### Privacy & limits

- Email, phone and IP are **SHA-256 hashed on arrival** — raw PII is never stored.
- Rate limited to **100 events/min per workspace**; excess is dropped silently (still `200`).
- The event endpoint never returns an error to the client.
