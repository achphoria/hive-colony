// Poster SVG untuk laporan Queen (paket visual tanpa gambar dari Pixel).
// Claude Sonnet 5.5 menulis SVG (teks, warna, bentuk); lampiran gambar (mis. logo) bisa ditempel asli lewat slot.
// Gambar tugas Pixel sendiri dibuat Grok Bot dan disalin ke bucket oleh importFiles (hive.ts).
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';

export const STUDIO_MODEL = 'claude-sonnet-5-5';
const MAX_IMAGES = 3;

export type StudioImage = { name: string; type: string; data: string; w?: number; h?: number };
export type Poster = { title: string; svg: string };

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

const STUDIO_PROMPT = `Kamu desainer grafis senior di tim Hive Colony. Dari brief di bawah, buat desain poster/konten visual yang siap posting.
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
