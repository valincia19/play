# Refactor Log

Dokumen ini dipakai untuk mencatat perubahan arsitektur dan refactor penting, supaya sesi berikutnya bisa lanjut tanpa kehilangan konteks.

## 2026-04-07

### Goals for this session

- menstabilkan worker processing
- menyederhanakan alur video
- memisahkan runtime API dan worker
- memodularisasi backend per domain
- merapikan contract type frontend-backend

### Implemented

#### 1. Frontend auth token fix

- Memperbaiki pemanggilan token di frontend auth context.
- `getAccessToken` sekarang dipakai dari export yang benar, bukan dipanggil sebagai method object `api`.

#### 2. Worker download/upload fixes

- Mengganti download source object storage dari pendekatan `Bun.write(Response(stream))` ke pipeline stream Node yang lebih stabil.
- Mengganti upload output processing dari `Bun.file().stream()` ke `fs.createReadStream()` agar cocok dengan middleware checksum AWS SDK di Bun.
- Menambahkan pengecualian `tmp-processing` di TypeScript backend agar file segment HLS tidak dianggap source TS.

#### 3. Worker monitor

- Menambah heartbeat worker ke Redis.
- Menambah endpoint snapshot worker monitor di backend.
- Menambah halaman Studio Worker Monitor di frontend.
- Menambah route dan sidebar navigation untuk monitor.

#### 4. Unified async video processing

- Menyatukan processing `mp4` dan `hls` lewat BullMQ worker.
- Video baru dibuat dengan status awal `pending`.
- API tidak lagi memproses `mp4` di process HTTP.
- Worker menerima jalur job unified untuk processing video.

#### 5. Runtime separation

- Menambah `backend/apps/api/main.ts`
- Menambah `backend/apps/worker/main.ts`
- Memisahkan bootstrap runtime `src/app.ts` dan `src/worker-app.ts`
- Menambah runtime config loader untuk API dan worker
- Memperbarui script `package.json` backend

#### 6. Domain modularization

Backend dipindah bertahap ke pola `src/modules/<domain>`.

Domain yang sudah dimodularisasi:

- `video`
- `storage`
- `auth`
- `billing`
- `admin`
- `folder`

Pada fase awal modularisasi, wrapper compatibility sempat dipertahankan untuk transisi aman. Setelah semua consumer pindah, wrapper internal yang orphan dibersihkan.

#### 7. Admin refactor

- Memecah `admin.routes` menjadi route per concern:
  - monitor
  - users
  - billing
  - storage
- Memecah `admin.service` menjadi service per concern:
  - audit
  - users
  - billing
  - monitor

#### 8. Frontend contract cleanup

- Menyamakan `AdminStats` frontend dengan payload backend saat ini.
- Menghilangkan `any` pada halaman Studio utama.
- Merapikan type return beberapa `folderApi` action yang sebelumnya tidak sesuai response backend.
- Menambah type eksplisit untuk `VideoUploadResponse`.

#### 9. Folder modularization

- Memindahkan domain `folder` ke `backend/src/modules/folder`.
- Pada fase awal sempat menjaga wrapper compatibility, lalu wrapper internal dibersihkan setelah semua consumer pindah ke module baru.
- Mengarahkan route registry ke module folder baru.

#### 10. Admin Studio contract hardening

- Menambahkan type admin yang lebih spesifik di frontend:
  - `AdminUserRecord`
  - `AdminPlan`
- Merapikan contract `adminApi` agar cocok dengan response backend saat ini.
- Mengurangi `any` pada halaman Studio `index`, `users`, `plans`, dan `storage`.
- Memperbaiki tampilan usage bucket di Studio Storage agar memakai field bytes dari backend, lalu diformat ke GB di UI.

#### 11. Documentation baseline

- Menambahkan `docs/backend-architecture.md` untuk snapshot arsitektur backend saat ini.
- Menambahkan `docs/refactor-log.md` sebagai log perubahan sesi.
- Menambahkan referensi dokumen baru ke root `README.md`.

#### 12. Cleanup pass

- Menghapus wrapper backend internal yang sudah tidak direferensikan lagi setelah modularisasi domain selesai.
- Merapikan type Admin Studio transactions.
- Menghapus asumsi field storage yang tidak pernah dikirim backend (`usedStorageGB`, `maxStorageGB` pada response bucket) dan memformat dari bytes di UI.

#### 13. Video processing throughput tuning

- Mengoptimalkan pipeline worker agar waktu dari `upload -> ready` lebih pendek untuk video HLS.
- Menambah profil encode adaptif per memory tier:
  - tier `medium` dan `low` memakai preset FFmpeg `superfast`
  - tier `high` tetap memakai `veryfast`
- Menambah segment duration HLS adaptif untuk mengurangi jumlah file output pada job single-rendition atau video yang lebih panjang.
- Menaikkan upload concurrency HLS pada tier `medium` dari 2 ke 4 agar upload segment kecil tidak terlalu serial.
- Mengubah batch upload HLS menjadi worker-pool concurrency supaya antrean upload tetap penuh sampai selesai.
- Menjalankan thumbnail extraction paralel dengan upload HLS, bukan menunggu upload selesai dulu.
- Menambah logging timing per tahap pipeline (`download`, `transcode`, `hlsUpload`, `thumbnail`, `total`) agar bottleneck sesi berikutnya bisa dibaca dari log, bukan ditebak.

#### 14. Upload quality presets

- Menambah preset kualitas HLS di layar upload agar user tidak perlu memahami detail rendition teknis.
- Preset yang tersedia sekarang:
  - `Fast` → `720p`
  - `Balanced` → `480p + 720p`
  - `Premium` → `720p + 1080p`
  - `Ultra` → `1080p + 2160p` (khusus plan yang lebih tinggi)
- Frontend sekarang mengirim `qualities[]` ke backend berdasarkan preset yang dipilih saat mode `Adaptive Bitrate (HLS)` aktif.
- Preset dibatasi berdasarkan plan agar UI tetap sederhana dan tidak membuka opsi yang tidak realistis untuk tier rendah.

#### 15. Upload workspace redesign

- Merombak UI `/dashboard/videos/upload` menjadi workspace dua kolom yang lebih compact dan lebih terasa seperti product surface premium.
- Panel kiri sekarang fokus pada area kerja utama:
  - header ringkas dengan status counts
  - queue notice ketika HLS backlog aktif
  - dropzone yang lebih jelas dan lebih polished
  - queue item yang lebih rapat, lebih mudah discan, dan lebih konsisten dengan status upload/processing
- Rail kanan sekarang fokus pada kontrol dan konteks:
  - folder tujuan
  - visibility
  - mode MP4 vs HLS
  - preset kualitas HLS
  - catatan workflow singkat
- Tetap memakai komponen `shadcn/ui` yang sudah ada di repo, tanpa mengubah flow upload yang sudah stabil.

#### 16. Quality preset tuning

- Menyesuaikan preset HLS agar nama preset lebih jujur terhadap tradeoff performa vs bandwidth.
- `Fast` sekarang memakai `480p` tunggal agar benar-benar jadi preset proses tercepat.
- Menambah preset `Saver` dengan `360p + 480p` untuk kebutuhan hemat data / low-bandwidth playback.
- Preset lain tetap dipakai untuk kualitas yang lebih tinggi (`Balanced`, `Premium`, `Ultra`).

#### 17. Worker housekeeping

- Menambah cleanup periodik `tmp-processing` saat worker hidup, bukan hanya saat boot.
- Menambah cleanup remote source object `temp/...` di R2/S3 untuk video HLS yang sudah:
  - `ready`, atau
  - `error` lebih lama dari 1 jam
- Cleanup remote sengaja tidak menyentuh `pending`, `uploading`, atau error yang masih baru agar tidak mengganggu retry BullMQ.
- Tujuannya menjaga disk lokal dan object storage tetap bersih tanpa membebani pipeline normal.

#### 18. Retry-state correctness

- Memperbaiki alur status DB saat processing gagal sementara:
  - transient failure tidak lagi langsung mengubah status video ke `error`
  - status tetap `processing` dengan pesan "retrying automatically" selama BullMQ masih punya attempt tersisa
- Menambah final-failure handler di worker:
  - saat `attemptsMade >= attempts`, video baru ditandai `error` final di DB
  - error message final dibuat jelas bahwa retry sudah habis
- Efeknya, UI upload tidak lagi menampilkan `FAILED` permanen terlalu cepat pada retry pertama.

#### 19. Auto fallback HLS -> MP4

- Menambah fallback otomatis di worker saat job HLS sudah gagal di semua retry.
- Jika final failure terjadi pada video mode `hls`, worker sekarang:
  - menandai marker fallback internal di `errorMessage`
  - mengganti mode ke `mp4`
  - mengembalikan status ke `pending`
  - enqueue ulang job processing otomatis
- Tujuannya menurunkan jumlah status `FAILED` di UI tanpa intervensi manual user.
- Fallback hanya dicoba sekali per video (berdasarkan marker), untuk menghindari loop tak berujung.

#### 20. Admin users full edit

- Melengkapi edit user di Admin Studio agar admin bisa update:
  - name
  - email
  - password (optional)
  - plan
  - role
  - status
- Backend `PUT /admin/users/:id` sekarang menerima field lengkap di atas.
- Menambahkan validasi uniqueness email pada update user.
- Password update sekarang di-hash ulang menggunakan helper crypto sebelum disimpan.
- Mengunci `GET /admin/users` agar wajib lolos admin auth.

#### 21. Admin user expiry calendar + full-width selects

- Dialog edit user sekarang mendukung pengaturan `planEndDate` langsung dari UI calendar.
- Menambahkan date picker berbasis komponen `shadcn` (`Popover` + `Calendar`) untuk memilih masa expired.
- Menambahkan tombol `Clear` untuk menghapus input expiry date di form.
- Memperlebar dropdown trigger `Plan`, `Role`, dan `Status` menjadi full width agar layout form konsisten ke kanan.

### Current structure snapshot

```text
backend/src/modules/
├── admin
├── auth
├── billing
├── folder
├── storage
└── video
```

### Important decisions

- BullMQ worker adalah executor async utama untuk video processing.
- Runtime `api` dan `worker` dipisah, tapi tetap dalam satu repo.
- Modularisasi dilakukan bertahap dengan wrapper compatibility.
- Auth/admin guard memakai shared resolver/helper yang stabil untuk Elysia.

### Known follow-up ideas

- tambah action retry/requeue di Worker Monitor
- rapikan shared DTO/contracts lintas frontend-backend
- tambah smoke test untuk upload video dan monitor worker
- pecah dokumentasi admin menjadi referensi yang lebih detail
- lanjut menghilangkan `any` di halaman Studio yang masih tersisa

### Verification during session

- `backend`: `bunx tsc --noEmit`
- `frontend`: `npm run typecheck`

Kedua command tersebut lulus setelah perubahan terakhir di sesi ini.
