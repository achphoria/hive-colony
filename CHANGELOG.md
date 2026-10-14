# Riwayat perubahan Hive Colony

Catatan perubahan per tahap, terbaru di atas. Tanggal dalam WIB. Kode commit bisa diklik di GitHub untuk melihat detail perubahannya.

## 14 Oktober 2026

### Tugas Grok masuk papan, kunci sibuk, hasil kembali ke chat
- Pixel, Spark, Nimbus, Loop, dan Ping memakai Grok Bot kalau secretnya ada; kalau tidak, chat dan tugas jatuh ke n8n.
- Bot tidak boleh berjanji kerja latar dari chat biasa. Komitmen sungguhan lewat blok `[[COMMIT]]` (atau tombol Jadikan tugas) membuat kartu `hc_plan_tasks` dan progresnya tampil di papan misi. Callback `task_update` atau blok `[[PROGRESS]]` / `[[DONE]]` mengisi kemajuan dan hasil.
- Tugas tanpa hasil tidak lagi menjadi Selesai: statusnya Gagal. Hasil yang ada disalin ke percakapan agent, dan kartu tugas di panel kanan bisa dibuka untuk membaca hasil lengkap (teks dan gambar).
- Saat agent sedang mengerjakan tugas, staff lain tidak bisa memberi chat atau tugas baru ("sedang mengerjakan …"). Kunci lepas saat selesai, gagal, atau setelah 30 menit tanpa kabar.
- Persona, skill aktif, dan pelajaran aktif (hasil `hc_agent_compile`) dikirim di setiap panggilan Grok. Skor 👍/👎 tidak mengubah jawaban sampai dijadikan pelajaran.

### Riwayat chat tidak terkesan hilang setelah refresh (`6c15133`)
- Ruang Kerja mengingat percakapan terakhir dengan tiap agent (di browser ini). Setelah refresh, percakapan itu langsung terbuka lagi, bukan halaman kosong.
- Daftar **Percakapan** dipindah ke atas daftar agent di kolom kiri (dengan scroll sendiri), supaya riwayat langsung terlihat tanpa menggulir melewati 21 agent.

### Queen Bea naik ke Claude Sonnet 5.5, lampiran bisa dibuka, poster otomatis (`477f690`)
- **Queen Bea** sekarang memakai **Claude Sonnet 5.5** (berpikir adaptif): pembagian kerja & jawaban lebih matang. Mode rapat tetap cepat (effort rendah). Kalau Sonnet gagal, otomatis pindah ke Haiku 5.5 agar Queen tetap menjawab. Perkiraan biaya ±Rp300–500 per pesan.
- **Penampil lampiran** di Ruang Kerja: klik lampiran .md/.txt/.csv/.json untuk membaca dengan format rapi, lalu **Cetak / PDF** atau unduh. Gambar tampil sebagai pratinjau kecil di pesan; klik untuk membesarkan dan **Unduh PNG**. PDF dibuka di tab baru.
- **Poster otomatis**: kalau paket kerja Queen menyangkut visual (Pixel ikut, atau permintaan menyebut gambar/poster/desain/Instagram/konten), laporan akhir Queen menyertakan **2 desain poster 1080×1080** (SVG, bisa diunduh PNG). Rekap laporan juga ditulis Sonnet 5.5.
- Keamanan poster: SVG dari AI dibersihkan di server (tanpa script, event handler, gambar & tautan luar). Bucket `hc-agent-files` sekarang menerima `image/svg+xml` (migrasi `20261014170000_hc_agent_files_svg.sql`).
- Gambar AI sungguhan (foto/ilustrasi) menyusul setelah kunci API gambar dipasang di Supabase Secrets.

### Queen Bea sebagai ketua: membagi kerja sendiri & laporan otomatis
- Queen memutuskan sendiri pembagian kerja: setiap permintaan berupa pekerjaan dipecah jadi tugas untuk agent yang tepat (hingga 5, lintas divisi) tanpa menanyakan siapa yang harus mengerjakan.
- Setiap delegasi dari percakapan dicatat sebagai paket kerja (`hc_delegations`). Begitu semua tugasnya selesai, trigger memanggil `agent-chat` (`queen_report`) dan Queen mengirim **rekap** (ringkasan, poin per agent, langkah berikutnya) ke percakapan yang sama, lengkap dengan **lampiran** laporan lengkap + hasil tiap agent (.md).
- Berlaku untuk Queen mode Claude & Grok, termasuk tugas yang dikerjakan agent Grok Bot.

### Tim agent bergerak otomatis (persetujuan kata kunci dimatikan)
- Kata kunci persetujuan owner dihapus dari semua agent (sebelumnya Spark: `iklan`, `pengeluaran`; Sage: `kontrak`; Penny: `pembayaran`). Delegasi Queen dan tugas langsung dikerjakan tanpa menunggu.
- Alasan: agent saat ini hanya menulis draf & rekomendasi, belum melakukan aksi sungguhan (bayar, pasang iklan, tanda tangan), dan kata "iklan" membuat hampir semua tugas Spark tertahan.
- Alur persetujuan tetap ada dan bisa dinyalakan lagi per agent lewat `hc_agent_prompts.needs_approval_for` (contoh di migrasi `20261014150000_hc_agent_no_approval.sql`).

### Perbaikan: Queen Bea bisa membaca hasil kerja timnya
- Sebelumnya data yang dibaca Queen hanya berisi tugas yang belum selesai tanpa isi hasilnya, sehingga Queen meminta pengguna menempelkan hasil sendiri.
- Sekarang Queen (mode Claude & Grok) menerima blok **hasil tugas agent 2 hari terakhir** beserta isinya, tugas yang diminta pengguna ditandai, dan persona diarahkan untuk merangkum hasil sendiri serta menyebut status tugas yang menunggu persetujuan.

### Ikon situs & pratinjau link
- Logo heksagon Hive Colony jadi **favicon** (SVG + PNG 32px), **ikon layar utama HP** (apple-touch-icon & manifest, termasuk versi maskable untuk Android), dan warna tema browser emas.
- **Gambar pratinjau link** (og-image 1200×630) saat link Hive Colony dibagikan di WhatsApp, Telegram, atau Slack.

### Mode TV ala Kyumen, Portal saya, intro baru & wajib untuk staff baru
- **Mode TV**: kamera hanya berkeliling koloni seperti Kyumen (orbit menara, tur lantai, menyusuri depan menara), tanpa close-up karakter. Lebih tenang dan ringan.
- **Portal saya** (`#/saya`, tombol ketiga di koloni): kanban tugas tim untuk saya + to-do pribadi, tugas saya ke agent beserta hasilnya, percakapan & hasil tersimpan, rapat yang saya ikuti dan tindak lanjut untuk saya (bisa langsung masuk kanban). Kartu "Portal karyawan" di Hive Hall dihapus.
- **Database**: penanggung jawab (`assignee`) dan pembuat (`created_by`) di tugas papan rencana, tabel to-do pribadi `hc_todos`, penanda `intro_seen_at` di profil.
- **Intro** jadi ±80 detik dengan adegan baru "Pekerjaanmu, satu halaman" (Portal saya).
- **SOP staff baru**: staff yang baru mendaftar wajib menonton intro sampai selesai sebelum bisa membuka halaman lain, lalu diarahkan membuat avatar. Akun lama tidak dipaksa.

### Mode Intro: video perkenalan ±75 detik
- Halaman `#/intro` (tombol 🎬 Intro di rak alat) memutar video perkenalan langsung dari scene 3D koloni: terbang ke menara saat matahari terbit, tur 7 divisi, Queen mendelegasikan tugas, Ruang Kerja, Hive Hall, time-lapse malam, statistik, dan penutup.
- Siap direkam: layar penuh dengan F, kursor & tombol tersembunyi saat diputar, `#/intro?t=30` untuk merekam ulang mulai detik tertentu.

### Grok Bot penuh, statistik & kuota, Ruang Kerja lebih nyaman
- **Tugas untuk Nimbus, Loop, Ping lewat Grok Bot**: Jadikan tugas, tugas rutin, dan delegasi Queen dikirim lewat thread tugas; balasan bot otomatis jadi hasil tugas di papan rencana dan tugas ditandai selesai. Ketiganya selalu tampil Online (tidak bergantung n8n).
- **Queen Bea mode Grok** sekarang menerima data koloni & daftar agent, dan bisa mendelegasikan tugas lewat blok `[[DELEGATE]]` yang diproses server (blok disembunyikan dari chat).
- **⚡ Mode hemat** di rak alat: tanpa efek cahaya & bayangan, resolusi 1x, untuk laptop/TV yang berat.
- **📊 Statistik** (owner): pesan per agent & staff, tugas, gagal, waktu balas rata-rata, perkiraan token, grafik harian; **batas pesan harian per staff** yang bisa diatur owner.
- **Ruang Kerja**: cari di semua percakapan, sematkan & ganti judul percakapan, unduh percakapan (.md), sisa kuota hari ini.
- Logika bersama Edge Function dipindah ke `supabase/functions/_shared/hive.ts`.

### Mode percakapan suara di Ruang Kerja
- Tombol 🗣 di kotak chat: bicara → terkirim otomatis setelah diam ±1,5 detik → jawaban agent dibacakan → mikrofon menyala lagi, sampai Selesai.
- Bisa menyela dengan ✋ Potong atau spasi; berhenti sendiri setelah 90 detik tanpa suara; bunyi penanda saat mikrofon mulai mendengar.
- Berlaku untuk semua agent, termasuk Grok Bot yang balasannya menyusul. Semua tetap tersimpan sebagai teks di riwayat.
- Memakai pengenalan & suara bawaan browser (gratis; paling stabil di Chrome/Edge).

### Grok Bot: riwayat & persona ikut terkirim
- Payload ke Grok Bot sekarang membawa `history` (10 pesan terakhir thread) dan `persona` (prompt lengkap agent dari `hc_agent_prompts`, atau persona Queen Bea yang sama dengan Claude).
- Persona Queen Bea dipindah ke `supabase/functions/_shared/queenPersona.ts`, dipakai bersama `queen-bea` dan `agent-chat`.
- Saat menunggu balasan bot, Ruang Kerja menampilkan "… sedang berpikir" dengan titik beranimasi.

## 13 Oktober 2026

### Grok Bot untuk Nimbus, Loop, Ping & Queen Bea (opsional)
- Nimbus (`cloud`), Loop (`workflow`), dan Ping (`network`) sekarang dijawab Grok Bot; Queen Bea bisa dipilih Claude atau Grok Bot di kepala chat (default Claude, tersimpan di browser).
- Edge Function `agent-chat` meneruskan pesan + isi lampiran ke bot (secret `GROKBOT_URL_<AGENT>` / `GROKBOT_KEY_<AGENT>`, batas 15 detik) dan menjawab `pending`; bot yang menulis balasan ke percakapan.
- Ruang Kerja menampilkan "… sedang mengetik…", menunggu balasan lewat Realtime + polling 5 detik, maksimal 3 menit.
- Jalur Claude/n8n untuk agent lain tidak berubah.

### Perapian koloni: wajib login, lebih ringan, tombol dirapikan (`a745d9a`)
- **Wajib login.** Mode demo dihapus; semua halaman (koloni, Hive Hall, Ruang Kerja, Mode TV) menampilkan form masuk kalau belum login. Sesi berakhir otomatis setiap jam 00:00 WIB.
- **Performa.** Furnitur statis digabung per material, bayangan diperbarui 5x per detik, lampu malam satu per lantai (17 → 4 lampu titik), tanpa AO, resolusi render menyesuaikan perangkat, dan panel hanya digambar ulang saat datanya berubah. Di laptop Intel UHD: draw call ±3.750 → ±1.560 per frame, fps ±10 → ±20–24 (mode pengembangan).
- **Tombol.** Speed 1×/2×/4× dan jeda dihapus. Hive Hall & Ruang Kerja jadi tombol utama yang mencolok; Reset kamera, Mode TV, Avatar, Joget pindah ke rak alat terpisah.
- **Staff online & status server** di header: siapa yang online (divisi dan halaman yang dibuka), status server agent n8n dan Queen Bea (Claude), tombol Cek ulang.
- Daftar agent tertutup secara default, dengung lebah saat kamera mendekat dihapus, lebah yang menganggur lebih tenang, Ruang Kerja lebih lebar, tampilan HP dengan dock bawah.

### Tahap 4 & 5: latih agent dan tugas rutin (`7fe46d2`, `84327c1`)
- 👍/👎 dan koreksi di setiap jawaban agent; skor skill nyata (30 hari terakhir) di chat, tab Skill, dan kartu agent koloni.
- Kartu skill & pelajaran serta persona dasar, diatur owner/Pelatih. Prompt yang dibaca n8n dirakit otomatis dari persona + skill + pelajaran.
- Masukan staff: koreksi bisa dijadikan pelajaran dengan sekali klik.
- Tugas rutin per agent (harian, hari kerja, mingguan, bulanan, jam WIB) + tombol Jalankan sekarang. Dijalankan workflow n8n baru **Hive - Routine Tick** setiap 5 menit.

### Tahap 3: Ruang Kerja lengkap (`b344ea8`)
- Lampiran file (gambar, PDF, TXT, CSV, MD, JSON) di penyimpanan privat; gambar & PDF dibaca Claude lalu isinya diteruskan ke agent/Queen Bea.
- Suara: dikte pesan, dengar jawaban, mode bacakan otomatis.
- Aksi di jawaban agent: Salin, Simpan ke Hasil tersimpan, Jadikan tugas (dikerjakan agent atau untuk diri sendiri).
- Jawaban agent setelah approval owner otomatis kembali ke percakapan asal.
- Queen Bea tahu status server agent dan bisa membaca lampiran.

### Tahap 2: Ruang Kerja Agent & Akses agent (`c97efba`)
- Halaman `#/agent/<id>`: chat dengan Queen Bea dan 20 agent, riwayat percakapan, tugas dari Queen beserta hasil lengkapnya.
- Halaman `#/akses` (khusus owner): atur akses staff per agent dengan tingkat Pakai / Pelatih.
- Alamat n8n disimpan di satu tempat (Supabase Vault).

### Tahap 1: koloni hidup dengan kerja agent sungguhan (`903da75`)
- Tugas AI sungguhan di papan rencana menggerakkan lebah 3D.
- Status agent nyata: Online / Kerja / Offline, termasuk otomatis offline saat server agent (n8n di PC kantor) mati.

### Integrasi n8n: Queen Bea mendelegasikan ke 20 agent (`65db065`, `c024d25`, PR #1)
- Queen Bea bisa memberi tugas ke 20 agent yang berjalan di n8n (Claude), dengan alur persetujuan owner.
- Workflow n8n **Agent Task Worker** dan **Approval Resume** diekspor ke repo.

### Tampilan "golden honey" & Mode TV (`95c17a3`, `0c0d20a`)
- Tampilan koloni dan Hive Hall mengikuti konsep visual atasan: diorama pulau melayang & aula madu.
- Mode TV (spectator) untuk layar besar dengan kamera otomatis.

## 10 Oktober 2026

- **Queen Bea standby di rapat + riset web**, obrolan suara koloni (public mic), karakter ratu baru (`b080fba`).
- **Arsip rapat** dan notulen otomatis oleh Queen Bea, status agent, laci menu HP (`310b502`).
- **Mode real** untuk staff yang login; Queen Bea tersambung ke Claude (`876f1e2`).
- **Meeting suara sungguhan** lewat LiveKit untuk staff yang login, plus perbaikan keandalan di HP (`860527a`, `971fe12`, `ce01aa7`, `99ead00`).
- Hive Hall jadi lobi dengan 4 fitur: meeting, presentasi, Chief, portal (`d63be28`).
- Template email Supabase bertema Hive Colony; tampilan HP direvamp (`c902f84`, `d93a76f`).

## 9 Oktober 2026

- Proyek diganti menjadi **Hive Colony 3D**: kantor virtual 21 agent AI (`d592caa`).
- Siklus siang-malam, suara, tamu lobby; jam koloni mengikuti WIB (`39ee02f`, `9bb261e`).
- Avatar staff, joget, area luar, dan Hive Hall (`0bd7ff7`, `d616e56`).
- Tersambung ke Supabase: akun staff, undangan, realtime (`ef9ab1e`, `e1b2d5a`).
