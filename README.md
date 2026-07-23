# TOBFest Photobooth

Aplikasi photobooth on-site berbasis React + TypeScript untuk digunakan sebagai kiosk di iPad. Pengunjung memilih frame, mengambil foto sesuai jumlah slot frame, melakukan retake, lalu mengunduh atau mencetak hasilnya. Operator dapat menambah dan mengatur frame langsung dari perangkat.

## Fitur

- Alur kiosk: landing → pilih frame → kamera → review → hasil.
- Jumlah foto otomatis mengikuti jumlah slot pada layout frame terpilih.
- Live Photo per slot: foto resolusi tinggi + video 4 detik (2 detik sebelum dan sesudah shutter).
- Kamera menggunakan rasio portrait `4:5`; ukuran setiap area foto pada frame dapat di-resize bebas.
- Retake per foto.
- Komposisi photo strip di browser menggunakan Canvas.
- Satu frame bawaan **Double Feature** menggunakan dua foto 4:5; frame lainnya dibuat operator melalui upload PNG.
- Unduh JPG dan cetak melalui dialog print/AirPrint.
- Tambah frame PNG dari dashboard operator.
- Aktif/nonaktifkan dan pilih frame default.
- Penyimpanan lokal menggunakan IndexedDB/Dexie.
- PWA dengan cache aset untuk penggunaan di lapangan.
- Tampilan responsif untuk iPad portrait dan landscape.

## Arsitektur Modular Monolith

Aplikasi tetap dibangun dan dijalankan sebagai satu unit, tetapi setiap fitur memiliki batas modul sendiri:

```text
src/
├── bootstrap/          # composition root dan dependency wiring
├── config/             # konfigurasi aplikasi
├── modules/
│   ├── app-lock/       # PIN operator
│   ├── booth/          # orkestrasi alur kiosk
│   ├── camera/         # capture dan komposisi foto
│   ├── frames/         # domain dan pengelolaan frame
│   ├── operator/       # dashboard operator
│   └── sessions/       # domain dan penyimpanan sesi
└── shared/             # database dan utilitas lintas modul
```

Setiap modul dapat memiliki lapisan `domain`, `application`, `infrastructure`, dan `presentation`. UI tidak mengakses database secara langsung; dependency disusun di `bootstrap/app-container.ts`.

## Menjalankan Aplikasi

```bash
npm install
npm run dev
```

Pada mode development, endpoint QR tersedia langsung melalui Vite. Untuk memindai QR dari ponsel, buka alamat **Network** yang ditampilkan Vite, bukan alamat `localhost`.

Build produksi:

```bash
npm run lint
npm run build
```

## Tema UI

Warna, radius, dan shadow antarmuka dipusatkan sebagai CSS variables pada `:root` di `src/index.css`. Ubah token `--theme-primary`, `--theme-background`, `--theme-surface`, dan token semantik lainnya untuk mengganti tema secara konsisten tanpa mengubah setiap komponen.

Warna pada preset frame tetap dikelola terpisah karena merupakan bagian dari desain hasil foto, bukan tema antarmuka.

### Deployment Vercel

Endpoint QR pada domain produksi menggunakan Vercel Functions dan Vercel Blob:

1. Di dashboard Vercel, buka project → **Storage** → buat atau hubungkan **Private Blob Store**.
2. Pastikan environment `BLOB_READ_WRITE_TOKEN` tersedia untuk Production.
3. Deploy ulang project. Route `POST /api/shares` akan dibuat dari folder `api/`.

File Blob bersifat private dan hanya dialirkan melalui endpoint unduhan aplikasi.

## Dashboard Operator

Tekan tombol pengaturan di kanan atas landing screen. PIN wajib dikonfigurasi melalui environment dan tidak memiliki nilai default di dalam kode.

Buat `.env.local` jika ingin mengganti PIN:

```env
VITE_OPERATOR_PIN=1234
VITE_OPERATOR_TOKEN=ubah-token-lokal-ini
```

Untuk kompatibilitas dengan konfigurasi lama, `APP_LOCK_ENV` juga dapat digunakan sebagai nama variabel PIN. Jika keduanya tersedia, `VITE_OPERATOR_PIN` akan diprioritaskan.

PIN ini merupakan pengunci lokal kiosk, bukan autentikasi server. Gunakan Guided Access pada iPad agar pengunjung tidak dapat keluar dari aplikasi.

## Format Frame

- File berformat PNG; transparansi awal tidak diwajibkan.
- Ukuran, resolusi, dan rasio PNG unggahan bebas; aplikasi menormalkannya ke kanvas strip `600 × 1800 px`.
- PNG merupakan satu desain strip penuh dan akan diduplikasi otomatis ke lembar 4R.
- Hanya frame dua foto **Double Feature** yang disediakan sebagai frame bawaan.
- Setelah upload, operator menambahkan 1–6 area foto secara visual, lalu menggeser, memperbesar, menghapus, atau mengubah urutannya.
- Setiap area memiliki pengaturan radius sudut tersendiri.
- Toggle **Snap** mengunci pergerakan dan ukuran area ke grid 20 px; matikan untuk pengaturan bebas.
- Modal editor berukuran besar dan menampilkan panel **Editor Area** serta **Preview Hasil** secara berdampingan.
- Area foto yang ditandai otomatis dibuat transparan ketika frame disimpan, sehingga PNG awal boleh masih opaque pada bagian tersebut.
- Tulisan **TOBFEST** ditambahkan otomatis pada area kosong bawah setiap strip.
- Ukuran file maksimal 10 MB.
- Frame disimpan secara lokal pada iPad dan tetap tersedia ketika offline.
- Hasil unduhan berupa kanvas 4R portrait `1200 × 1800 px` berisi dua strip identik berukuran `600 × 1800 px`.
- Pada halaman review, setiap foto dapat dipilih, digeser, diperbesar, dan diambil ulang tanpa mengganti frame.
- Live Photo dapat diputar di halaman review dan dibagikan sebagai MP4 dari halaman hasil.
- Tombol Cetak 4R membuka PDF satu halaman berukuran tepat 102 × 152 mm tanpa margin. Dari pratinjau PDF di iPad, pilih AirPrint dengan media 4R dan skala 100%.
- Hasil dibagikan melalui QR; ponsel mendapat dua pilihan unduhan: foto JPG dan video live MP4.
- QR dibuat otomatis setelah hasil selesai diproses.
- Saat **Mulai lagi** ditekan, QR langsung dinonaktifkan dan kedua file dihapus dari object storage. Batas 24 jam tetap menjadi pengaman jika sesi tidak ditutup normal.

Area transparan layout **Frame 4** mengikuti koordinat berikut pada kanvas strip `600 × 1800 px`:

- Foto 1: `x 0`, `y 27`, ukuran `600 × 450`.
- Foto 2: `x 0`, `y 496`, ukuran `600 × 450`.
- Foto 3: `x 0`, `y 965`, ukuran `600 × 450`.

Unduh [paket semua contoh layout](public/templates/tobfest-template-layouts.zip). ZIP berisi contoh PNG Frame 4–9; posisi foto untuk frame baru dapat ditentukan langsung melalui editor slot.

Spesifikasi flow lengkap tersedia di [docs/flow-app.md](docs/flow-app.md).
