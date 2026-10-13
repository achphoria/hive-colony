# Riwayat perubahan Hive Colony

Catatan perubahan per tahap, terbaru di atas. Tanggal dalam WIB. Kode commit bisa diklik di GitHub untuk melihat detail perubahannya.

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
