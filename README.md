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

Untuk staff yang login, Queen Bea dijawab **Claude Sonnet 5.5** (cadangan otomatis: Haiku 5.5) lewat Edge Function `queen-bea` (`supabase/functions/queen-bea`):

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

### Queen Bea standby di rapat + riset web

- Queen Bea **selalu mendengarkan** rapat. Panggil dengan menyebut namanya ("Queen Bea, menurut kamu promo ini gimana?"); pengenal suara juga menerima ejaan "kuin/quin/kwin". Hanya memanggil nama lalu jeda? Kalimat berikutnya dianggap pertanyaan.
- Jawaban memakai transkrip rapat sebagai konteks dan bisa **riset web** (alat `web_search` Claude, maks. 3 pencarian per pertanyaan, lokasi Indonesia). Sumber riset tampil di bawah jawaban dan ikut tersimpan di arsip.
- Jawaban dibacakan di perangkat **semua peserta**; selama Queen Bea bicara, mic peserta dijeda sebentar supaya suaranya tidak tertangkap ulang.

### Obrolan koloni (public mic)

- Staff yang login bisa menekan **Ngobrol di koloni** di halaman koloni untuk masuk ruang suara bebas (`hive-plaza` di LiveKit). Gelombang suara muncul di atas avatar yang sedang bicara.
- Kalau ada yang sedang ngobrol, bar menampilkan "Dina sedang ngobrol · Gabung".
- Hemat kuota: keluar otomatis kalau sendirian 5 menit atau saat meninggalkan halaman koloni.

### Karakter Queen Bea

Model khusus ratu (`src/scene/QueenBea.jsx`): lebih tinggi, wajah humanoid dengan mata besar dan bulu mata lentik, rambut emas bersanggul, mahkota emas bermutiara dan permata madu, gaun bergaris lebah, jubah beludru berbulu putih, kalung, tongkat kerajaan, dan empat sayap. Saat pengembangan, `#/queen` membuka pratinjau dari dekat (tidak ikut build publik).

### Mode TV (spectator untuk layar besar)

Buka **`#/tv`** (https://achphoria.github.io/hive-colony/#/tv) atau tombol **📺 Mode TV** di koloni. Panel disembunyikan dan kamera dikendalikan "sutradara" otomatis:

- Kamera hanya berkeliling koloni (gaya yang sama dengan Kyumen), tidak mengikuti karakter: bergantian orbit menara, tur per lantai, dan menyusuri depan menara (tangga lobby, taman, kolam madu). Tenang dan ringan untuk diputar seharian.
- Overlay: jam & tanggal WIB, badge LIVE, jumlah staff online & agent AI, caption ala siaran TV, dan ticker aktivitas.
- Gerakkan mouse untuk kontrol (shot berikutnya, layar penuh, keluar). Keyboard: `N`/→ shot berikutnya, `F` layar penuh.

### Mode Intro: video perkenalan (`#/intro`)

Video ±80 detik yang diputar langsung dari scene 3D koloni (bukan rekaman): pembuka heksagon, terbang ke menara saat matahari terbit, tur lantai & 7 divisi, Queen Bea mendelegasikan tugas ke Graph & Spark (tugas contoh hanya tampil di layar ini), Ruang Kerja (lampiran, suara, 👍/👎), Hive Hall & notulen, Portal saya (kanban), time-lapse malam ("Bekerja 24 jam"), statistik & keamanan, lalu penutup. Buka dari rak alat (🎬 Intro), tekan **F** untuk layar penuh, mulai rekam layar (Win+Alt+R atau OBS), lalu **Putar** (atau Spasi). Kursor & tombol tersembunyi selama diputar. `#/intro?t=30` memutar mulai detik ke-30 untuk merekam ulang satu bagian. Kodenya: `src/scene/IntroDirector.jsx` (kamera, jam, lantai, tugas contoh) dan `src/ui/IntroOverlay.jsx` + `intro.css` (teks & kartu).

### Tampilan "golden honey"

Tampilan koloni dan Hive Hall mengikuti konsep visual atasan (diorama pulau melayang & aula madu):

- **Look bersama** (`src/scene/Look.jsx`): lingkungan cahaya hangat buatan lokal untuk kilau emas, bloom pada benda menyala, ambient occlusion (laptop/TV saja), tone mapping Neutral, vignette. Kualitas otomatis lebih ringan di HP.
- **Tekstur prosedural** (`src/scene/textures.js`): lantai kayu, marmer, garis sarang menyala, kaca madu, rumput; digambar dengan canvas, tanpa file gambar.
- **Koloni**: kubah langit gradasi + lautan awan, pulau rumput berbunga dengan semak, pinus, batu, lampu taman berpendar, sarang lebah kayu; lift kaca sarang madu; lantai kayu/marmer per ruangan, karpet, tanaman pot emas, lampu dinding. Siang-malam tetap mengikuti WIB.
- **Hive Hall**: dinding sel kaca madu berpendar, madu menetes, panel kaca amber di balik layar, papan nama emas bercahaya, lantai marmer bergaris heksagon menyala, podium madu, lentera, pot emas berbunga; layar dinding & kartu aksi bergaya kaca dengan ikon.

### Koloni hidup (kerja agent sungguhan)

Saat login, tugas AI di papan Hive Hall (`hc_plan_tasks`, dikerjakan agent lewat n8n) menjadi misi 3D: Queen menurunkan tugas, lebah agent bekerja di mejanya, dan ada efek selesai saat tugas masuk kolom Selesai. Status agent nyata: **Online** (tersambung n8n), **Kerja** (sedang mengerjakan tugas), **Offline** (belum tersambung, atau server agent di PC kantor mati). Kesehatan n8n dicek lewat Edge Function `agent-chat` dan disimpan sementara 2 menit di `hc_system_status`, supaya kuota ngrok tidak habis.

### Ruang Kerja Agent (`#/agent/<id>`)

Tempat staff chat langsung dengan agent, seperti ngobrol dengan asisten AI:

- Kiri: daftar agent per divisi (🔒 kalau belum punya akses) dan riwayat percakapan.
- Tengah: chat. Pesan ke Queen Bea diteruskan ke Edge Function `queen-bea` (bisa riset web dan mendelegasikan). Pesan ke Nimbus, Loop, Ping, Pixel, dan Spark diteruskan ke Grok Bot kalau secret botnya ada; kalau belum, pesan itu tetap ke worker n8n. Pesan ke agent lain dikirim ke worker n8n (Claude). Kalau tugas butuh persetujuan owner, chat memberi tahu; setelah owner menyetujui (atau menolak), jawaban agent otomatis muncul di percakapan yang sama.
- **Lampiran** 📎 (atau seret/tempel file): gambar, PDF, TXT, CSV, MD, JSON; maks. 3 file × 10 MB. File disimpan privat di bucket `hc-agent-files` (folder milik staff sendiri). Isi file teks dibaca langsung; gambar & PDF dibaca Claude dulu, lalu isinya dikirim ke agent.
- **Suara**: 🎤 dikte pesan (Chrome/Edge, bahasa Indonesia), 🔊 Dengar untuk membacakan satu jawaban, dan tombol Suara di kepala chat untuk membacakan setiap jawaban otomatis.
- **🗣 Mode percakapan** (tanpa tangan): klik sekali, bicara; setelah diam ±1,5 detik pesan terkirim sendiri, jawaban agent dibacakan, lalu mikrofon menyala lagi sampai Selesai. Saat agent bicara, tekan ✋ Potong atau spasi untuk menyela. Berhenti sendiri kalau 90 detik tidak ada suara. Berlaku untuk semua agent (termasuk Grok Bot) dan semua teks tetap tersimpan di riwayat. Memakai suara bawaan browser (gratis, paling stabil di Chrome/Edge).
- **Aksi di jawaban agent**: 📋 Salin, 🔊 Dengar, 📌 Simpan (ke Hasil tersimpan), ✅ Jadikan tugas (dikerjakan agent otomatis lewat n8n, atau tugas untuk diri sendiri di papan rencana).
- Kanan: tingkat akses kamu, tugas agent beserta hasil lengkapnya (`hc_plan_tasks.result`, bisa disalin/diunduh .md), Hasil tersimpan (`hc_agent_results`), peran agent, dan persona lengkap (khusus owner & Pelatih).
- Queen Bea tahu status server agent (online/offline dari pengecekan terakhir) dan bisa membaca lampiran.
- **Queen sebagai ketua**: untuk permintaan pekerjaan, Queen memecahnya sendiri jadi tugas (hingga 5 agent) dan mencatatnya sebagai paket kerja. Begitu semua selesai, Queen otomatis mengirim rekap + lampiran (laporan lengkap & hasil tiap agent, .md) ke percakapan itu. Untuk permintaan visual (gambar/poster/Instagram), laporan juga berisi 2 desain poster 1080×1080 yang dibuat Claude (Sonnet) sebagai lampiran SVG. Itu bukan balasan chat Pixel: chat Pixel sendiri mengikuti Grok Bot. Lampiran dibuka di penampil bawaan (dokumen rapi + Cetak/PDF, gambar + Unduh PNG). Queen juga bisa membaca hasil tugas 2 hari terakhir kapan saja ditanya.
- **Cari** di semua percakapan (judul & isi) dari kolom pencarian di kiri; hasil langsung membuka percakapannya.
- **📌 Sematkan** dan **✏️ ganti judul** percakapan milik sendiri; percakapan tersemat selalu di atas.
- **⬇ Unduh** percakapan yang sedang dibuka sebagai file .md.
- **Sisa kuota** pesan hari ini tampil di bawah chat kalau owner mengaktifkan batas harian.
- Pintu masuk: tombol 💬 di Daftar agent, "Buka ruang kerja" di kartu agent, dan tombol "Ruang kerja" di kontrol koloni.

Semua pesan lewat Edge Function `agent-chat`, yang memeriksa login dan akses, menyimpan riwayat (`hc_agent_threads`, `hc_agent_messages`), lalu memanggil n8n dengan secret dari Vault. Browser tidak pernah memegang secret n8n.

### Latih agent (tab Skill di Ruang Kerja)

- **👍/👎 di setiap jawaban agent.** 👎 bisa diberi koreksi ("apa yang seharusnya"). Semua staff yang punya akses bisa menilai (`hc_agent_feedback`).
- **Skor skill nyata** per agent dari penilaian 30 hari terakhir: (👍+1)/(total+2), jadi agent baru mulai dari 50. Tampil di kepala chat, tab Skill, dan kartu agent di koloni 3D.
- **Kartu skill & pelajaran** (`hc_agent_skills`), diatur owner atau Pelatih agent itu. Koreksi staff muncul di "Masukan staff"; klik 🎓 Jadikan pelajaran untuk mengajarkannya ke agent.
- **Persona dasar** bisa diubah owner/Pelatih. Prompt yang dibaca n8n dan Grok Bot (`hc_agent_prompts.system_prompt`) dirakit otomatis dari persona + skill aktif + pelajaran aktif (fungsi `hc_agent_compile`). Berlaku untuk semua agent di `GROK_AGENTS`, termasuk yang ditambahkan nanti, di chat, delegasi Queen, dan tugas. Jadi ubah persona lewat Ruang Kerja atau kolom `persona`, jangan langsung di `system_prompt`: perubahan langsung akan tertimpa saat skill berubah.
- **👍/👎 dan skor skill tidak mengubah jawaban** sampai koreksinya dijadikan pelajaran (tombol 🎓). Skor 30 hari hanya tampilan.

### Tugas rutin (tab Rutin di Ruang Kerja)

Owner atau Pelatih bisa membuat jadwal per agent: setiap hari, Senin–Jumat, mingguan, atau bulanan, pada jam WIB tertentu (`hc_agent_routines`, jadwal berikutnya dihitung `hc_routine_next`). Workflow n8n **Hive - Routine Tick** (`n8n/workflows/hive-routine-tick.json`) memanggil `agent-chat` tiap 5 menit. Tugas yang jatuh tempo masuk papan rencana dan dikerjakan agent. Hasilnya muncul di panel Tugas. Ada juga tombol ▶ Jalankan sekarang. Kalau PC kantor mati saat jadwal tiba, tugas itu dijalankan sekali begitu n8n hidup lagi.

### Grok Bot (Nimbus, Loop, Ping, Pixel, Spark, dan Queen Bea opsional)

Agent `cloud` (Nimbus), `workflow` (Loop), `network` (Ping), `visual` (Pixel), dan `ads` (Spark) dijawab **Grok Bot** kalau pasangan secret agent itu terpasang. Kalau secret sebuah agent belum ada, chat dan tugas agent itu jatuh ke worker n8n/Claude seperti agent lain, bukan gagal. Permintaan gambar, poster, atau desain di chat Pixel ikut jalur yang sama (bukan panggilan Anthropic terpisah). Queen Bea memakai Claude secara default; di kepala chat Queen ada pilihan **Claude / Grok Bot** (tersimpan di browser). Untuk jalur Grok Bot, Edge Function `agent-chat` meneruskan pesan (+ isi lampiran) ke bot dan langsung menjawab `status: 'pending'`; bot sendiri yang menulis balasan ke `hc_agent_messages` (`role: 'agent'`, `meta.engine: 'grokbot'`). Ruang Kerja menampilkan "… sedang berpikir…", menunggu lewat Realtime + polling 5 detik, dan menyerah setelah 3 menit ("Belum ada balasan, coba lagi").

**Tugas untuk agent Grok Bot** (Jadikan tugas, tugas rutin, delegasi Queen, atau blok `[[COMMIT]]` di jawaban chat) masuk papan misi saat tugas dibuat dan mengirim *thread tugas* (`hc_agent_threads.task_id`, judul "Tugas: …", ikon 🗂). Bot melaporkan progres dengan `[[PROGRESS]]` atau callback `task_update`; tugas menjadi **Selesai** hanya kalau ada hasil nyata. Janji kosong ("nanti saya kirim") tidak menutup tugas. Tanpa hasil, statusnya **Gagal** dan hasilnya tetap tertulis di kartu serta di chat. Hasil selesai juga disalin ke percakapan tempat tugas diminta. Nimbus, Loop, Ping, Pixel, dan Spark tampil Online (tidak bergantung server n8n di PC kantor) selama secret Grok-nya ada.

Selama agent masih mengerjakan tugas (kolom Jalan, paling lama 30 menit tanpa kabar), staff lain tidak bisa mengirim chat atau tugas baru. Ruang Kerja menampilkan "sedang mengerjakan …". Kunci lepas saat selesai, gagal, atau waktu habis.

**Queen Bea mode Grok** menerima field tambahan `context`: data koloni (staff, persetujuan, tugas, aktivitas, status server), daftar TIM AGENT, dan cara mendelegasikan. Untuk mendelegasikan, bot menulis jawabannya lalu menambahkan di baris terakhir `[[DELEGATE]] [{"agent":"<agent_id>","title":"…","detail":"…"}]` (maks. 5). Trigger `hc_agent_grok_delegate_notify` memanggil `agent-chat` (`grok_delegate`), yang mengirim tugasnya, menghapus blok itu dari pesan, dan menambahkan daftar tugas yang terkirim. Riset web di mode Grok bergantung pada fitur bot (mis. pencarian bawaan Grok). Dua poster SVG di laporan akhir Queen tetap dibuat Claude.

Alamat & kunci bot disimpan di Supabase Edge Function Secrets, satu pasang per agent: `GROKBOT_URL_CLOUD` / `GROKBOT_KEY_CLOUD`, `GROKBOT_URL_WORKFLOW` / `GROKBOT_KEY_WORKFLOW`, `GROKBOT_URL_NETWORK` / `GROKBOT_KEY_NETWORK`, `GROKBOT_URL_VISUAL` / `GROKBOT_KEY_VISUAL`, `GROKBOT_URL_ADS` / `GROKBOT_KEY_ADS`, `GROKBOT_URL_CEO` / `GROKBOT_KEY_CEO`. Untuk Nimbus, Loop, Ping, Pixel, dan Spark, secret yang kosong membuat permintaan jatuh ke n8n/Claude. Kalau secret ada tetapi bot tidak menjawab dalam 15 detik, chat menampilkan "<nama> (Grok Bot) tidak bisa dihubungi". Queen yang dipilih Grok Bot tanpa secret tetap menampilkan pesan itu (pilihan mesinnya eksplisit). Bot menerima `POST {thread_id, agent_id, message, user_name, message_id, history, persona}` dengan header `Authorization: Bearer <kunci>`. Untuk tugas, payload juga boleh berisi `task: {id, callback_url, token}`. `history` = 10 pesan terakhir thread sebelum pesan ini (`[{role: 'user' | 'agent', content}]`); `persona` = prompt lengkap agent dari `hc_agent_prompts.system_prompt` (persona + skill + pelajaran), atau persona Queen Bea yang sama dengan `queen-bea` (`supabase/functions/_shared/queenPersona.ts`).

### Statistik & batas pesan (`#/statistik`, khusus owner)

Per agent: jumlah pesan, tugas, gagal/offline, rata-rata waktu balas, mesin (Claude/Grok/n8n), dan perkiraan token dari panjang teks chat; per hari dan per staff; periode hari ini / 7 / 30 hari (fungsi `hc_agent_stats`). Di halaman yang sama owner mengatur **batas pesan per staff per hari** (`hc_set_limits`, 0 = tanpa batas; owner, tugas rutin, dan delegasi tidak dihitung). Kalau batas habis, Ruang Kerja menolak pesan baru dengan penjelasan sampai besok (WIB). Biaya pasti tetap dicek di Claude Console dan xAI Console.

### Akses agent (`#/akses`, khusus owner)

Owner mengatur agent mana yang boleh dihubungi tiap staff. Staff baru tidak punya akses sampai diatur. Klik chip agent untuk berganti: Tanpa akses → **Pakai** (chat & perintah) → **Pelatih** (juga melihat & nanti mengubah skill agent). Ada tombol cepat "Pakai semua" / "Kosongkan" per divisi. Dijaga RLS (`hc_agent_access`, `hc_agent_level()`) dan dicek ulang di server.

## SOP staff baru

1. Owner atau kepala divisi membuat kode undangan di **Undang staff** (`#/undang`).
2. Staff mendaftar di `#/join` dengan kode itu (konfirmasi email kalau diminta).
3. Saat pertama kali masuk, staff **wajib menonton video perkenalan** (±80 detik). Selama belum selesai, semua halaman menampilkan intro dan tidak bisa dilewati atau dilompati. Selesai menonton → tombol **Mulai pakai Hive Colony** menyimpan tanda sudah menonton (`hc_profiles.intro_seen_at`, fungsi `hc_mark_intro_seen`).
4. Staff membuat avatar, lalu membuka **Portal saya** dan **Ruang Kerja**. Agent yang boleh dipakai diatur owner di **Akses agent**.

Akun yang sudah ada sebelum aturan ini tidak dipaksa menonton; intro tetap bisa diputar kapan saja dari rak alat (🎬 Intro).

## Portal saya (`#/saya`)

Tampilan pribadi tiap staff, dibuka dari tombol **🙋 Portal saya** di koloni (kanan Ruang Kerja):

- **Kanban saya**: Belum / Jalan / Selesai. Isinya tugas papan rencana yang ditugaskan ke saya (label *Tim*, terlihat tim; penanggung jawab disimpan sebagai akun di `hc_plan_tasks.assignee`, tugas lama dicocokkan lewat nama) dan **to-do pribadi** (label *Pribadi*, tabel `hc_todos`, hanya terlihat pemiliknya). Geser kartu antar kolom atau pakai tombol ← →; tambah to-do di kolom Belum.
- **Tugas saya ke agent**: tugas yang saya buat lewat Jadikan tugas, tugas rutin, atau delegasi Queen (`hc_plan_tasks.created_by`), dengan status dan hasil lengkap.
- **Percakapan & hasil saya**: percakapan terbaru (tersemat di atas) dan hasil tersimpan; klik untuk membukanya di Ruang Kerja.
- **Rapat & notulen saya**: rapat yang saya ikuti atau buat, ringkasan notulen, dan **tindak lanjut yang PIC-nya saya** dengan tombol **+ Kanban**.

Kartu "Portal karyawan" (segera hadir) di Hive Hall dihapus. Cuti, slip gaji, dokumen, dan KPI menyusul sebagai tahap berikutnya.

## Wajib login (tanpa mode demo)

Hive Colony hanya untuk staff. Tanpa login, semua alamat (koloni, Hive Hall, Ruang Kerja, Mode TV) menampilkan form masuk. Sesi berakhir otomatis setiap pergantian hari WIB (jam 00:00), jadi paling lama 24 jam; setelah itu staff perlu masuk lagi. Staff baru tetap bisa mendaftar lewat `#/join` dengan kode undangan.

Di koloni, lebah yang menganggur kebanyakan diam di mejanya dan sesekali istirahat. Rapat simulasi tidak ada lagi; rapat sungguhan ada di Hive Hall.

## Tampilan koloni

- **Pintu utama**: tombol besar **Hive Hall** dan **Ruang Kerja** di kiri bawah (di HP jadi dock bawah).
- **Rak alat** di kanan bawah: Reset kamera, **⚡ Mode hemat** (tanpa efek cahaya/bloom & bayangan, resolusi maks. 1x; untuk laptop/TV yang berat, tersimpan per browser), 📊 Statistik (owner), Mode TV, Avatar saya, Joget.
- **Header**: angka *online* membuka daftar staff yang sedang online (divisi & sedang di halaman mana); angka *server* membuka status sambungan (server agent n8n di PC kantor, Queen Bea/Claude, jam pengecekan terakhir, tombol Cek ulang). Sisa saldo token Claude tidak tersedia lewat API; owner mendapat tautan ke Claude Console → Billing.
- **Daftar agent** tertutup secara default; buka dengan tombol +.
- Dengung lebah saat kamera mendekat dihapus.
- **Performa**: furnitur & dekorasi statis digabung per material (`src/scene/StaticMerge.jsx`), peta bayangan diperbarui 5x per detik, lampu malam satu per lantai (bukan per ruangan), tanpa AO, resolusi render menyesuaikan kemampuan perangkat (`PerformanceMonitor`), dan panel HUD hanya digambar ulang saat datanya berubah.

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
