# Backend Architecture

Dokumen ini menjelaskan bentuk backend saat ini setelah rangkaian refactor modularisasi pada 7 April 2026.

## Goals

- Memisahkan tanggung jawab `api` dan `worker`
- Menjaga satu source of truth untuk background processing
- Mengurangi file pusat yang terlalu gemuk
- Membuat penambahan fitur baru lebih mudah tanpa menambah kerumitan lintas domain

## Runtime Layout

```text
backend/
├── apps/
│   ├── api/main.ts
│   └── worker/main.ts
├── src/
│   ├── app.ts
│   ├── worker-app.ts
│   ├── config/
│   ├── modules/
│   ├── routes/
│   ├── services/
│   └── utils/
├── index.ts
└── worker.ts
```

### Runtime responsibilities

- `apps/api/main.ts`: entrypoint process HTTP API
- `apps/worker/main.ts`: entrypoint process background worker
- `src/app.ts`: bootstrap Elysia app
- `src/worker-app.ts`: bootstrap BullMQ worker, heartbeat, and async processing
- `index.ts` and `worker.ts`: compatibility wrappers untuk entrypoint lama

## Domain Modules

Struktur target backend sekarang berpusat pada `src/modules/<domain>`.

### Active modules

- `auth`
- `billing`
- `video`
- `storage`
- `admin`
- `folder`

### Module ownership rule

- `src/modules/*`: implementation utama domain
- `src/routes/index.ts`: route registry
- `src/services/*`: shared non-domain services yang masih valid, seperti email
- `apps/*`: runtime boundary

## Video Processing Flow

Saat ini semua video processing async diarahkan lewat worker.

### Current flow

1. API menerima upload video.
2. File di-stream ke object storage.
3. Record video dibuat dengan status awal `pending`.
4. Job dipush ke BullMQ.
5. Worker mengambil job, mengubah status menjadi `processing`.
6. Worker melakukan transcoding/upload output.
7. Worker mengubah status akhir menjadi `ready` atau `error`.

### Important decisions

- `mp4` dan `hls` memakai executor async yang sama
- API tidak lagi memproses video sebagai fire-and-forget local task
- Worker heartbeat ditulis ke Redis untuk monitor Studio

## Admin Area

Domain `admin` sekarang sudah dipecah per concern:

- `modules/admin/monitor.routes.ts`
- `modules/admin/users.routes.ts`
- `modules/admin/billing.routes.ts`
- `modules/admin/storage.routes.ts`

Service admin juga sudah dipisah:

- `modules/admin/monitor.service.ts`
- `modules/admin/users.service.ts`
- `modules/admin/billing.service.ts`
- `modules/admin/audit.service.ts`
- `modules/admin/service.ts` sebagai facade

## Auth Guard Pattern

Daripada menaruh auth/admin parsing di setiap route, backend sekarang memakai shared resolver/helper:

- `modules/auth/guards.ts`
- `modules/admin/context.ts`

Pendekatan ini dipilih karena lebih stabil dengan typing Elysia dibanding memaksa plugin guard yang membuat inference context rapuh.

## Migration Note

Refactor dilakukan bertahap, tetapi wrapper legacy internal yang sudah tidak dipakai sudah dibersihkan.

Saat ini source of truth ada langsung di `src/modules/*`, dan route registry memakai module baru secara langsung.

## Current Priorities

Area yang sudah cukup sehat:

- runtime separation
- domain modularization utama
- worker monitoring
- unified async processing

Area yang masih layak dirapikan berikutnya:

- shared contracts/DTO antara frontend dan backend
- action operasional Worker Monitor seperti retry/requeue
- dokumentasi endpoint admin yang lebih granular
- smoke/integration tests untuk flow upload dan worker monitor

## Verification Commands

Command yang dipakai berulang selama refactor:

```bash
cd backend
bunx tsc --noEmit

cd ../frontend
npm run typecheck
```
