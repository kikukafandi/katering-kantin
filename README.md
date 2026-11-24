# Katering PENS

Website promosi tenant kantin PENS dengan pemesanan lewat WhatsApp.
Situs statis tanpa database. Semua data tenant dan menu ada di `public/data.json`.

- `public/index.html` untuk halaman web
- `public/data.json` untuk data tenant dan menu
- `public/img/` untuk foto menu dan banner, beserta `KREDIT.txt` untuk foto contoh
- `check-data.mjs` memeriksa `data.json` sebelum deploy
- `admin/` untuk panel admin (server login dan halaman panel)
- `render.yaml` untuk pengaturan deploy di Render

## Mengubah menu, harga, atau jam buka

1. Pakai panel admin (lihat bagian berikut), atau edit `public/data.json` langsung dari web GitHub (buka filenya, klik ikon pensil, lalu Commit).
2. Render otomatis deploy ulang dalam 1–2 menit.
3. Kalau isi `data.json` salah (misalnya tanda koma hilang atau harga ditulis `"20.000"`), deploy dibatalkan
   dan situs tetap menampilkan versi sebelumnya. Pesan kesalahannya bisa dilihat di tab **Events/Logs** di Render.

Aturan pengisian:

| Field | Contoh | Catatan |
|---|---|---|
| `id` | `"dapur-bu-win"` | Huruf kecil, angka, tanda hubung. Dipakai di alamat halaman, jadi jangan diubah setelah tayang |
| `active` | `true` | Ubah ke `false` untuk menyembunyikan tenant tanpa menghapus datanya |
| `wa` | `"6281234567890"` | Awali dengan 62, tanpa spasi atau tanda + |
| `open`, `close` | `"07:00"` | Format JJ:MM |
| `minOrder`, `prepMin` | `10` | Angka tanpa tanda kutip |
| `radiusKm`, `freeKm` | `2.5` | Pakai titik untuk desimal |
| `perKm`, `price` | `15000` | Angka bulat tanpa titik ribuan |
| `image`, `banner` | `"img/bu-win-rawon.jpg"` | Kosongkan (`""`) kalau belum ada foto |

Foto sebaiknya JPG atau WEBP dengan lebar sekitar 800 px supaya cepat dibuka di HP.

## Panel admin

Panel admin adalah server kecil di folder `admin/` dengan login username dan kata sandi biasa.
Isinya form untuk tenant dan menu, unggah foto, serta tombol **Simpan perubahan**.

- Di laptop, panel menyimpan langsung ke `public/data.json` dan `public/img/`.
- Di Render, panel menyimpan perubahan sebagai commit ke repo GitHub, lalu situs publik deploy ulang otomatis
  dalam 1–2 menit. Data tidak disimpan di server karena disk Render gratis terhapus setiap restart.
- Isian dicek dengan aturan yang sama seperti `check-data.mjs`, jadi data yang salah ditolak sebelum tersimpan.

Pemilik stan tidak punya akun panel. Mereka mengirim perubahan menu, harga, atau foto lewat WhatsApp ke tim.

### Mencoba panel di laptop

```bash
ADMIN_USERS='admin:admin' node admin/server.mjs
```

Buka http://localhost:3000 lalu masuk dengan `admin` / `admin`. Tidak perlu `npm install`; cukup Node versi 20 ke atas.

### Memasang panel di Render

1. Push proyek ke GitHub, lalu di Render pilih **New > Blueprint** dan pilih repo ini.
   Render membuat dua layanan dari `render.yaml`: `katering-pens` (situs publik) dan `katering-pens-admin` (panel).
2. Buat token GitHub (sekali saja, oleh orang yang men-deploy): Settings > Developer settings > Personal access tokens >
   Fine-grained tokens. Pilih hanya repo ini, beri izin **Contents: Read and write**, dan atur masa berlakunya sampai akhir semester.
3. Saat Render menanyakan isian, atau nanti di menu **Environment** layanan `katering-pens-admin`, isi:

| Nama | Contoh | Keterangan |
|---|---|---|
| `ADMIN_USERS` | `budi:KataSandiPanjang1,sari:KataSandiLain2` | Akun panel, dipisah koma. Kata sandi tidak boleh mengandung `,` |
| `GITHUB_TOKEN` | `github_pat_...` | Token dari langkah 2. Jangan dibagikan |
| `GITHUB_REPO` | `budi/katering-pens` | Nama repo GitHub |
| `SITE_URL` | `https://katering-pens.onrender.com` | Alamat situs publik, untuk tautan "Lihat situs" (opsional) |

`SESSION_SECRET` dibuat otomatis oleh Render. Untuk menambah atau mengganti akun, ubah `ADMIN_USERS` lalu simpan;
Render menyalakan ulang panel dengan akun yang baru.

Panel memakai paket gratis, jadi server tidur setelah sekitar 15 menit tanpa akses. Saat dibuka lagi, tunggu sekitar 1 menit.
Situs publik tidak terpengaruh dan tetap cepat.

## Mencoba di laptop

```bash
node check-data.mjs
python3 -m http.server 8000
```

Jalankan dari folder proyek ini, lalu buka http://localhost:8000 untuk situs. Panel admin dijalankan terpisah (lihat bagian Panel admin). Halaman tidak bisa dibuka dengan klik dua kali pada `index.html`,
karena browser memblokir pembacaan `data.json` dari file lokal.

## Deploy ke Render

1. Push folder ini ke repo GitHub.
2. Di Render pilih **New > Blueprint**, lalu pilih repo itu. Render membaca `render.yaml` dan membuat Static Site gratis.
3. Setiap push ke branch utama akan otomatis deploy ulang.

## Statistik kunjungan (nanti)

Kode sudah siap untuk GoatCounter. Setelah daftar di goatcounter.com, tambahkan baris ini di `<head>` pada `public/index.html`
(ganti `KODE` dengan kode situsmu):

```html
<script data-goatcounter="https://KODE.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
```

Kunjungan tiap halaman tenant tercatat sebagai `t/<id>`, dan klik tombol WhatsApp sebagai event `wa/<id>`.
