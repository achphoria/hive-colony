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
- Jam mengikuti waktu Jakarta (WIB) secara realtime.
- Musik latar mati secara default. Nyalakan lewat ikon speaker di header (pilihan diingat browser).
- Di HP, layar hanya menampilkan header. Menu (lantai, kontrol, daftar agent) dan papan misi ada di laci samping, dibuka lewat tab di tepi kiri dan kanan layar.

## Staff manusia dan Hive Hall (mode demo)

- **Avatar staff** (`#/avatar`): atur nama, divisi, rambut, warna, kulit, pakaian, aksesoris, tato, ekspresi, dan joget favorit. Ada 6 pilihan joget: Pargoy Lebah, Goyang Itik, Floss, Baling-baling, Robot Patah-patah, dan Koboi Galau. Avatar disimpan di browser.
- **Outdoor**: avatar Anda dan staff contoh (Dina, Rudi, Maya, Tono) berjalan-jalan di taman pulau dan sesekali berjoget. Tombol **Joget** di panel kontrol membuat avatar Anda berjoget, dan kamera ikut terbang ke avatar Anda.
- **Hive Hall** (`#/hall`): ruang rapat **3D** full-wide bertema terang. Queen Bea dan para ketua AI berbentuk Hive Worker 3D duduk di meja heksagon bersama avatar staff.
  - Lima layar di dinding membaca data koloni secara live: staff online, aktivitas terbaru, kalender minggu ini, tugas yang belum selesai, dan skor skill agent, plus ticker statistik. Klik salah satu layar untuk memperbesar.
  - Tab **Papan rencana** (kanban), **Kalender**, dan **Persetujuan** (setujui, minta revisi, atau tolak).
  - **Rapat suara demo**: tekan "Panggil Queen Bea", dan Queen Bea menjawab berdasarkan data koloni memakai text-to-speech bawaan browser.

Login sungguhan, undangan dari admin, call suara antar-staff, dan sinkronisasi live antar-perangkat butuh backend (misalnya Supabase dan WebRTC). Itu tahap berikutnya.

## Siklus siang-malam

- Siang dan malam mengikuti jam WIB yang sebenarnya: kalau di Jakarta sedang malam, koloninya juga malam.
- Saat malam, langit berubah biru dengan bintang, bulan, dan kunang-kunang, sementara lampu ruangan dan layar menyala.
- Agent Hybrid tidur di Charging Pods, Nectar Lounge, atau Rooftop Garden. Agent Full AI dan Full Tech (Bumble, Buzz, Bolt, Loop, Hello) tetap jaga malam, dan misi malam dikirim oleh Mission Control.
- Pada siang hari, tamu datang lewat tangga depan dan pintu kaca lobby membuka otomatis. Bumble lalu mendapat misi untuk menyambut tamu tersebut.

## Suara

Semua suara disintesis langsung di browser dengan Web Audio API, tanpa file audio:

- musik ambient pentatonik yang lebih lembut di malam hari
- dengung lebah saat agent terbang di dekat kamera
- efek misi dikirim, misi selesai, bel tamu, dan pintu lobby

Musik mati secara default. Nyalakan lewat ikon speaker kecil di header; pilihan itu diingat oleh browser.

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
| `src/ui/HUD.jsx` | Panel UI menara |
| `src/ui/HallView.jsx` | Hive Hall: rapat, papan rencana, kalender, persetujuan |
| `src/ui/AvatarCreator.jsx` | Pembuat avatar staff dan joget |
| `src/sim/outdoor.js` | Staff yang berjalan-jalan dan berjoget di taman |

Deploy otomatis ke GitHub Pages lewat `.github/workflows/deploy.yml` setiap ada push ke `main`.

Keputusan desain lengkap ada di [DESIGN.md](DESIGN.md).
