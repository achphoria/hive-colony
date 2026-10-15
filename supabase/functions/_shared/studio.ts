// Studio Pixel: gambar sungguhan untuk tugas visual Pixel dan poster di laporan Queen.
// - Desain & tata letak: Claude Sonnet 5.5 menulis SVG (teks, warna, bentuk) + slot untuk gambar.
// - Logo/gambar dari lampiran pengguna ditempel asli ke slot (bukan digambar ulang AI).
// - Foto latar AI (opsional): xAI, aktif kalau XAI_API_KEY ada di Edge Function Secrets.
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { settleTask, touchTaskProgress, type Db } from './hive.ts';
import { stripMachineBlocks } from './taskProtocol.js';

export const STUDIO_MODEL = 'claude-sonnet-5-5';
const BUCKET = 'hc-agent-files';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export type StudioImage = { name: string; type: string; data: string; w?: number; h?: number };
export type Poster = { title: string; svg: string };

function base64(buf: Uint8Array) {
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// ukuran PNG dari header IHDR (cukup untuk memberi tahu desainer bentuk logo)
function pngSize(buf: Uint8Array) {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return {};
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

const sniff = (b64: string) => (b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('iVBOR') ? 'image/png' : b64.startsWith('UklGR') ? 'image/webp' : 'image/jpeg');

// SVG dari model dibersihkan sebelum disimpan: tanpa script, event handler, gambar & tautan luar
export function cleanSvg(raw: string) {
  let s = String(raw || '').trim();
  const start = s.indexOf('<svg');
  const end = s.lastIndexOf('</svg>');
  if (start < 0 || end < start) return null;
  s = s.slice(start, end + 6);
  s = s
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<(image|use|a|iframe|object|embed)\b[\s\S]*?(\/>|<\/\1\s*>)/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none')
    .replace(/javascript:/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    // "&" mentah membuat SVG tidak valid (gambar gagal tampil)
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  if (!/xmlns=/.test(s.slice(0, 200))) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return s.length > 300 && s.length < 200000 ? s : null;
}

const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`))?.[1];

// <rect id="slot-PHOTO|IMGn" .../> diganti gambar sungguhan (data URI, tetap satu file SVG mandiri)
export function fillSlots(svg: string, slots: Record<string, StudioImage | null>) {
  return svg.replace(/<rect\b([^>]*?)\/?>(\s*<\/rect>)?/g, (whole, attrs: string) => {
    const id = attr(attrs, 'id')?.match(/^slot-(PHOTO|IMG\d)$/)?.[1];
    if (!id) return whole;
    const img = slots[id];
    if (!img) return '';
    const keep = ['x', 'y', 'width', 'height', 'opacity', 'clip-path', 'transform']
      .map((k) => [k, attr(attrs, k)])
      .filter(([, v]) => v != null && !/^url\((?!#)/.test(String(v)))
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');
    const fit = id === 'PHOTO' ? 'xMidYMid slice' : 'xMidYMid meet';
    return `<image${keep} preserveAspectRatio="${fit}" href="data:${img.type};base64,${img.data}"/>`;
  });
}

const STUDIO_PROMPT = `Kamu desainer grafis senior (Studio Pixel) di tim Hive Colony. Dari brief di bawah, buat desain poster/konten visual yang siap posting.
Keluaran JSON:
- width, height: ukuran kanvas dalam px sesuai brief (feed Instagram potret 1080×1350, persegi 1080×1080, story/reels 1080×1920, banner landscape 1920×1080). Kalau brief tidak menyebut, pakai 1080×1350.
- notes: catatan singkat untuk pengguna dalam Bahasa Indonesia (Markdown, maks. ±120 kata): konsep tiap varian, plus saran caption & 3-5 hashtag kalau cocok. Jangan menyebut slot, sistem, atau istilah teknis lain.
- photo_prompt: kalau FOTO AI tersedia, prompt Bahasa Inggris untuk foto latar realistis (subjek, aksi, gaya, cahaya, warna, komposisi). Sebutkan area kosong/gelap tempat teks akan diletakkan agar cocok dengan tata letakmu, dan tulis "no text, no letters, no logos, no watermark". Kalau tidak tersedia, isi string kosong.
- posters: varian desain yang BERBEDA tata letaknya, masing-masing { title, svg }.
Aturan teknis WAJIB setiap svg:
- SVG murni: <svg xmlns="http://www.w3.org/2000/svg" width="W" height="H" viewBox="0 0 W H"> ... </svg> dengan W×H = width×height.
- Hanya elemen: g, defs, linearGradient, radialGradient, stop, clipPath, rect, circle, ellipse, line, polyline, polygon, path, text, tspan.
- DILARANG: <image>, <script>, <foreignObject>, <style>, tautan/URL apa pun, font web. Pakai font-family="Arial, Helvetica, sans-serif" (boleh font-weight 900 & letter-spacing).
- Gambar sungguhan dimasukkan sistem lewat SLOT: tulis <rect id="slot-NAMA" x=".." y=".." width=".." height=".."/> di posisi gambar itu. Slot yang tersedia tertulis di brief.
  - slot-PHOTO (hanya kalau FOTO AI tersedia): foto latar penuh kanvas, letakkan PALING AWAL; sebelumnya buat latar warna/gradasi cadangan, dan sesudahnya overlay gradasi gelap agar teks terbaca.
  - slot-IMG1, slot-IMG2, ...: lampiran pengguna (mis. logo). Kalau brief meminta logo, WAJIB pasang slot logo dengan ukuran sesuai rasio gambarnya; jangan menggambar ulang logo dengan bentuk/teks.
  - Perhatikan warna lampiran: logo gelap/abu-abu di atas latar gelap (atau logo putih di latar terang) WAJIB diberi pelat kontras di belakangnya (rect membulat terang/gelap dengan padding ±16 px) supaya terbaca.
- Teks dalam XML: tulis "&" sebagai "&amp;" dan "<" sebagai "&lt;".
- Teks tidak boleh keluar kanvas: margin ≥ 70 px, pecah baris panjang dengan tspan, perkirakan lebar teks ±0,6 × font-size per huruf (huruf kapital tebal ±0,7).
- Pakai teks persis dari brief (nama acara, lokasi, tanggal, CTA). JANGAN menulis placeholder seperti [NOMINAL], [TANGGAL], XXX; kalau info belum ada, tulis contoh wajar yang siap pakai.
- Desain kaya & berlapis seperti poster profesional: hierarki teks tegas (headline sangat besar, subjudul, info pendukung, CTA), elemen dekoratif (garis, pola, badge, aksen neon/gradasi), kontras tinggi agar terbaca di HP. Kalau tanpa foto, buat ilustrasi utama dari banyak bentuk (path/ellipse/polygon dengan bayangan & sorotan).
- Ukuran tiap svg ±5.000–12.000 karakter.`;

const STUDIO_SCHEMA = {
  type: 'object',
  properties: {
    width: { type: 'integer' },
    height: { type: 'integer' },
    notes: { type: 'string' },
    photo_prompt: { type: 'string' },
    posters: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, svg: { type: 'string' } },
        required: ['title', 'svg'],
        additionalProperties: false,
      },
    },
  },
  required: ['width', 'height', 'notes', 'photo_prompt', 'posters'],
  additionalProperties: false,
};

export async function designPosters(
  client: Anthropic,
  o: { brief: string; images?: StudioImage[]; count?: number; photo?: boolean },
): Promise<{ width: number; height: number; notes: string; photoPrompt: string; posters: Poster[] }> {
  const images = (o.images || []).slice(0, MAX_IMAGES);
  const count = Math.min(3, Math.max(1, o.count || 2));
  const slotList = [
    o.photo ? '- slot-PHOTO: FOTO AI tersedia (dibuat dari photo_prompt kamu).' : '- FOTO AI tidak tersedia: jangan pakai slot-PHOTO, buat latar & ilustrasi dari bentuk.',
    ...images.map((im, i) => `- slot-IMG${i + 1}: lampiran "${im.name}"${im.w && im.h ? ` (${im.w}×${im.h} px)` : ''}, terlihat pada gambar ke-${i + 1} di atas.`),
  ].join('\n');
  const content: Anthropic.Messages.ContentBlockParam[] = [
    ...images.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.type as 'image/png', data: im.data } })),
    { type: 'text', text: `${o.brief}\n\nJUMLAH VARIAN: ${count}\nSLOT GAMBAR:\n${slotList}` },
  ];
  const res = await client.messages.create({
    model: STUDIO_MODEL,
    max_tokens: 20000,
    thinking: { type: 'adaptive' },
    // deno-lint-ignore no-explicit-any
    output_config: { effort: 'low', format: { type: 'json_schema', schema: STUDIO_SCHEMA } } as any,
    system: STUDIO_PROMPT,
    messages: [{ role: 'user', content }],
  });
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('');
  const d = JSON.parse(text) as { width?: number; height?: number; notes?: string; photo_prompt?: string; posters?: Poster[] };
  const width = Math.min(2160, Math.max(320, Number(d.width) || 1080));
  const height = Math.min(2160, Math.max(320, Number(d.height) || 1350));
  const posters = (d.posters || [])
    .slice(0, count)
    .map((p) => ({ title: String(p.title || 'Poster').slice(0, 80), svg: cleanSvg(p.svg) }))
    .filter((p) => p.svg) as Poster[];
  return { width, height, notes: String(d.notes || '').trim(), photoPrompt: String(d.photo_prompt || '').trim(), posters };
}

// ---------- foto AI (xAI) ----------
const RATIOS: [string, number][] = [
  ['1:1', 1],
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['2:3', 2 / 3],
  ['3:2', 3 / 2],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9],
];
const nearestRatio = (w: number, h: number) => RATIOS.reduce((best, r) => (Math.abs(r[1] - w / h) < Math.abs(best[1] - w / h) ? r : best))[0];

export const photoEnabled = () => !!Deno.env.get('XAI_API_KEY');

export async function aiPhoto(prompt: string, w: number, h: number): Promise<StudioImage | null> {
  const key = Deno.env.get('XAI_API_KEY');
  if (!key || !prompt) return null;
  const model = Deno.env.get('XAI_IMAGE_MODEL') || 'grok-imagine-image-2.0';
  const call = (body: Record<string, unknown>) =>
    fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
  let r = await call({ model, prompt: prompt.slice(0, 4000), n: 1, response_format: 'b64_json', aspect_ratio: nearestRatio(w, h), resolution: '1k' });
  // parameter opsional ditolak? ulangi dengan bentuk paling dasar
  if (r.status === 400 || r.status === 422) r = await call({ model, prompt: prompt.slice(0, 4000), n: 1, response_format: 'b64_json' });
  if (!r.ok) {
    console.error('xai image', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return null;
  }
  const d = await r.json().catch(() => null);
  const it = d?.data?.[0];
  if (it?.b64_json) return { name: 'foto-ai', type: sniff(it.b64_json), data: it.b64_json };
  if (typeof it?.url === 'string' && it.url.startsWith('https://')) {
    const img = await fetch(it.url, { signal: AbortSignal.timeout(30000) });
    if (!img.ok) return null;
    const b64 = base64(new Uint8Array(await img.arrayBuffer()));
    return { name: 'foto-ai', type: img.headers.get('content-type')?.split(';')[0] || sniff(b64), data: b64 };
  }
  return null;
}

// ---------- tugas Pixel: dikerjakan Studio, hasil berupa file poster ----------
type Msg = { role: string; content: string; meta: { files?: { path?: string; name?: string; type?: string; size?: number }[] } | null };

async function threadContext(a: Db, threadId: string) {
  const { data } = await a.from('hc_agent_messages').select('role, content, meta').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(16);
  const msgs = (data ?? []) as Msg[];
  const images: StudioImage[] = [];
  for (const m of msgs) {
    if (m.role !== 'user') continue;
    for (const f of m.meta?.files || []) {
      if (images.length >= MAX_IMAGES || !f.path || !IMAGE_TYPES.includes(String(f.type)) || Number(f.size) > MAX_IMAGE_BYTES) continue;
      const { data: blob } = await a.storage.from(BUCKET).download(f.path);
      if (!blob) continue;
      const buf = new Uint8Array(await blob.arrayBuffer());
      images.push({ name: String(f.name || 'lampiran'), type: String(f.type), data: base64(buf), ...(f.type === 'image/png' ? pngSize(buf) : {}) });
    }
  }
  const convo = msgs
    .slice()
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'agent')
    .map((m) => `${m.role === 'user' ? 'Pengguna' : 'Agent'}: ${stripMachineBlocks(String(m.content || '')).slice(0, 700)}${m.meta?.files?.length ? ` [lampiran: ${m.meta.files.map((f) => f.name).join(', ')}]` : ''}`)
    .join('\n');
  return { convo, images };
}

export async function runStudio(a: Db, client: Anthropic, taskId: string, detail: string) {
  const { data: task } = await a.from('hc_plan_tasks').select('id, title, who, col, source_thread_id, created_by').eq('id', taskId).maybeSingle();
  if (!task || task.col !== 'doing') return;
  await touchTaskProgress(a, taskId, 0.15, 'Studio Pixel merancang desain');
  const ctx = task.source_thread_id ? await threadContext(a, task.source_thread_id) : { convo: '', images: [] as StudioImage[] };
  const photo = photoEnabled();
  const brief = `TUGAS: ${task.title}\n\nDETAIL:\n${detail || '-'}${ctx.convo ? `\n\nPERCAKAPAN DENGAN PENGGUNA (terbaru di bawah):\n${ctx.convo}` : ''}`;
  const design = await designPosters(client, { brief, images: ctx.images, count: 2, photo });
  if (!design.posters.length) {
    await settleTask(a, { taskId, outcome: 'failed', result: 'Studio Pixel tidak berhasil membuat desain yang valid. Coba lagi.' });
    return;
  }

  let shot: StudioImage | null = null;
  if (photo && design.photoPrompt) {
    await touchTaskProgress(a, taskId, 0.6, 'Membuat foto AI');
    shot = await aiPhoto(design.photoPrompt, design.width, design.height).catch((e) => {
      console.error('xai image', String(e));
      return null;
    });
  }
  await touchTaskProgress(a, taskId, 0.85, 'Menyusun poster');

  const slots: Record<string, StudioImage | null> = { PHOTO: shot };
  ctx.images.forEach((im, i) => (slots[`IMG${i + 1}`] = im));
  const owner = task.created_by || 'studio';
  const files: { path: string; name: string; type: string; size: number }[] = [];
  for (const [n, p] of design.posters.entries()) {
    const bytes = new TextEncoder().encode(fillSlots(p.svg, slots));
    const path = `${owner}/studio/${taskId}/poster-${n + 1}.svg`;
    const { error } = await a.storage.from(BUCKET).upload(path, new Blob([bytes], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml', upsert: true });
    if (error) console.error('upload studio', error.message);
    else files.push({ path, name: `Poster ${n + 1} - ${p.title}.svg`.slice(0, 110), type: 'image/svg+xml', size: bytes.length });
  }
  if (!files.length) {
    await settleTask(a, { taskId, outcome: 'failed', result: 'Desain sudah dibuat, tetapi gagal disimpan. Coba lagi.' });
    return;
  }
  const extra = !photo
    ? '\n\n_Foto latar AI belum aktif, jadi poster memakai ilustrasi grafis._'
    : !shot
      ? '\n\n_Foto AI gagal dibuat kali ini, jadi poster memakai latar grafis._'
      : '';
  const result = `${design.notes || `Desain untuk "${task.title}" sudah jadi.`}\n\n🎨 ${files.length} desain (${design.width}×${design.height}) ada di lampiran: klik untuk melihat, lalu **Unduh PNG**.${extra}`;
  await settleTask(a, { taskId, outcome: 'done', result, files });
}
