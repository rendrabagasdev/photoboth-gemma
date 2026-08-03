# Deployment Lokal Fedora

Dokumen ini menjadikan server Fedora sebagai target utama saat acara. Aplikasi React, endpoint share/QR lokal, health check, dan endpoint print berjalan dalam satu proses Node.js dari repository yang sama. Deployment Vercel lama tetap dapat disimpan, tetapi tidak diperlukan oleh runtime lokal.

## 1. Arsitektur runtime

```text
iPad Safari (LAN)
  ├─ GET aplikasi/aset ───────────────┐
  ├─ POST /api/shares (QR lokal) ─────┤
  └─ POST /api/print (JPEG 4R final) ─┤
                                      ▼
                              Node.js di Fedora
                                ├─ dist/ (Vite)
                                ├─ share sementara di RAM
                                └─ execFile("lp", args)
                                      ▼
                                  CUPS queue
                                      ▼
                                  Epson L3251
```

Foto final dibuat oleh canvas di iPad dan sudah mencakup frame. Server menyimpan upload print hanya di `PRINT_TEMP_DIR` sampai CUPS menerima atau menolak job, lalu selalu menghapus file tersebut. Aplikasi tidak menambah arsip permanen di Fedora.

Perilaku penyimpanan yang sudah ada tetap dipertahankan: sesi, Blob hasil, dan frame upload operator berada di IndexedDB browser iPad dengan nama database `tobfest-photobooth`. Operator dapat menghapus sesi selesai dari dashboard. Share QR lokal berada di RAM proses Node.js maksimal 24 jam dan hilang saat server restart atau ketika sesi ditutup melalui tombol **Mulai lagi**.

## 2. Requirement Fedora

- Fedora dengan akses LAN yang sama dengan iPad.
- Node.js **22.9 atau lebih baru** dan npm. Script `start` memakai dukungan `--env-file-if-exists` dari Node modern.
- CUPS dan command client `lp`/`lpstat`.
- Queue Epson yang sudah dibuat di CUPS, melalui USB atau Wi-Fi.
- Sertifikat HTTPS lokal yang dipercaya iPad sangat direkomendasikan. Safari membatasi kamera pada secure context; akses `http://IP-FEDORA:3000` cocok untuk health/UI test, tetapi kamera iPad dapat ditolak.

Periksa binary aktual, jangan menganggap path tertentu:

```bash
node --version
npm --version
which node
which npm
which lp
which lpstat
```

Jika CUPS belum tersedia:

```bash
sudo dnf install cups cups-client
sudo systemctl enable --now cups.service
```

Pemilihan driver/IPP untuk Epson L3251 dilakukan di CUPS dan tidak di-hardcode oleh aplikasi. Buka `http://localhost:631` dari Fedora atau gunakan `lpadmin` sesuai metode koneksi yang dipilih.

## 3. Instalasi dan build

Dari root repository ini:

```bash
npm install
cp .env.example .env
npm run build
npm run start
```

`npm run start` menyajikan build dari `dist/` dan server hasil kompilasi dari `dist-server/`. Default bind adalah `0.0.0.0:3000`, sehingga request tidak terbatas pada `localhost`.

Setiap perubahan source perlu dibangun ulang:

```bash
npm run lint
npm run typecheck
npm run build
sudo systemctl restart photobooth.service
```

## 4. Konfigurasi `.env`

Minimal konfigurasi untuk acara:

```env
VITE_OPERATOR_PIN=ganti-dengan-pin-operator
VITE_OPERATOR_TOKEN=ganti-dengan-token-lokal-yang-panjang

HOSTNAME=0.0.0.0
PORT=3000

PRINTER_NAME=EpsonL3251
PRINT_TEMP_DIR=/tmp/photobooth-print
MAX_PRINT_FILE_MB=20
PRINT_COMMAND_TIMEOUT_MS=10000
PRINT_REQUEST_TTL_MS=600000
MAX_CONCURRENT_PRINT_JOBS=1

PRINT_MEDIA=
PRINT_QUALITY=
PRINT_FIT_TO_PAGE=true

SHARE_TTL_HOURS=24
MAX_SHARE_UPLOAD_MB=12
MAX_CONCURRENT_SHARE_UPLOADS=2
MAX_SHARE_COUNT=24
MAX_SHARE_MEMORY_MB=128

HTTP_REQUEST_TIMEOUT_MS=30000
MAX_SERVER_CONNECTIONS=50

HTTPS_CERT_FILE=
HTTPS_KEY_FILE=
```

`PRINTER_NAME` harus sama persis dengan nama queue dari `lpstat`; nama Epson di atas hanya contoh konfigurasi acara. `PRINT_MEDIA` dan `PRINT_QUALITY` sengaja kosong sampai nilai CUPS aktual diperiksa. Jika diisi, server meneruskannya sebagai `-o media=<nilai>` dan `-o print-quality=<nilai>`. `PRINT_FIT_TO_PAGE=true` meneruskan opsi CUPS `fit-to-page`; ubah menjadi `false` jika driver Epson/queue sudah mengatur scaling dengan benar.

`MAX_CONCURRENT_PRINT_JOBS=1` membatasi submit CUPS agar tidak saling bertumpuk. Request ID disimpan selama `PRINT_REQUEST_TTL_MS` untuk mendeteksi retry yang mungkin sudah masuk antrean. Share QR dibatasi oleh umur, ukuran upload, jumlah, dan total RAM; jika kapasitas penuh, share paling lama dikeluarkan terlebih dahulu. Batas ini tidak memengaruhi file print sementara.

Jangan isi `VITE_SHARE_API_URL` atau IP Fedora di source. Semua request aplikasi memakai URL relatif ke origin yang sedang dibuka.

## 5. Konfigurasi dan uji CUPS

Temukan queue dan default printer:

```bash
lpstat -p -d
```

Periksa opsi yang benar-benar didukung queue:

```bash
lpoptions -p EpsonL3251 -l
```

Uji langsung tanpa aplikasi:

```bash
lp -d EpsonL3251 test.jpg
lpstat -o EpsonL3251
```

Jangan mengisi media atau kualitas dari tebakan. Salin keyword/nilai yang ditampilkan `lpoptions`, lalu restart server setelah mengubah `.env`.

Health check aplikasi memakai `lpstat -p <queue>` dan cache singkat lima detik:

```bash
curl http://127.0.0.1:3000/api/health
```

Contoh response sehat:

```json
{
  "status": "ok",
  "printer": {
    "name": "EpsonL3251",
    "available": true,
    "state": "printer EpsonL3251 is idle..."
  }
}
```

## 6. Uji endpoint tanpa printer fisik

Untuk menguji validasi dan failure handling, set `PRINTER_NAME` ke nama queue yang tidak ada, restart aplikasi, lalu kirim JPEG valid:

```bash
REQUEST_ID=$(cat /proc/sys/kernel/random/uuid)
curl -i \
  -X POST \
  -H "Content-Type: image/jpeg" \
  -H "X-Print-Request-Id: ${REQUEST_ID}" \
  --data-binary @test.jpg \
  http://127.0.0.1:3000/api/print
```

Expected result adalah HTTP `503` dengan `printer_queue_not_found` atau `printer_offline`, dan direktori sementara tidak menyisakan file. Ulangi request dengan UUID yang sama untuk memverifikasi HTTP `409 duplicate_print_failed`. Job yang sudah diterima menghasilkan `duplicate_print_queued`; timeout menghasilkan `duplicate_print_uncertain`. Kirim file kosong, tipe selain JPEG/PNG, serta file di atas `MAX_PRINT_FILE_MB` untuk memverifikasi HTTP `400`, `415`, dan `413`.

Jika paket CUPS Fedora menyediakan `ippeveprinter`, utilitas tersebut dapat dipakai untuk membuat tujuan IPP sementara tanpa printer fisik. Pastikan queue virtual terpisah dari queue acara dan hapus setelah pengujian. Karena ketersediaan utilitas berbeda antar-versi Fedora, failure-path test di atas tetap menjadi baseline yang tidak bergantung paket tambahan.

## 7. Uji endpoint dengan CUPS

Setelah command `lp -d EpsonL3251 test.jpg` berhasil, kembalikan `PRINTER_NAME` ke queue aktual dan restart server. Kirim request yang sama dengan UUID baru. Expected result:

```json
{
  "status": "queued",
  "message": "Foto masuk antrean CUPS.",
  "printer": "EpsonL3251",
  "jobId": "EpsonL3251-123"
}
```

Konfirmasi job:

```bash
lpstat -o EpsonL3251
```

Endpoint hanya menyatakan **masuk antrean**, bukan menjamin kertas sudah keluar. Status fisik akhir tetap diperiksa melalui CUPS/printer.

## 8. Firewall dan akses iPad

Buka port aplikasi:

```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

Temukan IP LAN Fedora:

```bash
ip -brief address
```

Dengan HTTP, buka `http://IP-FEDORA:3000`. Dengan TLS, buka `https://IP-FEDORA:3000`. Jangan menaruh IP ini di `.env` frontend atau source code; iPad memakai origin halaman untuk semua API internal.

Pastikan access point tidak memakai client isolation/AP isolation, karena fitur itu mencegah iPad menghubungi Fedora walaupun berada pada SSID yang sama.

## 9. HTTPS lokal untuk kamera iPad

Sertifikat harus memiliki IP Fedora pada Subject Alternative Name dan ditandatangani CA yang dipercaya iPad. Pilihan praktis adalah membuat CA lokal di laptop admin (misalnya dengan `mkcert` atau OpenSSL), membuat sertifikat untuk IP Fedora, kemudian:

1. Salin certificate dan private key server ke dalam direktori terbatas di repository/server, misalnya `certs/fedora-ip.pem` dan `certs/fedora-ip-key.pem`.
2. Set permission private key agar hanya user service dapat membacanya.
3. Set `HTTPS_CERT_FILE=certs/fedora-ip.pem` dan `HTTPS_KEY_FILE=certs/fedora-ip-key.pem`.
4. Instal certificate CA (bukan private key) sebagai profile di iPad.
5. Di iPad buka **Settings → General → About → Certificate Trust Settings**, lalu aktifkan full trust untuk CA lokal tersebut.
6. Buka URL HTTPS dan pastikan Safari tidak menampilkan peringatan sertifikat sebelum menguji kamera.

Jaga private key tetap lokal dan jangan commit direktori `certs/`. Tambahkan pola lokal sendiri ke `.git/info/exclude` atau simpan certificate di luar repository lalu gunakan path absolut pada environment. Server menerima path absolut maupun relatif terhadap root repository.

## 10. systemd

Catat hasil `which npm`. Gunakan path itu pada `ExecStart`; contoh berikut memakai placeholder karena path Fedora tergantung metode instalasi Node:

```ini
[Unit]
Description=TOBFest Photobooth Local Server
After=network-online.target cups.service
Wants=network-online.target
Requires=cups.service

[Service]
Type=simple
User=USER_FEDORA
Group=USER_FEDORA
WorkingDirectory=/home/USER_FEDORA/photo-both-tobfest
EnvironmentFile=/home/USER_FEDORA/photo-both-tobfest/.env
ExecStart=/PATH/DARI/WHICH/NPM run start
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
UMask=0077

# Hardening yang kompatibel dengan Node dan client CUPS
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=read-only
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ReadWritePaths=/tmp
MemoryMax=512M
TasksMax=64
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

Simpan sebagai `/etc/systemd/system/photobooth.service`, ganti seluruh placeholder berdasarkan lokasi clone aktual dan hasil `which npm`, lalu:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now photobooth.service
sudo systemctl status photobooth.service
journalctl -u photobooth.service -f
```

Jangan menjalankan build dari `ExecStart`; build dilakukan saat deployment agar restart service cepat dan deterministik. Pastikan user service memiliki izin membaca repository/TLS key, menulis `PRINT_TEMP_DIR`, dan mengirim job ke CUPS. Jika `PRINT_TEMP_DIR` dipindah keluar `/tmp`, sesuaikan `ReadWritePaths` dengan path aktual sebelum mengaktifkan `ProtectSystem=strict`.

## 11. Uji tanpa internet

1. Selesaikan `npm install` dan build ketika dependency masih tersedia.
2. Putuskan koneksi WAN/internet, tetapi pertahankan LAN antara Fedora, iPad, dan printer Wi-Fi.
3. Restart Fedora atau service agar test tidak bergantung dev server.
4. Buka aplikasi dari IP LAN Fedora.
5. Jalankan flow lengkap: pilih frame → kamera → review → hasil → Cetak 4R.
6. Pastikan UI menampilkan **Menyiapkan foto**, **Mengirim ke printer**, lalu **Masuk antrean**.
7. Pastikan `lpstat -o <queue>` menampilkan job dan `PRINT_TEMP_DIR` tidak menyisakan file setelah request selesai.
8. Uji retry dengan mematikan printer/men-disable queue, lalu hidupkan kembali dan tekan **Coba cetak lagi**.
9. Simulasikan koneksi iPad terputus sesaat setelah menekan Print. Retry harus memakai request ID yang sama; server mengembalikan status job sebelumnya dan tidak mengirim job kedua.

Semua asset runtime berasal dari build lokal. Satu-satunya dependency network saat acara adalah jaringan lokal antar-perangkat; tidak ada CDN, Google Fonts, analytics, atau API eksternal pada flow lokal.

## 12. Troubleshooting

### Kamera tidak muncul di iPad

- Pastikan URL memakai HTTPS dengan sertifikat terpercaya, bukan HTTP ke IP LAN.
- Periksa izin Camera untuk Safari/site di iPad.
- Pastikan tidak ada peringatan sertifikat.

### `printer_queue_not_found`

- Bandingkan `PRINTER_NAME` dengan output `lpstat -p -d`; pencocokan case-sensitive.
- Jalankan `lpstat -p "$PRINTER_NAME"` sebagai user yang menjalankan systemd.

### Printer offline atau queue disabled

```bash
lpstat -p EpsonL3251 -l
sudo cupsenable EpsonL3251
sudo cupsaccept EpsonL3251
systemctl status cups.service
```

Periksa kabel USB, IP printer, SSID, dan alamat device queue di CUPS. Untuk Wi-Fi, printer dan Fedora harus tetap dapat saling menjangkau ketika WAN diputus.

### `lp` atau `lpstat` tidak ditemukan

Instal `cups-client`, periksa `PATH` milik service, dan lihat log `journalctl -u photobooth.service`.

### Job queued tetapi ukuran/kualitas salah

Jalankan `lpoptions -p EpsonL3251 -l`, cek media default CUPS, dan baru kemudian set `PRINT_MEDIA`, `PRINT_QUALITY`, atau `PRINT_FIT_TO_PAGE`. Nilai yang benar tergantung driver/queue aktual Epson dan harus diuji dengan kertas acara.

### Tombol menampilkan gagal tetapi job ternyata masuk

Tekan retry satu kali. Client mempertahankan request ID ketika respons server tidak diketahui, sehingga server akan melaporkan job sebelumnya sebagai `queued` alih-alih memanggil `lp` lagi. Tetap periksa `lpstat -o` dan log CUPS bila status belum jelas. Naikkan `PRINT_COMMAND_TIMEOUT_MS` hanya jika command CUPS memang lambat.
