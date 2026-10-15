# Grok Bot: mengirim gambar ke Hive Colony

Spesifikasi untuk pengelola kode Grok Bot. Hive Colony tidak membuat gambar sendiri untuk Pixel (dan agent Grok lain). Bot yang membuat gambarnya, lalu mengirim **URL** gambar itu. Hive mengunduh file tersebut, menyimpannya di penyimpanan Hive, dan menampilkannya di Ruang Kerja (pratinjau, perbesar, Unduh PNG).

## 1. Yang diterima bot dari Hive

Payload `POST` ke bot tetap sama seperti sekarang, ditambah satu field opsional:

```json
{
  "thread_id": "...",
  "agent_id": "visual",
  "message": "buatkan poster ...",
  "files": [
    { "name": "logo.png", "type": "image/png", "url": "https://...supabase.co/storage/v1/object/sign/..." }
  ]
}
```

- `files` berisi lampiran pengguna, misalnya logo. URL-nya tautan sementara: 1 jam untuk chat, 24 jam untuk tugas.
- Untuk tugas, `files` berisi gambar yang dilampirkan pengguna di percakapan asal tugas (maks. 3).
- Pakai lampiran apa adanya. Misalnya, logo ditempel ke poster, bukan digambar ulang.

## 2. Membuat gambar

Gambar dibuat dengan kunci xAI milik bot sendiri, contohnya lewat `POST https://api.x.ai/v1/images/generations` dengan model `grok-imagine-image-2.0` (lihat dokumentasi xAI). URL hasil dari xAI boleh langsung dikirim ke Hive. Hive menyalinnya, jadi URL yang kedaluwarsa tidak masalah, asalkan masih aktif beberapa menit setelah dikirim.

## 3. Mengirim gambar ke Hive

Format setiap file:

```json
{ "url": "https://...", "name": "poster-stage-iii.png", "type": "image/png" }
```

- `url` harus **https** dan bisa diunduh tanpa login.
- Jenis file: PNG, JPG, WEBP, GIF, atau PDF. Maks. 10 MB per file, maks. 6 file per pesan.

### a. Balasan chat

Saat bot menulis balasan ke `hc_agent_messages`, isi `meta.files`:

```json
{
  "thread_id": "<thread_id dari payload>",
  "role": "agent",
  "content": "Ini dua varian poster STAGE III.",
  "meta": { "engine": "grokbot", "files": [ { "url": "https://...", "name": "poster-1.png", "type": "image/png" } ] }
}
```

### b. Tugas (thread yang pesannya diawali `TUGAS:`)

Gunakan salah satu cara berikut.

- **Callback** ke `task.callback_url`:

  ```json
  { "action": "task_update", "task_id": "...", "token": "...", "status": "done", "result": "Poster sudah jadi: ...", "files": [ { "url": "https://...", "name": "poster.png", "type": "image/png" } ] }
  ```

- **Pesan di thread tugas** yang diakhiri `[[DONE]]` lalu hasilnya, dengan `meta.files` seperti pada balasan chat.

Tugas gambar yang ditutup tanpa file dan tanpa hasil teks dianggap **gagal**.

## 4. Yang dilakukan Hive

1. Mengunduh setiap URL, mengecek jenis dan ukurannya, lalu menyimpannya ke bucket `hc-agent-files`.
2. Mengganti `url` di pesan dengan `path` file yang disimpan.
3. Untuk tugas: menandai tugas Selesai, lalu menyalin hasil dan gambarnya ke chat tempat tugas diminta.

Kalau unduhan gagal, URL tetap disimpan apa adanya dan bisa dibuka di tab baru, tapi tidak muncul sebagai pratinjau.
