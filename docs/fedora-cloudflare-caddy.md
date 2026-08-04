# Cloudflare Tunnel dan Caddy untuk HTTPS Publik

Mode ini menghilangkan kebutuhan memasang root CA `mkcert` pada iPad, Android, dan
Mac. Cloudflare mengakhiri HTTPS publik, lalu Tunnel meneruskan HTTP melalui Caddy ke
server photobooth pada Fedora.

```text
Browser
  → https://photobooth.ovastudio.dev
  → Cloudflare edge
  → cloudflared (outbound tunnel)
  → Caddy:80
  → host.docker.internal:3000
  → Node photobooth HTTP
  → CUPS Fedora
```

Cloudflare Tunnel untuk booth berbeda dari R2: Tunnel menyediakan akses aplikasi,
sedangkan R2/Worker nantinya menyimpan hasil QR agar download tidak bergantung pada
Fedora tetap online.

## 1. Konfigurasi photobooth

Isi `.env` repository photobooth:

```env
HOSTNAME=0.0.0.0
PORT=3000
PUBLIC_ORIGIN=https://photobooth.ovastudio.dev

HTTPS_CERT_FILE=
HTTPS_KEY_FILE=
```

`PUBLIC_ORIGIN` tidak memakai trailing slash. Nilai ini membuat server menghasilkan
URL QR dengan HTTPS publik dan menerima POST same-origin walaupun koneksi dari Caddy ke
Node menggunakan HTTP internal.

Rebuild dan recreate container:

```bash
docker compose build
docker compose up -d --force-recreate
docker compose logs --tail=50 photobooth
```

Expected log:

```text
TOBFest Photobooth listening on http://0.0.0.0:3000
Public origin: https://photobooth.ovastudio.dev
```

Uji dari Fedora host sebelum melibatkan proxy:

```bash
curl http://127.0.0.1:3000/api/health
```

## 2. Konfigurasi container Caddy

Photobooth memakai `network_mode: host` agar dapat mencapai CUPS host melalui
`127.0.0.1:631`. Karena itu Caddy tidak dapat memanggil nama container photobooth.
Tambahkan host gateway ke service **Caddy**, bukan service `whoami`:

```yaml
services:
  caddy:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Nama `host.docker.internal` ditulis persis seperti itu dan tidak diganti IP Fedora.
Template tersedia di
[`deploy/caddy/compose.override.example.yaml`](../deploy/caddy/compose.override.example.yaml).

Recreate Caddy setelah Compose berubah:

```bash
cd ~/selfhosted/proxy/caddy
docker compose up -d --force-recreate
```

Pastikan mapping tersedia:

```bash
docker compose exec caddy getent hosts host.docker.internal
```

## 3. Caddyfile

Command untuk mengedit adalah:

```bash
nano ~/selfhosted/proxy/caddy/conf/Caddyfile
```

Jangan memakai `cat nano ...`; command tersebut meminta `cat` membaca file bernama
`nano`.

Tambahkan:

```caddyfile
http://photobooth.ovastudio.dev {
    reverse_proxy host.docker.internal:3000
}
```

Template tersedia di
[`deploy/caddy/Caddyfile.photobooth.example`](../deploy/caddy/Caddyfile.photobooth.example).
Awalan `http://` disengaja: browser tetap mendapat HTTPS dari Cloudflare, sedangkan
cloudflared berbicara HTTP ke Caddy pada network Docker lokal.

Validasi lalu reload/recreate Caddy sesuai struktur image yang digunakan:

```bash
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs --tail=100 caddy
```

Path `/etc/caddy/Caddyfile` harus disesuaikan jika compose Caddy me-mount file ke lokasi
lain.

## 4. Cloudflare Tunnel

Pada public hostname Tunnel, gunakan:

```text
Hostname: photobooth.ovastudio.dev
Service type: HTTP
Service URL: caddy:80
```

Container `cloudflared` dan `caddy` harus bergabung pada external Docker network yang
sama, misalnya `proxy`. Jangan memilih `HTTPS` untuk service URL jika Caddyfile hanya
listen pada HTTP port 80.

Contoh network pada kedua Compose:

```yaml
networks:
  proxy:
    external: true
```

dan pada masing-masing service:

```yaml
networks:
  - proxy
```

## 5. Diagnosis Cloudflare 502

Halaman Cloudflare dengan **Browser Working**, **Cloudflare Working**, dan **Host
Error** berarti DNS/TLS publik sudah benar, tetapi cloudflared tidak dapat mencapai
Caddy atau Caddy tidak dapat mencapai photobooth.

Periksa berurutan:

```bash
# 1. Node hidup pada Fedora host
curl http://127.0.0.1:3000/api/health

# 2. Caddy mengenali host gateway
docker exec caddy getent hosts host.docker.internal

# 3. Caddy dapat mencapai Node
docker exec caddy wget -qO- http://host.docker.internal:3000/api/health

# 4. Periksa Caddy dan Tunnel
docker logs --tail=100 caddy
docker logs --tail=100 cloudflared
```

Jika nama container berbeda, ganti `caddy` atau `cloudflared` pada command Docker.
Jika image Caddy tidak menyediakan `wget`, jalankan test menggunakan tool HTTP yang
tersedia dalam image atau container diagnostik pada network `proxy`.

Penyebab umum 502:

- photobooth belum hidup atau tidak bind ke `0.0.0.0:3000`;
- `extra_hosts` ditambahkan ke service yang salah;
- Caddy belum direcreate setelah Compose berubah;
- cloudflared dan Caddy tidak berada di network `proxy` yang sama;
- public hostname Tunnel memakai `https://caddy:443`, padahal Caddy listen HTTP `:80`;
- Caddyfile belum di-reload atau hostname salah eja.

## 6. Security

Jangan membuka booth publik tanpa perlindungan. Siapa pun yang dapat membuka aplikasi
dapat mencoba endpoint print. Pasang Cloudflare Access pada
`photobooth.ovastudio.dev` dan izinkan hanya operator/iPad acara.

Domain QR berbasis R2/Worker, misalnya `share.ovastudio.dev`, tetap public dan tidak
memiliki route menuju `/api/print`.

`PUBLIC_ORIGIN` membantu validasi browser same-origin, tetapi bukan pengganti autentikasi
karena HTTP client non-browser dapat memalsukan header `Origin`.

## 7. Konsekuensi offline

Mode ini bergantung pada Internet, DNS Cloudflare, dan tunnel aktif. Jika tethering
putus, browser tidak dapat mencapai aplikasi melalui domain publik meskipun Node dan
CUPS masih hidup di Fedora. Untuk fallback offline penuh tetap diperlukan URL LAN
dengan sertifikat yang dipercaya perangkat atau solusi split-DNS dengan sertifikat
publik yang dikelola terpisah.
