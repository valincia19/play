# Vercelplay

Platform video SaaS dengan backend Bun + Elysia dan frontend React + Vite.

## Project Structure

```text
vercelplay-v2/
├── backend/
│   ├── apps/          # runtime entrypoints (api, worker)
│   ├── src/
│   │   ├── modules/   # domain modules
│   │   ├── schema/    # database schema
│   │   ├── utils/     # shared utilities
│   │   ├── app.ts     # API bootstrap
│   │   └── worker-app.ts
│   └── drizzle/
├── docs/
└── frontend/
    └── src/
```

## Quick Start

### 1. Start infrastructure

```bash
cd backend
docker-compose up -d
```

### 2. Run migrations

```bash
cd backend
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

### 3. Start API

```bash
cd backend
npm run dev
```

API runs at `http://localhost:4000`.

### 4. Start worker

```bash
cd backend
npm run dev:worker
```

Worker handles video processing and background jobs.

### 5. Start frontend

```bash
cd frontend
npm run dev
```

Frontend runs at `http://localhost:5173`.

## Verification

```bash
cd backend
bunx tsc --noEmit

cd ../frontend
npm run typecheck
```

## Documentation

- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)
- [Admin Studio](docs/admin.md)
- [Backend Architecture](docs/backend-architecture.md)
- [Refactor Log](docs/refactor-log.md)
