# Backend

Backend ini memakai Bun, Elysia, Drizzle, PostgreSQL, Redis, dan BullMQ.

## Runtime Layout

```text
backend/
├── apps/
│   ├── api/main.ts
│   └── worker/main.ts
├── src/
│   ├── modules/
│   │   ├── admin
│   │   ├── auth
│   │   ├── billing
│   │   ├── folder
│   │   ├── storage
│   │   └── video
│   ├── schema/
│   ├── services/   # shared non-domain services
│   ├── utils/
│   ├── app.ts
│   └── worker-app.ts
├── drizzle/
└── docker-compose.yml
```

## Development

### Start infrastructure

```bash
docker-compose up -d
```

### Start API

```bash
npm run dev
```

### Start worker

```bash
npm run dev:worker
```

## Type check

```bash
bunx tsc --noEmit
```

## Notes

- `apps/api/main.ts` adalah entrypoint HTTP API.
- `apps/worker/main.ts` adalah entrypoint background worker.
- Source of truth domain sekarang ada di `src/modules/*`.
- Untuk gambaran arsitektur yang lebih detail, lihat `../docs/backend-architecture.md`.
