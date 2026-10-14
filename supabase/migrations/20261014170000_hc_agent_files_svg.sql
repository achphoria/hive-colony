-- Poster desain otomatis dari laporan Queen disimpan sebagai SVG (dibersihkan dari script & tautan luar
-- sebelum diunggah, dan ditampilkan lewat <img> sehingga tidak bisa menjalankan kode).
update storage.buckets
set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','application/pdf','text/plain','text/csv','text/markdown','application/json']
where id = 'hc-agent-files';
