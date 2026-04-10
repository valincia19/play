# Frontend

Frontend ini dibangun dengan React, TypeScript, Vite, Tailwind, dan shadcn/ui.

## Main Areas

- `src/pages/dashboard`: user dashboard
- `src/pages/studio`: admin studio
- `src/components`: reusable UI and feature components
- `src/lib/api.ts`: API client
- `src/lib/types.ts`: frontend API contracts

## Development

```bash
npm run dev
```

## Type Check

```bash
npm run typecheck
```

## Notes

- Admin Studio memiliki Worker Monitor untuk observability worker.
- Tipe di `src/lib/types.ts` sudah mulai diselaraskan dengan payload backend.
- Untuk konteks backend, lihat `../docs/backend-architecture.md`.
