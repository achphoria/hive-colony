# Hive Colony

Kantor virtual 3D untuk 21 agent AI, bergaya diorama low-poly bertema sarang lebah.

Situs: https://achphoria.github.io/hive-colony/

Saat ini misi masih **simulasi**: tidak ada panggilan ke API AI. Agent bergerak, istirahat, rapat, dan menyelesaikan misi contoh secara otomatis.

## Yang bisa dilakukan

- Putar dan zoom menara sarang (seret dan scroll).
- Pilih lantai: Lantai 3 (puncak), Lantai 2 (ruang divisi), Lantai 1 (ruang bersama).
- Klik ruangan atau agent untuk melihat detailnya.
- Pantau misi di Papan misi dan aktivitas di Log koloni.
- Atur kecepatan simulasi: jeda, 1×, 2×, 4×.
- Jam mengikuti waktu Jakarta (WIB) secara realtime. Tombol Coba pagi/malam beralih ke jam simulasi cepat, dan Kembali ke WIB mengembalikannya.
- Nyalakan suara untuk musik ambient dan dengung lebah.

## Siklus siang-malam

- Secara default, siang dan malam mengikuti jam WIB yang sebenarnya: kalau di Jakarta sedang malam, koloninya juga malam. Di mode simulasi, satu hari berlangsung sekitar 4 menit (pada kecepatan 1×).
- Saat malam, langit berubah biru dengan bintang, bulan, dan kunang-kunang, sementara lampu ruangan dan layar menyala.
- Agent Hybrid tidur di Charging Pods, Nectar Lounge, atau Rooftop Garden. Agent Full AI dan Full Tech (Bumble, Buzz, Bolt, Loop, Hello) tetap jaga malam, dan misi malam dikirim oleh Mission Control.
- Pada siang hari, tamu datang lewat tangga depan dan pintu kaca lobby membuka otomatis. Bumble lalu mendapat misi untuk menyambut tamu tersebut.

## Suara

Semua suara disintesis langsung di browser dengan Web Audio API, tanpa file audio:

- musik ambient pentatonik yang lebih lembut di malam hari
- dengung lebah saat agent terbang di dekat kamera
- efek misi dikirim, misi selesai, bel tamu, dan pintu lobby

Suara mati secara default. Nyalakan lewat tombol Suara di kiri bawah.

## Alur misi

1. Queen Bea (CEO) mengirim misi sebagai tetes madu ke sel divisi.
2. Agent utama kembali ke mejanya. Kalau misinya butuh kolaborator, kolaborator terbang lewat lift madu ke ruangan itu.
3. Progres ditampilkan sebagai sel madu yang terisi di atas ruangan.
4. Begitu selesai, ruangan menyala emas, ada percikan madu, dan koloni mendapat poin madu.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Lalu buka http://localhost:5173/hive-colony/

## Struktur kode

| Folder | Isi |
|---|---|
| `src/data/hive.js` | Agent, divisi, ruangan, posisi meja, dan template misi |
| `src/sim/engine.js` | Mesin simulasi (gerak, istirahat, rapat, misi) |
| `src/sim/store.js` | State UI (zustand) |
| `src/scene/` | Scene 3D: ruangan, furnitur, karakter Hive Worker, lift, efek, siang-malam |
| `src/audio/sound.js` | Musik dan efek suara (Web Audio) |
| `src/ui/HUD.jsx` | Panel UI |

Deploy otomatis ke GitHub Pages lewat `.github/workflows/deploy.yml` setiap ada push ke `main`.

Keputusan desain lengkap ada di [DESIGN.md](DESIGN.md).
