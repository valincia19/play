# 🚀 Vercelplay — Panduan Deploy 2-Server (Production)

Dokumen ini menjelaskan cara deploy Vercelplay ke **2 server terpisah** menggunakan Docker.

---

## 📐 Arsitektur

```
┌─────────────────────────────────┐     ┌───────────────────────────────────┐
│        SERVER 1 (Backend)       │     │        SERVER 2 (Frontend)        │
│   api.vercelplay.com            │     │   vercelplay.com / verply.net     │
│                                 │     │                                   │
│  ┌──────────┐  ┌─────────────┐  │     │  ┌─────────────────────────────┐  │
│  │ Postgres │  │    Redis    │  │     │  │   Nginx (Static SPA)        │  │
│  │  :5432   │  │   :6379     │  │     │  │   Port 80                   │  │
│  └────┬─────┘  └──────┬──────┘  │     │  └─────────────────────────────┘  │
│       │               │         │     │                                   │
│  ┌────┴───────────────┴──────┐  │     │  React App (Vite Build)           │
│  │  API Server (Elysia/Bun) │  │     │  .env.production → API URL        │
│  │  Port 80 → 4000          │  │     │                                   │
│  ├───────────────────────────┤  │     └───────────────────────────────────┘
│  │  Worker (BullMQ + FFmpeg) │  │
│  │  Video Processing         │  │
│  └───────────────────────────┘  │
│                                 │
│  RedisInsight :5540 (opsional)  │
└─────────────────────────────────┘
```

---

## 📋 Prasyarat

- **2 Server/VPS** dengan Ubuntu 22+ (atau distro Linux lain)
- **Docker & Docker Compose** terinstal di kedua server
- **Domain** yang sudah dikelola di Cloudflare:
  - `vercelplay.com` → IP Server 2 (Frontend)
  - `api.vercelplay.com` → IP Server 1 (Backend)
  - `verply.net` → IP Server 2 (Frontend)
- **Git** terinstal di kedua server

---

## 🔶 Cloudflare DNS & SSL

### DNS Records

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `vercelplay.com` | `IP_SERVER_2` | ☁️ Proxied |
| A | `api` | `IP_SERVER_1` | ☁️ Proxied |
| A | `verply.net` | `IP_SERVER_2` | ☁️ Proxied |

### SSL/TLS Setting

> **PENTING:** Buka **Cloudflare Dashboard → SSL/TLS** untuk **kedua domain** (`vercelplay.com` & `verply.net`).
> Ubah mode enkripsi menjadi **Flexible**.
> Mode ini membuat Cloudflare menangani HTTPS ke pengunjung, tapi berkomunikasi ke servermu via HTTP (Port 80).

---

## 🖥️ SERVER 1 — Backend

### Step 1: Clone Repository

```bash
git clone https://github.com/valincia19/play.git vercelplay
cd vercelplay/backend
```

### Step 2: Buat File `.env`

```bash
nano .env
```

Isi dengan konfigurasi berikut (**sesuaikan nilai-nilainya**):

```env
# ─── Database ───────────────────────────────────────────
# PENTING: Gunakan 'postgres' (nama service Docker), BUKAN 'localhost'
DATABASE_URL=postgres://postgres:password@postgres:5432/vercelplay

# ─── Redis ──────────────────────────────────────────────
# PENTING: Gunakan 'redis' (nama service Docker), BUKAN 'localhost'
REDIS_URL=redis://redis:6379

# ─── JWT ────────────────────────────────────────────────
# WAJIB diganti dengan string random yang panjang & unik!
JWT_SECRET=GANTI_DENGAN_STRING_RANDOM_YANG_PANJANG

# ─── SMTP (Pengiriman Email) ────────────────────────────
# Opsi 1: Gmail (butuh App Password dari Google)
# Opsi 2: Brevo/Sendinblue (gratis 300 email/hari)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@vercelplay.com
SMTP_FROM_NAME=Vercelplay

# ─── Storage Encryption ────────────────────────────────
# Kunci enkripsi 64 karakter hex untuk mengamankan kredensial S3
STORAGE_ENCRYPTION_KEY=GANTI_DENGAN_64_KARAKTER_HEX_RANDOM

# ─── URLs ───────────────────────────────────────────────
# APP_URL  = URL server backend ini sendiri
# FRONTEND_URL = URL server frontend (untuk CORS & link email)
APP_URL=https://api.vercelplay.com
FRONTEND_URL=https://vercelplay.com

# ─── Server ─────────────────────────────────────────────
PORT=4000
```

> **JANGAN pernah** push file `.env` ke GitHub! File ini berisi kredensial rahasia.
> File `.env` sudah otomatis diblokir oleh `.gitignore`.

### Step 3: Jalankan Docker

```bash
docker compose up --build -d
```

Tunggu hingga proses build selesai (~2-3 menit). Verifikasi semua container berjalan:

```bash
docker ps
```

Output yang benar:

```
CONTAINER ID   IMAGE                       STATUS         PORTS               NAMES
xxxxxxxxx      backend-api                 Up             0.0.0.0:80->4000    vercelplay-api
xxxxxxxxx      backend-worker              Up                                 vercelplay-worker
xxxxxxxxx      postgres:16-alpine          Up             5432/tcp            vercelplay-postgres
xxxxxxxxx      redis:7-alpine              Up             6379/tcp            vercelplay-redis
xxxxxxxxx      redis/redisinsight:latest    Up             0.0.0.0:5540->5540  vercelplay-redisinsight
```

### Step 4: Inisialisasi Database

```bash
# Buat semua tabel (Users, Videos, Plans, dll)
docker exec -it vercelplay-api bun run db:push
```

### Step 5: Seed Data Awal

```bash
# Tambahkan paket langganan (Free, Creator, Pro)
docker exec -it vercelplay-api bun run seed-plans.ts

# Tambahkan provider storage (S3, R2)
docker exec -it vercelplay-api bun run migrate-storage-providers.ts
```

### Step 6: Cek Log (Opsional)

```bash
# Log API (request masuk, error, dll)
docker logs -f --tail 50 vercelplay-api

# Log Worker (proses video, FFmpeg)
docker logs -f --tail 50 vercelplay-worker
```

---

## 🖥️ SERVER 2 — Frontend

### Step 1: Clone Repository

```bash
git clone https://github.com/valincia19/play.git vercelplay
cd vercelplay/frontend
```

### Step 2: Jalankan Docker

```bash
docker compose up --build -d
```

> **Catatan:** Frontend **TIDAK membutuhkan** file `.env` manual di server.
> Semua variabel environment sudah tertanam di file `frontend/.env.production`
> yang otomatis dibaca oleh Vite saat proses `npm run build` di dalam Docker.

Verifikasi container berjalan:

```bash
docker ps
```

Output yang benar:

```
CONTAINER ID   IMAGE               STATUS         PORTS              NAMES
xxxxxxxxx      frontend-frontend   Up             0.0.0.0:80->80     vercelplay-frontend
```

---

## 👑 Membuat Akun Admin Pertama

### 1. Daftar Akun Biasa

Buka `https://vercelplay.com/register` dan buat akun baru.

### 2. Verifikasi Email

Jika SMTP sudah dikonfigurasi, cek inbox email kamu.
Jika SMTP belum dikonfigurasi, cek link verifikasi di log backend:

```bash
docker logs vercelplay-api | grep "verificationUrl"
```

Salin URL yang muncul, lalu buka di browser.

### 3. Upgrade ke Admin

Jalankan di terminal **Server 1**:

```bash
docker exec -it vercelplay-api bun -e "
import { db } from './src/schema/db';
import { users } from './src/schema/user.schema';
import { eq } from 'drizzle-orm';
const r = await db.update(users).set({ role: 'admin' }).where(eq(users.email, 'EMAIL_KAMU@gmail.com')).returning({ email: users.email, role: users.role });
console.log('Admin:', r);
process.exit(0);
"
```

> Ganti `EMAIL_KAMU@gmail.com` dengan email yang baru kamu daftarkan.
> Setelah berhasil, **logout** dan **login ulang** untuk melihat menu Admin Studio.

---

## 🔄 Update Deployment (Saat Ada Perubahan Kode)

### Update Backend (Server 1)

```bash
cd ~/vercelplay/backend
git pull origin master
docker compose down
docker compose up --build -d
```

### Update Frontend (Server 2)

```bash
cd ~/vercelplay/frontend
git pull origin master
docker compose build --no-cache
docker compose up -d
```

> **PENTING:** Selalu gunakan `docker compose down` + `up` (bukan `restart`) agar
> Docker membaca ulang file `.env` yang sudah diubah.

---

## 🔧 Konfigurasi SMTP Email

### Opsi A: Gmail (App Password)

1. Login ke Google Account Settings (https://myaccount.google.com/)
2. Nyalakan **2-Step Verification**
3. Cari **App Passwords** → buat password baru → nama: `Vercelplay`
4. Salin 16 karakter password yang muncul

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=emailkamu@gmail.com
SMTP_PASSWORD=abcdefghijklmnop
SMTP_FROM=emailkamu@gmail.com
SMTP_FROM_NAME=Vercelplay
```

### Opsi B: Brevo (Gratis 300 email/hari)

1. Daftar di https://www.brevo.com/
2. Buka **Settings → SMTP & API** → salin kredensial

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-login
SMTP_PASSWORD=xsmtpsib-xxxxx
SMTP_FROM=noreply@vercelplay.com
SMTP_FROM_NAME=Vercelplay
```

---

## ⚠️ Troubleshooting

### Error 521 (Web Server Down)
**Penyebab:** Cloudflare SSL mode bukan `Flexible`.
**Solusi:** Cloudflare → SSL/TLS → ubah ke **Flexible**.

### CORS Error (localhost masih muncul)
**Penyebab:** Frontend di-build tanpa `.env.production`.
**Solusi:**
```bash
cd ~/vercelplay/frontend
docker compose build --no-cache
docker compose up -d
```

### `bun install --frozen-lockfile` Error
**Penyebab:** Lockfile dibuat di OS berbeda (Windows vs Linux).
**Solusi:** Sudah di-fix di Dockerfile (menggunakan `bun install` tanpa flag).

### Database Connection Error (`db:push` gagal)
**Penyebab:** `.env` masih menggunakan `localhost` bukan nama service Docker.
**Solusi:** Pastikan `.env` menggunakan:
```env
DATABASE_URL=postgres://postgres:password@postgres:5432/vercelplay
REDIS_URL=redis://redis:6379
```

### Container Tidak Membaca `.env` Baru
**Penyebab:** `docker compose restart` tidak membaca ulang env file.
**Solusi:** Gunakan `docker compose down` lalu `docker compose up -d`.

### Email Verification Link Mengarah ke localhost
**Penyebab:** `FRONTEND_URL` di `.env` backend masih `localhost`.
**Solusi:** Pastikan `.env` di Server 1 memiliki:
```env
FRONTEND_URL=https://vercelplay.com
```
Lalu: `docker compose down && docker compose up -d`

---

## 📁 Struktur File Penting

```
vercelplay/
├── backend/
│   ├── .env                    # Manual di server, TIDAK di Git
│   ├── .env.example            # Template referensi
│   ├── .env.production         # Referensi konfigurasi production
│   ├── docker-compose.yml      # Orkestrasi 5 container
│   ├── Dockerfile              # Image Bun + FFmpeg
│   ├── seed-plans.ts           # Seed paket langganan
│   └── migrate-storage-providers.ts  # Seed provider S3/R2
│
├── frontend/
│   ├── .env                    # Kosong (agar tidak override)
│   ├── .env.development        # Untuk lokal dev (npm run dev)
│   ├── .env.production         # Dibaca saat Docker build
│   ├── docker-compose.yml      # 1 container Nginx
│   ├── Dockerfile              # Multi-stage: Node build → Nginx
│   └── nginx.conf              # SPA routing + static cache
│
└── .gitignore                  # Blokir .env, IDE files, build output
```

---

## 🔐 Keamanan Production

| Item | Status |
|------|--------|
| Database port (5432) tidak di-expose ke internet | ✅ |
| Redis port (6379) tidak di-expose ke internet | ✅ |
| File `.env` tidak masuk ke Git | ✅ |
| JWT Secret menggunakan string random | ✅ |
| HTTPS via Cloudflare Flexible SSL | ✅ |
| CORS hanya mengizinkan `FRONTEND_URL` | ✅ |
| Rate limiting pada login & registrasi | ✅ |
| Storage encryption key untuk kredensial S3 | ✅ |
