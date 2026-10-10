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

## Hive Hall: lobi dan 4 fitur

Hive Hall sekarang berupa **lobi**: ruang 3D, banner status meeting, dan 4 tombol.

- **Mulai / Gabung meeting**: satu ruang meeting untuk seluruh koloni. Status meeting (judul, jumlah peserta, durasi) terlihat oleh semua orang yang membuka Hive Hall; untuk akun yang login, status ini realtime lewat Supabase Presence. Ruang meeting standar berisi kotak peserta (manusia + AI yang diundang), transkrip live, catatan keputusan & tugas oleh AI, dan tombol Tanya Queen Bea.
- **Presentasi report**: 5 slide yang disusun dari data koloni, dinarasikan Queen Bea dengan suara browser; bisa dijeda, dilompati, dan dicetak/PDF.
- **Ngobrol dengan Chief**: mode chat (lampiran file apa pun, seret-lepas) dan mode suara (tahan untuk bicara, memakai pengenal suara bawaan browser).
- **Portal karyawan**: segera hadir.

### Meeting suara (LiveKit)

Untuk staff yang login, meeting memakai suara sungguhan lewat **LiveKit Cloud**:

- Edge Function Supabase `livekit-token` (`supabase/functions/livekit-token`) memeriksa bahwa peminta adalah staff Hive Colony (punya baris `hc_profiles`, bukan viewer), lalu membuat tiket masuk ruang `hive-hall` yang berlaku 2 jam. `LIVEKIT_URL`, `LIVEKIT_API_KEY`, dan `LIVEKIT_API_SECRET` disimpan di Supabase Edge Function Secrets, tidak pernah ada di website.
- Mic sungguhan, suara peserta lain terdengar, indikator "sedang bicara" berasal dari suara asli, dan tombol mic benar-benar mematikan mic. Tangan terangkat terlihat oleh semua peserta.
- Transkrip: browser tiap peserta mentranskrip suaranya sendiri (Web Speech API, `id-ID`), lalu barisnya dibagikan ke semua lewat kanal data LiveKit. Paling akurat di Chrome/Edge; disarankan memakai headset.
- Library `livekit-client` hanya dimuat saat staff masuk meeting. Meninggalkan Hive Hall otomatis keluar dari meeting.

Tanpa login, meeting tetap berupa demo dengan transkrip simulasi.

### Queen Bea tersambung ke Claude

Untuk staff yang login, Queen Bea dijawab **Claude Haiku 5.5** lewat Edge Function `queen-bea` (`supabase/functions/queen-bea`):

- Fungsi memeriksa bahwa peminta adalah staff Hive Colony, lalu menyertakan data koloni asli dari database (staff, persetujuan menunggu, tugas terbuka, aktivitas terbaru). Queen Bea diminta tidak mengarang data yang tidak ada.
- Dipakai di **Ngobrol dengan Chief** (chat & suara) dan di **meeting** (pertanyaan bebas; Queen Bea membaca transkrip rapat, jawabannya dibagikan ke semua peserta).
- Kunci API disimpan sebagai `ANTHROPIC_API_KEY` di Supabase Edge Function Secrets, tidak pernah ada di website.
- Belum bisa: membaca isi file lampiran, mengirim misi ke agent lain, atau mengubah data.

### Rapat, notulen, dan Arsip rapat

- **Hanya owner** yang bisa membuka ruang rapat (dijaga RLS database); staff lain bergabung saat rapat sudah dibuka. Hanya satu rapat berjalan pada satu waktu.
- **Queen Bea wajib hadir** di setiap rapat: membuka dengan salam, bisa ditanya kapan saja, dan **wajib membuat notulen** saat rapat selesai.
- Transkrip tiap peserta disimpan ke `hc_meeting_lines` (peserta yang datang terlambat melihat transkrip sebelumnya).
- Rapat selesai ketika owner menekan **Akhiri rapat**, peserta terakhir keluar, atau rapat ditinggal kosong (ditutup otomatis). Edge Function `meeting-recap` lalu meminta Claude membuat notulen (ringkasan, topik, keputusan, tindak lanjut dengan PIC & tenggat) dan laporan, dikerjakan di latar belakang server.
- Tab **Arsip rapat** di Hive Hall: daftar semua rapat dengan pencarian, notulen, laporan, transkrip lengkap, salin teks, dan cetak/PDF. Owner bisa membuat ulang notulen yang gagal.

## Mode real vs mode demo

- **Login (mode real)**: tidak ada misi, tamu, atau log simulasi. Agent yang menganggur tetap bebas berkeliaran, istirahat, dan tidur malam, tapi tidak dicatat sebagai aktivitas. Header, papan misi, log koloni, dan layar Hive Hall hanya menampilkan data asli; kalau sepi, ya kosong. Di Hive Hall hanya Queen Bea dan staff yang sedang membuka Hive Hall yang duduk di meja.
- **Tanpa login (mode demo)**: simulasi lengkap 21 agent untuk pengunjung.

## Akun staff (Supabase)

Tanpa login, Hive Colony berjalan dalam mode demo. Dengan login, data tersimpan di Supabase:

- **Masuk** (`#/login`) dengan email + password. **Daftar** (`#/join?code=…`) hanya bisa memakai kode undangan.
- **Undang staff** (`#/undang`, khusus owner dan kepala divisi): buat link undangan yang terkunci ke divisi utama, divisi tambahan, peran, dan (opsional) email. Staff tidak bisa memilih divisi atau perannya sendiri.
- **Avatar** tersimpan di akun. Staff yang sedang online muncul di taman semua orang, dan joget mereka terlihat realtime (Supabase Realtime Presence).
- **Hive Hall**: persetujuan, papan rencana, dan log aktivitas manusia tersimpan di database dan berubah live di semua perangkat. Hanya owner dan kepala divisi yang bisa memutuskan persetujuan; viewer hanya bisa melihat.

Tabel memakai awalan `hc_` (`hc_profiles`, `hc_invites`, `hc_approvals`, `hc_plan_tasks`, `hc_activity`) dengan Row Level Security. Website hanya memakai anon key publik; service_role key tidak pernah dipakai di sini.

Meeting suara antar-staff memakai LiveKit; lihat bagian "Meeting suara (LiveKit)" di atas.

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
| `src/sim/auth.js`, `src/ui/AuthPages.jsx` | Login, daftar dengan undangan, undang staff |
| `src/sim/presence.js`, `src/sim/hallSync.js` | Realtime presence dan sinkronisasi Hive Hall |
| `src/hall/` | Lobi Hive Hall: meeting, presentasi report, ngobrol dengan Chief, portal |

Deploy otomatis ke GitHub Pages lewat `.github/workflows/deploy.yml` setiap ada push ke `main`.

Keputusan desain lengkap ada di [DESIGN.md](DESIGN.md).
