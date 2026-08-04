# QR Publik dengan Cloudflare R2

Dokumen ini menetapkan arsitektur target untuk QR yang harus dapat dibuka dari luar
jaringan lokal acara. Cloudflare **R2** adalah object storage S3-compatible; ini bukan
Cloudflare Tunnel dan bukan AWS S3.

> **Status implementasi:** runtime yang tersedia saat ini masih menyimpan share lokal
> di RAM Fedora, sedangkan deployment Vercel legacy memakai Vercel Blob. Konfigurasi
> R2 di bawah adalah keputusan arsitektur dan panduan provisioning untuk tahap
> integrasi provider R2 berikutnya. Mengisi environment R2 saja belum mengubah provider
> sampai adapter R2 pada server selesai diimplementasikan dan divalidasi.

## 1. Keputusan arsitektur

```text
iPad ──HTTPS/LAN──> Fedora Docker
                         ├─ POST /api/print ──> CUPS Fedora ──> Epson
                         └─ POST /api/shares
                                  │ upload keluar melalui tethering/WAN
                                  ▼
                         Cloudflare R2 private
                                  ▲
                                  │ R2 binding
QR tamu ──Internet──> Cloudflare Worker + public custom domain
```

Pembagian tanggung jawab:

- Aplikasi, kamera, canvas, frame, IndexedDB, dan print tetap lokal di Fedora/iPad.
- Fedora mengunggah foto final dan Live Photo ke R2 melalui S3 API.
- R2 menyimpan object secara sementara.
- Worker menyajikan halaman download publik dan memeriksa masa berlaku share.
- CUPS dan endpoint print tidak pernah diekspos melalui Worker.
- Jika WAN gagal, pengambilan foto dan print tetap berjalan; hanya pembuatan QR yang
  gagal dan harus menyediakan retry.

Tethering hanya dibutuhkan sebagai koneksi keluar untuk upload R2. Tidak perlu port
forwarding, public IP, Cloudflare Tunnel, Tailscale Funnel, atau Caddy untuk flow share
ini. Server lokal saja tidak dapat membuat QR yang dapat dibuka dari internet.

## 2. Mengapa R2 private + Worker

Bucket public langsung lebih sederhana, tetapi semua object dapat diakses melalui URL
object dan tidak memiliki validasi expiry aplikasi yang presisi. Target produksi
menggunakan bucket private dengan Worker karena:

- credential R2 hanya berada di Fedora dan binding Worker;
- Worker dapat menolak share tepat setelah `expiresAt`;
- layout halaman download tidak perlu disimpan sebagai HTML public di bucket;
- storage key dan manifest tidak perlu diekspos langsung;
- custom domain mendapat HTTPS publik yang dipercaya Android, iOS, macOS, dan browser
  tamu tanpa memasang root CA lokal;
- endpoint lokal seperti `/api/print` tidak ikut tersedia di internet.

Public Development URL `r2.dev` hanya dipakai untuk test awal. Untuk acara gunakan
custom domain, misalnya `share.example.com`.

Referensi resmi:

- [R2 S3-compatible API](https://developers.cloudflare.com/r2/get-started/s3/)
- [R2 Workers binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [R2 public bucket dan custom domain](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [R2 object lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)

## 3. Resource Cloudflare yang diperlukan

Siapkan di account Cloudflare:

1. Bucket private, contoh `tobfest-shares`.
2. R2 API token dengan izin **Object Read & Write** hanya untuk bucket tersebut.
3. Worker dengan R2 binding, contoh binding `SHARES_BUCKET`.
4. Custom domain Worker, contoh `share.example.com`.
5. Lifecycle rule untuk prefix `shares/` sebagai cleanup cadangan.

Jangan mengaktifkan Public Development URL atau public bucket pada production jika
semua download dilayani Worker. Jangan memberikan token account-wide apabila token
bucket-scoped sudah cukup.

Cloudflare menampilkan secret access key hanya saat token dibuat. Simpan di password
manager dan `.env` Fedora; jangan menaruhnya di source, frontend `VITE_*`, image Docker,
log, screenshot, atau dokumentasi.

## 4. Environment target Fedora

Environment berikut akan digunakan oleh adapter R2 pada server lokal:

```env
SHARE_PROVIDER=r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=tobfest-shares
R2_PUBLIC_BASE_URL=https://share.example.com
R2_UPLOAD_TIMEOUT_MS=30000
SHARE_TTL_HOURS=24
MAX_SHARE_UPLOAD_MB=12
MAX_CONCURRENT_SHARE_UPLOADS=2
```

Endpoint S3 diturunkan dari account ID:

```text
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

`R2_PUBLIC_BASE_URL` adalah origin Worker/custom domain yang akan dimasukkan ke QR,
bukan endpoint S3 dan bukan alamat IP Fedora.

## 5. Struktur object target

Setiap share memakai UUID yang dibuat server:

```text
shares/<uuid>/manifest.json
shares/<uuid>/photo.jpg
shares/<uuid>/live.mp4
```

Manifest minimal:

```json
{
  "id": "uuid",
  "photoType": "image/jpeg",
  "liveType": "video/mp4",
  "expiresAt": "ISO-8601 timestamp",
  "destroyTokenHash": "sha256"
}
```

Token mentah hanya dikembalikan ke iPad dan tidak disimpan di R2. Server menyimpan hash
untuk memvalidasi request penghapusan. Object key selalu dibuat server dan tidak
menggunakan nama file dari client.

## 6. Flow aplikasi target

```text
Hasil final selesai
→ iPad POST multipart ke /api/shares pada Fedora
→ Fedora memvalidasi ukuran dan MIME
→ Fedora upload manifest, JPG, dan MP4 ke R2
→ Fedora mengembalikan https://share.example.com/download/<uuid>
→ aplikasi membuat QR dari URL publik
→ tamu scan QR dari jaringan mana pun
→ Worker membaca manifest melalui R2 binding
→ Worker menolak jika expired atau object hilang
→ tamu mengunduh foto dan Live Photo
```

Browser iPad tetap memanggil URL relatif `/api/shares`. Credential R2 tidak pernah
dikirim ke browser. Dengan desain ini tidak diperlukan CORS antara iPad dan Cloudflare.

Saat tombol **Mulai lagi** ditekan, aplikasi mengirim `DELETE /api/shares/<uuid>` ke
Fedora menggunakan destroy token yang sudah ada. Adapter R2 menghapus ketiga object.
Lifecycle rule menjadi cleanup cadangan jika perangkat mati sebelum DELETE selesai.

## 7. Expiry dan lifecycle

Worker wajib memeriksa `expiresAt` dan mengembalikan HTTP `404` atau `410` segera saat
share berakhir. Lifecycle R2 bukan satu-satunya kontrol expiry karena penghapusan fisik
dapat terjadi beberapa waktu setelah batas lifecycle.

Atur rule pada prefix `shares/`, misalnya delete setelah dua hari. Worker tetap
menyembunyikan share setelah 24 jam; hari tambahan memberi toleransi terhadap jadwal
cleanup R2 tanpa membuat link tetap dapat digunakan.

## 8. Perilaku saat internet gagal

Kegagalan upload R2 tidak boleh membatalkan hasil foto atau print. UI share perlu:

- menampilkan bahwa internet/share tidak tersedia;
- mempertahankan hasil sesi di IndexedDB seperti perilaku saat ini;
- menyediakan retry dengan request ID yang sama;
- tidak membuat QR dengan IP lokal sebagai fallback karena QR tersebut tidak dapat
  digunakan dari luar LAN;
- tidak mengirim job print ulang ketika hanya retry upload share.

Share yang sudah berhasil masuk R2 tetap dapat diakses tamu walaupun Fedora kemudian
restart atau tethering acara terputus.

## 9. Security minimum

- Bucket tetap private.
- API token dibatasi ke satu bucket dan Object Read & Write.
- Secret hanya berada di `.env` Fedora dan tidak memiliki prefix `VITE_`.
- Worker hanya melayani route download yang diperlukan.
- Validasi UUID, MIME, magic bytes, ukuran, dan expiry dilakukan server-side.
- Download response memakai `X-Content-Type-Options: nosniff` dan content disposition
  yang aman.
- Worker tidak menyediakan listing bucket.
- `/api/print`, dashboard operator, dan aplikasi lokal tidak diroute ke domain publik.
- Log tidak mencetak credential, destroy token, isi foto, atau presigned URL.

## 10. Pengujian penerimaan

Setelah adapter R2 dan Worker tersedia, validasi:

1. Buat share dari iPad melalui LAN Fedora.
2. Matikan Wi-Fi pada ponsel tamu dan gunakan jaringan seluler.
3. Scan QR dan pastikan halaman custom domain terbuka tanpa warning sertifikat.
4. Unduh JPG dan MP4, lalu cocokkan ukuran/MIME.
5. Restart container Fedora dan pastikan QR yang sudah diunggah tetap hidup.
6. Tekan **Mulai lagi** pada sesi baru dan pastikan URL menjadi tidak tersedia.
7. Simulasikan WAN putus; kamera dan print harus tetap berhasil sementara share memberi
   status gagal/retry.
8. Verifikasi object expired tidak disajikan Worker dan akhirnya dibersihkan lifecycle.

## 11. Pilihan yang tidak digunakan

- **Cloudflare Tunnel:** cocok untuk mengekspos server di balik CGNAT, tetapi membuat
  download tamu bergantung pada Fedora, tethering, dan proses tunnel tetap hidup.
- **Tailscale biasa:** hanya dapat diakses anggota tailnet; tidak cocok untuk QR tamu.
- **Tailscale Funnel:** dapat public, tetapi tetap meneruskan trafik ke Fedora dan
  menambah ketergantungan runtime.
- **Caddy:** reverse proxy/TLS, bukan solusi melewati CGNAT atau object storage.
- **Vercel Blob:** tetap dipertahankan hanya untuk deployment Vercel legacy sampai
  migrasi R2 selesai dan tervalidasi; tidak menjadi target share Fedora baru.
