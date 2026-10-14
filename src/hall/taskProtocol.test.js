import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyTaskReply,
  hasRealOutput,
  imageUrlsIn,
  isEmptyPromise,
  parseCommit,
  parseProgress,
  stripMachineBlocks,
} from '../../supabase/functions/_shared/taskProtocol.js';

test('janji chat kosong terdeteksi, jawaban panjang tidak', () => {
  assert.equal(isEmptyPromise('Hasil visual akan saya kirim begitu render selesai.'), true);
  assert.equal(isEmptyPromise('Siap, ini tiga konsep poster:\n\n1. Neon gym\n2. Kopi lapis\n3. Member story, masing-masing dengan palet emas.'), false);
});

test('[[COMMIT]] membuat tugas, blok tidak ikut tampil', () => {
  const raw = 'Baik, saya kerjakan poster itu.\n[[COMMIT]] {"title":"Poster promo","detail":"2 variasi 1080"}';
  assert.deepEqual(parseCommit(raw), { title: 'Poster promo', detail: '2 variasi 1080' });
  assert.equal(stripMachineBlocks(raw), 'Baik, saya kerjakan poster itu.');
  assert.equal(parseCommit('[[COMMIT]] {"detail":"tanpa judul"}'), null);
});

test('progres tidak menyelesaikan tugas, hasil kosong jadi gagal', () => {
  const progress = classifyTaskReply('Sedang render.\n[[PROGRESS]] {"pct":40,"note":"Variasi 1"}', {});
  assert.equal(progress.kind, 'progress');
  assert.equal(progress.progress, 0.4);
  assert.equal(progress.note, 'Variasi 1');

  const empty = classifyTaskReply('[[DONE]]', {});
  assert.equal(empty.kind, 'failed');

  const promise = classifyTaskReply('Hasilnya akan saya kirim begitu render selesai.', {});
  assert.equal(promise.kind, 'progress');

  const text = classifyTaskReply('Berikut brief lengkap untuk feed Instagram minggu depan, dengan palet emas dan dua layout.', {});
  assert.equal(text.kind, 'result');

  const shot = classifyTaskReply('Poster selesai.', { files: [{ url: 'https://cdn.example.com/poster.png', name: 'poster.png', type: 'image/png' }] });
  assert.equal(shot.kind, 'result');
  assert.equal(shot.files[0].url, 'https://cdn.example.com/poster.png');
  assert.equal(hasRealOutput('', shot.files), true);
  assert.equal(hasRealOutput('http://evil', []), false);
});

test('url gambar di hasil bisa ditampilkan', () => {
  const urls = imageUrlsIn('Lihat https://cdn.example.com/a.png dan https://cdn.example.com/a.png.');
  assert.deepEqual(urls, ['https://cdn.example.com/a.png']);
});

test('daftar Grok di server dan UI sama, termasuk Pixel dan Spark', () => {
  const hive = readFileSync(new URL('../../supabase/functions/_shared/hive.ts', import.meta.url), 'utf8');
  const api = readFileSync(new URL('./agentApi.js', import.meta.url), 'utf8');
  const list = "['cloud', 'workflow', 'network', 'visual', 'ads']";
  assert.ok(hive.includes(`GROK_AGENTS = ${list}`));
  assert.ok(api.includes(`GROK_AGENTS = ${list}`));
  assert.match(hive, /ATURAN TUGAS/);
  assert.match(hive, /Jadikan tugas/);
  assert.match(hive, /compiledPrompt/);
});
