# Tabungan Wedding Eli & Alif

Aplikasi web untuk mencatat pendapatan harian, memantau kekurangan target wedding, dan menjaga saldo tiap dompet. Dibuat dari dua file Excel di folder `excel wedding`:

- `Tracker_Tabungan_Wedding_Interaktif NEW.xlsx`
- `Tracker_Ngojek_Harian_Interaktif-2 (1).xlsm`

Aplikasi statis, tanpa server, tanpa build step, tanpa login. Semua angka dihitung di browser.

## Cara membuka

Paling cepat: klik dua kali `index.html`. Aplikasi langsung jalan di Chrome atau Edge, dan data tersimpan di browser itu.

Kalau ingin lewat server lokal (lebih rapi untuk impor dan ekspor):

```bash
cd D:\Alif\Project\wedding-tracker
python -m http.server 4187 --bind 127.0.0.1
```

Lalu buka `http://localhost:4187`.

## Cara membuka dari ponsel (satu jaringan Wi-Fi)

```bash
python -m http.server 4187 --bind 0.0.0.0
```

Cari alamat IP laptop dengan `ipconfig`, lalu buka `http://192.168.x.x:4187` di browser ponsel. Catatan penting: data yang tersimpan di ponsel dan di laptop adalah dua salinan terpisah. Gunakan Ekspor dan Impor di halaman Setelan untuk memindahkannya.

## Isi halaman

- **Ringkasan**: saldo total, posisi tiap dompet, target terdekat beserta kekurangan, hari tersisa, kebutuhan per hari, saran harian, proyeksi, grafik pendapatan dan pengeluaran per bulan, catatan terakhir.
- **Harian**: catat pendapatan harian. Isi tanggal, nominal, dompet, sumber dan catatan bila perlu. Riwayat dikelompokkan per hari dan bisa difilter per bulan.
- **Pengeluaran**: catat biaya dengan kategori, jenis Wedding atau Non-Wedding, sumber dompet, dan pilihan "Potong saldo".
- **Target**: beberapa skenario target dengan deadline dan pembulatan saran masing-masing.
- **Dompet**: saldo awal, pendapatan masuk, pengeluaran, dan saldo kini tiap dompet.
- **Setelan**: tema terang atau gelap, ekspor dan impor JSON, kosongkan catatan, muat ulang data Excel, penjelasan rumus.

## Data yang sudah terisi

Diambil langsung dari kedua Excel:

- **Saldo awal Rp 18.800.000**: Jago Rp 12.000.000, Wondr Rp 5.700.000, Cash Rp 1.100.000.
- **48 catatan pendapatan, total Rp 6.597.000**, dari 2 September 2026 sampai 8 November 2026, semuanya masuk ke dompet **GoPay** karena itu pendapatan ojek. Baris bernilai nol tidak dimasukkan.
- **Pengeluaran kosong**: baris Gym 8 September di Excel ada tanggal dan kategorinya, tetapi nominalnya belum diisi, jadi tidak ikut dimasukkan.
- **4 target**: Target Januari Rp 40 juta (31 Jan 2027), Target Maret 50, 60, dan 70 juta (31 Mar 2027).
- **7 dompet**: Jago, Wondr, Cash, GoPay, Grab Credit Wallet, Grab Cash Wallet, Flazz.
- **Saldo awal aplikasi sama dengan Excel**: Rp 25.397.000.

### Soal sub dompet

Semua pendapatan dari Excel adalah hasil ojek yang masuk ke **GoPay**, jadi 48 catatan lama langsung tercatat di dompet GoPay. Saldo GoPay di aplikasi menjadi Rp 6.597.000.

Kalau saldo GoPay di aplikasi berbeda dengan saldo nyata di HP, kemungkinan ada biaya ojek yang belum dicatat. Catat biaya itu di tab Pengeluaran dengan sumber dana GoPay, atau sesuaikan saldo awal GoPay di tab Dompet.

Baris **Belum dirinci** hanya muncul kalau ada catatan yang dompetnya sengaja belum dipilih. Total saldo selalu sama dengan jumlah saldo semua dompet.

## Rumus yang dipakai

- **Saldo** = saldo awal semua dompet + seluruh pendapatan - pengeluaran yang memotong saldo.
- **Saldo dompet** = saldo awal dompet + pendapatan ke dompet itu - pengeluaran dari dompet itu.
- **Rata-rata per hari** = total pendapatan dibagi jumlah hari yang punya catatan. Hari tanpa catatan tidak dihitung, sama seperti COUNT di Excel.
- **Kekurangan** = maksimum dari target dikurangi saldo, atau nol.
- **Hari tersisa** = deadline dikurangi hari ini ditambah satu, dikurangi satu lagi bila hari ini sudah ada pendapatan.
- **Perlu per hari** = kekurangan dibagi hari tersisa.
- **Saran harian** = perlu per hari dibulatkan ke atas sesuai pembulatan target.
- **Proyeksi** = saldo sekarang + rata-rata per hari x hari tersisa.

Pengeluaran dengan "Potong saldo" mati tetap muncul di riwayat dan grafik, tetapi tidak mengurangi saldo.

## Pindah dana antar dompet

Kalau uang benar-benar dipindahkan, misalnya Rp 6.000.000 dari GoPay ke Wondr untuk proteksi, jangan ubah saldo awal. Buka tab Dompet, klik **Pindah dana**, isi tanggal, nominal, dompet asal, dompet tujuan, lalu simpan.

- Total saldo tidak berubah.
- Saldo GoPay berkurang Rp 6.000.000, saldo Wondr bertambah Rp 6.000.000.
- Angka target, kekurangan, dan rata-rata tidak berubah karena total uang tetap sama.
- Perpindahan tercatat dengan tanggal dan bisa diubah atau dihapus.

Beda dengan **koreksi catatan**: kalau catatan pendapatan lama salah dompet, buka catatannya di tab Harian, klik Ubah, lalu pilih dompet yang benar. Itu bukan perpindahan uang, hanya membetulkan label dompet pada catatan lama.

## Cadangan data

Data disimpan di `localStorage` browser, bukan di file dan bukan di server. Artinya:

- Data bisa hilang kalau riwayat browser dibersihkan atau memakai mode privat.
- Pindah perangkat harus lewat **Ekspor data JSON** lalu **Impor dari file**.
- Ekspor dilakukan dari halaman Setelan, file tersimpan di folder unduhan.

## Deploy di Cloudflare Pages

Alamat rencana: https://wedding-tracker.pages.dev

Repo: https://github.com/alifvir/wedding-tracker, branch `main`. Aplikasi statis, tanpa build step.

Setelan project Cloudflare Pages:

- Framework preset: None
- Build command: kosongkan
- Build output directory: `/`

Membuat project (sekali saja):

1. Buka dash.cloudflare.com, menu Workers & Pages.
2. Klik Create, pilih Pages, lalu Connect to Git.
3. Pilih repo `alifvir/wedding-tracker`, branch `main`.
4. Nama project: `wedding-tracker`.
5. Framework None, build command kosong, output directory `/`.
6. Klik Save and Deploy.

Setelah terhubung, setiap `git push` ke `main` otomatis memicu build dan deploy baru, biasanya selesai dalam 1 sampai 2 menit.

Kalau Cloudflare menolak output directory `/`, pakai cara alternatif: build command `mkdir -p dist && cp index.html dist/ && cp -r assets dist/` dengan output directory `dist`.

Data yang Anda input tetap tersimpan di browser masing-masing perangkat, bukan di Cloudflare. Data di situs live terpisah dari data saat membuka `index.html` langsung karena alamatnya berbeda. Pindahkan lewat Ekspor dan Impor di halaman Setelan.

## Struktur file

```
wedding-tracker/
  index.html          kerangka halaman, navigasi, dialog
  assets/styles.css   palet, tata letak, mode gelap
  assets/app.js       perhitungan, tampilan, penyimpanan, ekspor impor
  assets/seed.js      data awal hasil ekstraksi Excel
  README.md           dokumen ini
```

Versi 1.2. Tidak memakai framework, tidak memanggil API, tidak mengirim data ke mana pun.
