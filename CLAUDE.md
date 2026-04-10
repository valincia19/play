# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vercelplay is a monorepo containing a React frontend (Vite) and Bun backend (Elysia) for a video platform application with upload, streaming, and billing features.

## Common Commands

### Frontend
```bash
cd frontend
npm run dev           # Start Vite dev server (http://localhost:5173)
npm run build         # TypeScript check + build for production
npm run lint          # Run ESLint
npm run format        # Format code with Prettier
npm run typecheck     # TypeScript type checking (no emit)
npm run preview       # Preview production build
```

### Backend
```bash
cd backend
bun install           # Install dependencies
bun run dev            # Start backend server with watch mode
bun run dev:worker     # Start background worker with watch mode (for video processing)
bun run start          # Run backend server (no watch)
bun run start:worker   # Run background worker (no watch)
bun run test          # Run test suite (e.g., auth tests)

# Database migrations (via npm scripts)
bunx drizzle-kit generate  # Generate migration from schema changes
bunx drizzle-kit push      # Push schema changes directly to DB
bun run db:generate       # Alternative via npm script
bun run db:push           # Alternative via npm script

# Type checking
bunx tsc --noEmit        # TypeScript type checking (no emit)
```

### Infrastructure
```bash
cd backend
docker-compose up -d   # Start PostgreSQL (port 5432) and Redis (port 6379)
```

## Architecture

### Frontend Stack
- **React 19** with TypeScript
- **Vite** for build tooling and HMR
- **React Router v7** for routing
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin
- **shadcn/ui** + **Radix UI** for component primitives
- **@remixicon/react** for icons
- **HLS.js** for video streaming
- **next-themes** for dark/light/system theme switching
- **Sonner** for toast notifications

### Frontend Development
- **Hot Module Replacement**: Vite provides instant HMR for development
- **Path aliases**: `@` maps to `src/` via Vite configuration
- **Automatic imports**: Vite resolves TypeScript paths automatically
- **Development server**: Runs on http://localhost:5173 with proxy configuration for API calls

### Backend Stack
- **Bun** runtime
- **Elysia** web framework with `@elysiajs/cors`
- **PostgreSQL** via `postgres.js` driver
- **Drizzle ORM** for database operations
- **Redis** via `ioredis` for caching/sessions/job queues
- **jsonwebtoken** + **bcryptjs** for authentication
- **BullMQ** for background job processing (video encoding)
- **FFmpeg/fluent-ffmpeg** for video transcoding
- **AWS SDK v3** (S3) for storage provider abstraction
- **Nodemailer** for email delivery
- **Pino** for structured logging

### Backend Route Structure
Routes are organized by domain with rate limiting and CORS protection:
```
/auth/*          # Authentication (register, verify, login, logout, refresh)
/videos/*         # Video CRUD operations (upload, list, delete, update)
/v/*              # Video streaming endpoints (HLS segments, thumbnails)
/billing/*        # Billing and subscription management
/admin/*          # Admin operations (users, plans, storage, audit)
/folders/*        # Folder management for organizing videos
/analytics/*      # Platform analytics and metrics
/ads/*            # Ad management and display
/public/*         # Public blog and content
```

### Development Workflow
1. **Start infrastructure**: `docker-compose up -d` (PostgreSQL + Redis)
2. **Generate migrations**: `bunx drizzle-kit generate` or `bun run db:generate`
3. **Push migrations**: `bunx drizzle-kit push` or `bun run db:push`
4. **Start API**: `bun run dev` (http://localhost:4000)
5. **Start worker**: `bun run dev:worker` (background video processing)
6. **Start frontend**: `npm run dev` (http://localhost:5173)
7. **Type check**: `bunx tsc --noEmit` (backend) or `npm run typecheck` (frontend)

### Backend Domain Module Structure
Business logic is organized in `src/modules/` with domain-driven design:
- `auth/` - Authentication, authorization, JWT tokens, guards
- `video/` - Video CRUD, processing pipeline, transcoding to HLS
- `billing/` - Stripe integration, subscriptions, plans management
- `admin/` - Admin operations (split into per-concern files: `monitor.routes.ts`, `users.routes.ts`, `billing.routes.ts`, `storage.routes.ts`, `domain.public.routes.ts`)
- `storage/` - Multi-provider storage (S3, R2, local) abstraction
- `folder/` - Folder hierarchy and organization system
- `blog/` - Public blog content management
- `ads/` - Ad management and display
- `analytics/` - Platform analytics and metrics

All modules are registered via `src/routes/index.ts` which re-exports route groups from each module. New routes must be added there.

Shared services in `src/services/`:
- `email.service.ts` - Email delivery (SMTP or console logging)
- Other utilities that span multiple domains

### Backend Apps Structure
The backend uses an `apps/` directory structure:
- `apps/api/main.ts` - Main API server entry point
- `apps/worker/main.ts` - Background worker entry point for BullMQ jobs

### Background Worker Architecture
The worker processes BullMQ jobs for:
- Video transcoding to HLS format (mp4 → m3u8 + .ts segments)
- Thumbnail generation at multiple resolutions
- Storage provider migrations

Key worker features:
- Heartbeat system logged to Redis for Studio monitoring
- Async processing with status tracking (pending → processing → ready/error)
- Handles video uploads without blocking API responses
- Temp file cleanup for both local and remote storage

Run with `bun run dev:worker` for development in watch mode.

### Frontend Routing Structure
```
/                          # Landing page (Home)
/login                     # Login page
/register                  # Registration page
/forgot-password           # Password reset
/verify                    # Email verification
/dashboard                 # Dashboard layout wrapper (protected)
  /                        # Dashboard index
  /videos                  # Videos list
  /videos/upload           # Video upload page
  /ads                     # Ads management
  /analytics               # Analytics view
  /settings               # User settings
  /billing                 # Billing/subscription page
/studio                    # Admin studio layout (protected)
  /                        # Studio index
  /users                   # User management
  /plans                   # Subscription plans
  /transactions            # Transaction history
  /storage                 # Storage provider management
```

### Frontend Component Organization
```
src/
├── components/
│   ├── landing/       # Landing page sections (hero, features, footer, etc.)
│   ├── auth/          # Authentication form components, ProtectedRoute
│   ├── dashboard/     # Dashboard-specific components (sidebar)
│   ├── studio/        # Studio/admin-specific components
│   └── ui/            # Reusable shadcn/ui components
├── contexts/          # React contexts (AuthContext)
├── layouts/           # Page layouts (DashboardLayout, StudioLayout)
├── pages/             # Route components organized by feature
├── lib/               # Utilities (cn helper, API client)
└── main.tsx           # App entry point with ThemeProvider
```

### Rate Limiting System
Two-tier rate limiting via `elysia-rate-limit`:
1. **Burst Protection** (10s window, 150 max): Handles dashboard page loads with multiple video cards
2. **Sustained Limit** (60s window, 3000 max): For authenticated user sessions

Authenticated users get generous limits; guests get strict limits. HLS streaming and thumbnail endpoints are skipped to avoid blocking video playback.

Generator function identifies users by JWT hash, guests by IP address.

### API Response Format
All API responses follow a consistent format:
- **Success**: `{ success: true, data: {...} }`
- **Error**: `{ success: false, error: { code: "ERROR_CODE", message: "Human readable message" } }`

### Key Patterns
- **Path alias**: `@` maps to `src/` via Vite config
- **Theme system**: Dark/light/system themes with keyboard shortcut (press 'd') via next-themes
- **Responsive sidebar**: Collapsed icon-only view on tablet, hidden with sheet on mobile
- **Class merging**: Use `cn()` utility from `@/lib/utils` for conditional Tailwind classes
- **Auth flow**: JWT access tokens (7d) + refresh tokens (30d), stored in localStorage
- **Protected routes**: Wrap with `ProtectedRoute` component for auth-gated pages
- **Video streaming**: HLS (HTTP Live Streaming) format for adaptive bitrate streaming
- **Module-based design**: Backend uses DDD with `modules/` directory, each owning routes, services, and types
- **Shared contracts**: Frontend types in `src/lib/types.ts` align with backend DTOs

### Backend Auth Guard Pattern
Authentication/authorization uses a resolve/enforce pattern in `src/modules/auth/guards.ts`:
- `resolveAuthenticatedContext` + `enforceAuthenticatedContext` — for user-authenticated routes
- `resolveAdminContext` + `enforceAdminContext` — for admin-only routes (requires auth first)
- `resolveAdminRequestContext` + `enforceAdminRequestContext` — combined: resolves both auth and admin in one call

This pattern was chosen over Elysia plugin guards because it provides more stable typing. Use `resolve*` in route `beforeHandle` to extract context, then `enforce*` to short-circuit on failure. Use `src/utils/response.ts` (`error()` + `errorCodes`) for standardized error responses.

### Environment Variables
Backend requires a `.env` file (not committed):
```bash
# Database
DATABASE_URL=postgres://postgres:password@localhost:5432/vercelplay

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=super-secret-jwt-key-for-development-only-change-in-production

# Storage (required)
STORAGE_ENCRYPTION_KEY=your-64-char-hex-key  # Required for encryption
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_REGION=us-east-1
S3_BUCKET=your-bucket-name
S3_ENDPOINT=https://s3.amazonaws.com

# SMTP (Email Delivery - optional, logs to console if not set)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@vercelplay.com
SMTP_FROM_NAME=Vercelplay

# App URLs
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173

# Server
PORT=4000
NODE_ENV=development

# Stripe (billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Database Schema
- **PostgreSQL 16** running in Docker container `vercelplay-postgres`
- Default credentials: `postgres` / `password` / `vercelplay`
- Schema managed via Drizzle Kit (`drizzle-kit` installed)
- Key tables: `users`, `videos`, `folders`, `plans`, `billing_subscriptions`, `storage_providers`, `audit_logs`
- Schema files located in `backend/src/schema/**/*.ts`

### Testing
Tests are located in `backend/test/` and require:
1. Backend server running on `http://localhost:4000`
2. PostgreSQL and Redis containers running (`docker-compose up -d`)
3. Run with `bun run test` (currently runs auth.test.ts)

### Type Checking
Both frontend and backend support type checking:
```bash
# Frontend
cd frontend
npm run typecheck     # TypeScript type checking (no emit)

# Backend
cd backend
bunx tsc --noEmit     # TypeScript type checking (no emit)
```

### Logging
Use `logger.*` methods from `./utils/logger` instead of `console.log`:
- `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`
- Structured logging with events defined in `logEvents` enum
- Pretty-printed in development, JSON in production

### Admin Studio
The Admin Studio (`/studio/*`) is a privileged management panel requiring `user.role === 'admin'`:
- **Plan Management** (`/studio/plans`): CRUD billing plans with Redis cache invalidation. Plan changes use snapshot architecture — modifications only affect future subscribers.
- **User Management** (`/studio/users`): Role editing, suspension, forced plan seeding via `adminService.givePlan`
- **Transactions Board** (`/studio/transactions`): Audit trail of subscription events (purchase, renew, give)
- **Worker Monitor**: Real-time heartbeat tracking, BullMQ queue status, failed job diagnostics
- **Storage Management** (`/studio/storage`): Provider configuration and migration monitoring

### File Uploads
- Max file size: 5GB (configured via `maxRequestBodySize`)
- Video processing happens asynchronously via BullMQ worker
- Transcoded to HLS format (m3u8 playlist + ts segments)
- Thumbnails generated automatically
- Stored via configured storage provider (S3-compatible or local)
