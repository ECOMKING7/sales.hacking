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
