# Video call lewat Cloudflare Realtime

Pengganti LiveKit untuk rapat Hive Hall: Cloudflare Realtime SFU (meneruskan audio/video) + TURN (relay bila jaringan memblokir UDP). Tidak ada server sendiri: semua panggilan ke Cloudflare lewat Edge Function Supabase `realtime-session`.

## Status (branch `feat/video-cloudflare`)

- **Tahap 1**: uji dua orang (publish kamera + mic, lihat & dengar peserta lain).
- **Tahap 2**: ruang rapat lengkap di `#/rapat/<id rapat>`, kalender rapat di Hive Hall → Kalender. `#/video` membuka rapat yang sedang berjalan.
- Tahap 3 belum: transkrip/notulen dari audio rapat video, rekaman, flag `VIDEO_PROVIDER`. LiveKit belum disentuh.

## Yang perlu dipasang

Secret (Supabase → Edge Functions → Secrets):

| Nama | Isi |
|---|---|
| `CLOUDFLARE_REALTIME_APP_ID` | App ID dari Cloudflare → Realtime → Serverless SFU |
| `CLOUDFLARE_REALTIME_APP_TOKEN` | App Secret app SFU yang sama |
| `CLOUDFLARE_TURN_KEY_ID` | ID TURN key (Cloudflare → Realtime → TURN Server) |
| `CLOUDFLARE_TURN_KEY_API_TOKEN` | API token TURN key yang sama |

TURN opsional: tanpa dua secret TURN, panggilan memakai STUN publik Cloudflare, tapi peserta di jaringan kantor/seluler yang ketat bisa gagal tersambung. Secret tidak pernah dikirim ke browser.

Database: jalankan `supabase/migrations/20261021090000_hc_video_rooms.sql` (SQL Editor atau `supabase db push`). Isinya tabel `hc_meeting_events` (jadwal), kolom `hc_meetings.event_id`, tabel `hc_meeting_participants`, dan kind `chat` di `hc_meeting_lines`.

Fungsi: `supabase functions deploy realtime-session --project-ref ccbyqgisgclqlqatxwbk`.

## Cara kerja

- Tiap peserta punya dua koneksi WebRTC ke SFU: satu untuk publish (mic, kamera simulcast 3 lapis, share screen), satu untuk menerima. Negosiasi SDP tiap koneksi diantrekan satu per satu, sesuai panduan Cloudflare.
- Peserta & track: Supabase Realtime Presence kanal `hc-call:<id rapat>` (sumber "siapa sedang di room"); catatan yang bertahan di `hc_meeting_participants`. Perintah host dan chat lewat broadcast di kanal yang sama; chat disimpan di `hc_meeting_lines` (kind `chat`).
- `realtime-session` memeriksa login, profil staff (bukan viewer), rapat masih `live`, dan peserta belum dikeluarkan. Tiap sesi SFU diberi token HMAC yang terikat ke (user, rapat, sesi); track orang lain hanya bisa diambil dengan `sig` yang terikat ke rapat yang sama.
- Host (owner): **matikan mic** = permintaan ke browser peserta (peserta bisa menyalakan lagi, seperti Zoom). **Keluarkan** = ditegakkan server: track peserta dihentikan paksa di SFU dan ia tidak bisa masuk lagi ke rapat itu.
- Hemat bandwidth: kamera dikirim 3 lapis (a ≈ 720p/0,9 Mbps, b ≈ 360p/0,3 Mbps, c ≈ 180p/0,1 Mbps). Tiap tile meminta lapis sesuai tingginya di layar. Saat koneksi lemah (RTT > 450 ms, packet loss > 6%, atau bandwidth unggah < 250 kbps), lapis yang diminta turun satu dan lapis teratas kamera sendiri dimatikan.
- Kalender: satu rapat berjalan pada satu waktu. Tiap jadwal membuka rapatnya sendiri (room = `hc_meetings.id`, `event_id` = jadwal).

## Perkiraan pemakaian

Cloudflare hanya menagih data yang dikirim **dari** Cloudflare ke peserta ($0.05/GB, 1.000 GB pertama tiap bulan gratis, dipakai bersama SFU dan TURN). GB per jam = Mbps yang diterima semua peserta × 0,45.

| Rapat (kamera semua menyala) | Tiap peserta menerima | GB per jam rapat |
|---|---|---|
| 2 orang | 1 video penuh | ~0,85 |
| 4 orang, tampilan grid | 3 video lapis b | ~1,8 |
| 4 orang, tampilan pembicara | 1 penuh + 2 kecil | ~2,2 |
| 8 orang, tampilan pembicara | 1 penuh + 6 kecil | ~6,4 |
| + share screen | +1,5 Mbps per penonton | +0,7 per penonton |

Tanpa simulcast (tahap 1), 8 orang menghabiskan ~24 GB per jam.
