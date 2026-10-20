# Video call lewat Cloudflare Realtime

Pengganti LiveKit untuk rapat Hive Hall: Cloudflare Realtime SFU (meneruskan audio/video) + TURN (relay bila jaringan memblokir UDP). Tidak ada server sendiri: semua panggilan ke Cloudflare lewat Edge Function Supabase `realtime-session`.

## Status

- **Tahap 1 (branch `feat/video-cloudflare`)**: uji dua orang di `#/video`. Masuk rapat yang sedang berjalan, publish kamera + mic, lihat dan dengar peserta lain. LiveKit belum disentuh.
- Tahap 2–3 belum dikerjakan.

## Secret (Supabase → Edge Functions → Secrets)

| Nama | Isi |
|---|---|
| `CLOUDFLARE_REALTIME_APP_ID` | App ID dari Cloudflare → Realtime → Serverless SFU |
| `CLOUDFLARE_REALTIME_APP_TOKEN` | App Secret app SFU yang sama |
| `CLOUDFLARE_TURN_KEY_ID` | ID TURN key (Cloudflare → Realtime → TURN Server) |
| `CLOUDFLARE_TURN_KEY_API_TOKEN` | API token TURN key yang sama |

TURN opsional: tanpa dua secret TURN, panggilan tetap jalan memakai STUN publik Cloudflare, tapi peserta di jaringan kantor/seluler yang ketat bisa gagal tersambung. Secret tidak pernah dikirim ke browser.

Deploy fungsinya: `supabase functions deploy realtime-session --project-ref ccbyqgisgclqlqatxwbk`.

## Cara kerja

- Tiap peserta punya dua koneksi WebRTC ke SFU: satu untuk publish (mic + kamera), satu untuk menerima track peserta lain. Negosiasi SDP tiap koneksi diantrekan satu per satu, sesuai panduan Cloudflare.
- Daftar peserta dan track yang mereka publish dibagikan lewat Supabase Realtime Presence, kanal `hc-call:<id rapat>`.
- `realtime-session` memeriksa login, profil staff (bukan viewer), dan bahwa rapat masih `live`. Setiap sesi SFU diberi token HMAC yang terikat ke (user, rapat, sesi): hanya pemiliknya yang bisa mengubah sesi itu. Track orang lain hanya bisa diambil dengan `sig` yang terikat ke rapat yang sama.
- Kredensial TURN dibuat per peserta, berlaku 4 jam.

## Perkiraan pemakaian

Cloudflare hanya menagih data yang dikirim **dari** Cloudflare ke peserta ($0.05/GB, 1.000 GB pertama tiap bulan gratis, dipakai bersama SFU dan TURN). Tahap 1 mengirim video maks. ~0,9 Mbps + audio ~0,04 Mbps per peserta.

| Peserta | GB per jam rapat (kamera semua menyala) |
|---|---|
| 2 | ~0,85 |
| 4 | ~5 |
| 6 | ~13 |

Rumus: peserta × (peserta − 1) × ~0,42 GB/jam. Tahap 2 (simulcast + resolusi turun untuk tile kecil) menurunkan angka untuk rapat besar.
