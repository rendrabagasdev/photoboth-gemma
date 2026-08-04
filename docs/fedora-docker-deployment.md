# Deployment Docker di Fedora

Docker Compose adalah target runtime utama saat acara. Aplikasi tetap satu modular
monolith: React/Vite dan API Node dibangun menjadi satu image, sedangkan CUPS tetap
berjalan native di Fedora agar queue USB maupun Wi-Fi dikelola host.

```text
iPad (HTTPS :3000)
        │
        ▼
Docker container: Node + dist + lp/lpstat
        │ CUPS_SERVER=127.0.0.1:631
        ▼
CUPS Fedora → queue Epson
```

Mode `network_mode: host` sengaja hanya dipakai pada target Linux/Fedora. Aplikasi
bind ke `0.0.0.0:3000`, tetapi container mencapai CUPS melalui localhost host sehingga
port administrasi CUPS tidak perlu dibuka ke LAN.

## 1. Persiapan Fedora

Jika Docker Engine belum terpasang, gunakan repository resmi Docker untuk Fedora:

```bash
sudo dnf config-manager addrepo --from-repofile https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker.service
```

Instruksi dapat berubah mengikuti versi Fedora; cocokkan dengan
[dokumentasi instalasi Docker Engine Fedora](https://docs.docker.com/engine/install/fedora/).
Pastikan Docker Engine dan plugin Compose tersedia:

```bash
docker --version
docker compose version
sudo systemctl is-enabled docker.service
```

Contoh selanjutnya mengasumsikan user sudah berizin mengakses Docker daemon. Jika
belum, jalankan command Docker dengan `sudo` atau ikuti post-install resmi. Akses ke
Docker daemon setara dengan hak administratif, jadi jangan menambah user yang tidak
dipercaya ke group Docker.

Pastikan CUPS aktif dan listen pada localhost:

```bash
sudo systemctl enable --now cups.service
lpstat -p -d
ss -ltn | grep ':631'
```

Expected result `ss` memuat listener `127.0.0.1:631` atau `*:631`. Jangan membuka
port 631 ke LAN hanya untuk container. Jika tidak ada listener TCP, periksa directive
`Listen localhost:631` pada konfigurasi CUPS Fedora lalu restart CUPS.

## 2. Konfigurasi

Dari root repository:

```bash
cp .env.example .env
id -u
id -g
```

Edit `.env`. Minimal:

```env
VITE_OPERATOR_PIN=ganti-pin
VITE_OPERATOR_TOKEN=ganti-token-lokal-yang-panjang

HOSTNAME=0.0.0.0
PORT=3000
APP_UID=1000
APP_GID=1000
CUPS_SERVER=127.0.0.1:631

PRINTER_NAME=EpsonL3251
PRINT_TEMP_DIR=/tmp/photobooth-print
```

`APP_UID` dan `APP_GID` harus mengikuti output Fedora, bukan selalu `1000`.
`PRINTER_NAME` harus mengikuti output `lpstat -p -d` dan tidak diasumsikan oleh image.

Untuk HTTPS, simpan sertifikat dan private key di directory `certs/` yang tidak masuk
Git, lalu gunakan path container:

```env
HTTPS_CERT_FILE=/app/certs/fedora-ip.pem
HTTPS_KEY_FILE=/app/certs/fedora-ip-key.pem
```

Mount memakai label SELinux `:Z` dan bersifat read-only. Pastikan UID yang diatur lewat
`APP_UID` dapat membaca private key. Jangan memasukkan private key ke image.

## 3. Build dan menjalankan di background

```bash
docker compose config
docker compose build
docker compose up -d
```

Tidak perlu menjalankan `pnpm start`, PM2, atau systemd service aplikasi. Compose
memakai `restart: unless-stopped`; container kembali hidup setelah Docker daemon dan
Fedora restart. Yang tetap wajib diaktifkan lewat systemd hanyalah `docker.service`
dan `cups.service`.

Periksa status:

```bash
docker compose ps
docker compose logs --tail=100 photobooth
docker inspect --format '{{json .State.Health}}' tobfest-photobooth
curl -k https://127.0.0.1:3000/api/health
```

Jika HTTPS belum dikonfigurasi, gunakan `http://127.0.0.1:3000/api/health`.
Opsi `curl -k` hanya untuk diagnosis lokal; iPad harus mempercayai root CA.

## 4. Verifikasi CUPS dari container

```bash
docker compose exec photobooth lpstat -r
docker compose exec photobooth sh -lc 'lpstat -p "$PRINTER_NAME"'
docker compose exec photobooth sh -lc 'lpstat -o "$PRINTER_NAME"'
```

Uji end-to-end tetap dilakukan dari tombol **Cetak 4R**. Command `lp` di container
mengirim isi file ke scheduler CUPS; file sementara tetap berada di tmpfs container
dan dihapus sesudah submit berhasil maupun gagal.

## 5. Update dan rollback

Setelah source berubah:

```bash
docker compose build
docker compose up -d --remove-orphans
docker compose logs --tail=100 photobooth
```

Perubahan `.env` memerlukan recreate, bukan hanya restart:

```bash
docker compose up -d --force-recreate
```

Untuk menghentikan sementara:

```bash
docker compose stop
```

Untuk menghidupkan lagi:

```bash
docker compose start
```

`docker compose down` menghapus container dan network metadata, tetapi tidak menghapus
source, `.env`, sertifikat, atau image. Jangan jalankan systemd service photobooth lama
bersamaan karena keduanya akan berebut port 3000:

```bash
sudo systemctl disable --now photobooth.service
```

## 6. Uji reboot dan offline

```bash
sudo reboot
```

Setelah Fedora hidup:

```bash
systemctl is-active docker.service cups.service
docker compose ps
curl -k https://127.0.0.1:3000/api/health
```

Kemudian putuskan WAN tetapi pertahankan LAN. Dari iPad buka URL HTTPS IP Fedora,
ambil foto, buat hasil ber-frame, scan QR dari perangkat lain, dan kirim print. Seluruh
asset, QR lokal, serta endpoint print tetap berjalan tanpa internet.

## 7. Troubleshooting

### Container terus restart

```bash
docker compose logs --tail=200 photobooth
```

Periksa path sertifikat, permission private key, dan apakah image sudah berhasil build.

### Health hidup tetapi printer unavailable

```bash
ss -ltn | grep ':631'
docker compose exec photobooth sh -lc 'echo "$CUPS_SERVER"; lpstat -r; lpstat -p -d'
```

Pastikan `CUPS_SERVER=127.0.0.1:631`, CUPS host aktif, dan queue sesuai `.env`.

### Port 3000 sudah dipakai

```bash
sudo ss -ltnp | grep ':3000'
sudo systemctl disable --now photobooth.service
```

Hentikan runtime Node/systemd lama sebelum `docker compose up -d`.

### Sertifikat tidak dapat dibaca

Samakan `APP_UID`/`APP_GID` dengan pemilik file di Fedora. Jangan mengubah private key
menjadi world-readable. Cek mount dengan:

```bash
docker compose run --rm photobooth sh -lc 'id; ls -l /app/certs'
```
