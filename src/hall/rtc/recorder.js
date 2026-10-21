// Rekaman rapat video (flag MEETING_RECORDING=on), dijalankan di browser host:
// video peserta digabung ke satu kanvas 1280x720, semua suara dicampur, lalu direkam MediaRecorder.
// Rekaman dipotong per 5 menit (tiap bagian file utuh yang bisa diputar sendiri, ±30 MB) supaya muat
// batas unggah Supabase Storage, lalu diunggah ke bucket privat hc-meeting-recordings dan dicatat di
// hc_meeting_recordings. Bagian yang gagal diunggah diunduh ke komputer host supaya tidak hilang.
import { supabase } from '../../lib/supabase';

const BUCKET = 'hc-meeting-recordings';
const W = 1280;
const H = 720;
const FPS = 15;
const SEGMENT_MS = 5 * 60 * 1000;
const VIDEO_BPS = 800_000;
const AUDIO_BPS = 64_000;
const MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

export const canRecord = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;

const initials = (n) =>
  (n || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// getScene(): { tiles: [{ key, name, cam, stream }], screen: { name, stream } | null, audio: [MediaStream] }
// onState({ on, uploading, parts, error })
export function createRecorder({ meetingId, getScene, onState }) {
  const mime = MIMES.find((m) => window.MediaRecorder.isTypeSupported?.(m)) || '';
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const videos = new Map(); // stream.id -> <video>
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const sources = new Map(); // track.id -> MediaStreamAudioSourceNode
  let drawTimer = null;
  let segTimer = null;
  let rec = null;
  let part = 0;
  let on = false;
  let uploading = 0;
  let parts = 0;
  let error = '';
  const pending = [];
  const emit = () => onState?.({ on, uploading: uploading > 0, parts, error });

  function videoFor(stream) {
    if (!stream) return null;
    let v = videos.get(stream.id);
    if (!v) {
      v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = stream;
      v.play().catch(() => {});
      videos.set(stream.id, v);
    }
    return v;
  }

  function drawBox(v, x, y, w, h, contain) {
    if (!v || v.readyState < 2 || !v.videoWidth) return false;
    const vr = v.videoWidth / v.videoHeight;
    const br = w / h;
    let sx = 0;
    let sy = 0;
    let sw = v.videoWidth;
    let sh = v.videoHeight;
    let dx = x;
    let dy = y;
    let dw = w;
    let dh = h;
    if (contain) {
      if (vr > br) {
        dh = w / vr;
        dy = y + (h - dh) / 2;
      } else {
        dw = h * vr;
        dx = x + (w - dw) / 2;
      }
    } else if (vr > br) {
      sw = sh * br;
      sx = (v.videoWidth - sw) / 2;
    } else {
      sh = sw / br;
      sy = (v.videoHeight - sh) / 2;
    }
    g.drawImage(v, sx, sy, sw, sh, dx, dy, dw, dh);
    return true;
  }

  function drawTile(t, x, y, w, h) {
    g.fillStyle = '#24211b';
    g.fillRect(x, y, w, h);
    const shown = t.cam && drawBox(videoFor(t.stream), x, y, w, h, false);
    if (!shown) {
      g.fillStyle = '#f5b700';
      g.font = `600 ${Math.round(h / 4)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(initials(t.name), x + w / 2, y + h / 2);
    }
    g.font = '600 18px sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    const label = t.name || '';
    const tw = Math.min(w - 16, g.measureText(label).width + 16);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x + 8, y + h - 34, tw, 26);
    g.fillStyle = '#fff6e0';
    g.fillText(label, x + 16, y + h - 15, w - 32);
  }

  function draw() {
    const scene = getScene();
    g.fillStyle = '#17150f';
    g.fillRect(0, 0, W, H);
    const tiles = scene.tiles.slice(0, 9);
    if (scene.screen) {
      // presentasi: layar 960 lebar di kiri, sampai 4 peserta di kolom kanan
      drawBox(videoFor(scene.screen.stream), 0, 0, 960, H, true);
      tiles.slice(0, 4).forEach((t, i) => drawTile(t, 968, i * 182, 312, 174));
    } else if (tiles.length) {
      const cols = Math.ceil(Math.sqrt(tiles.length));
      const rows = Math.ceil(tiles.length / cols);
      const tw = W / cols;
      const th = H / rows;
      tiles.forEach((t, i) => drawTile(t, (i % cols) * tw + 2, Math.floor(i / cols) * th + 2, tw - 4, th - 4));
    }
    // campuran suara mengikuti peserta yang sedang ada
    const want = new Map();
    for (const s of scene.audio) for (const tr of s?.getAudioTracks() || []) want.set(tr.id, tr);
    for (const [id, node] of sources)
      if (!want.has(id)) {
        node.disconnect();
        sources.delete(id);
      }
    for (const [id, tr] of want)
      if (!sources.has(id)) {
        const node = audioCtx.createMediaStreamSource(new MediaStream([tr]));
        node.connect(dest);
        sources.set(id, node);
      }
    // video peserta yang sudah pergi tidak perlu diputar lagi
    const live = new Set([...scene.tiles.map((t) => t.stream?.id), scene.screen?.stream?.id].filter(Boolean));
    for (const [id, v] of videos)
      if (!live.has(id)) {
        v.srcObject = null;
        videos.delete(id);
      }
  }

  async function upload(blob, n, startedAt, seconds) {
    const path = `${meetingId}/${startedAt.replace(/[:.]/g, '-')}-bagian${n}.${ext}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error: e } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime.split(';')[0] || 'video/webm', upsert: false });
      if (!e || /exists/i.test(e.message)) {
        const { error: e2 } = await supabase.from('hc_meeting_recordings').insert({ meeting_id: meetingId, part: n, path, mime: mime.split(';')[0] || 'video/webm', size_bytes: blob.size, duration_s: Math.round(seconds), started_at: startedAt });
        if (e2) console.warn('catatan rekaman gagal', e2.message);
        return true;
      }
      console.warn('unggah rekaman gagal', e.message);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    // jangan sampai hilang: simpan ke komputer host
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = path.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    error = `Bagian ${n} gagal diunggah dan sudah diunduh ke komputer Anda.`;
    return false;
  }

  function startSegment(stream) {
    const n = ++part;
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const chunks = [];
    const r = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS });
    r.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
    r.onstop = () => {
      const blob = new Blob(chunks, { type: mime.split(';')[0] || 'video/webm' });
      if (!blob.size) return;
      uploading++;
      emit();
      const job = upload(blob, n, startedAt, (Date.now() - t0) / 1000).then((ok) => {
        uploading--;
        if (ok) parts++;
        emit();
      });
      pending.push(job);
    };
    r.start(10000);
    return r;
  }

  return {
    mime,
    start() {
      if (on) return;
      on = true;
      error = '';
      audioCtx.resume?.().catch(() => {});
      draw();
      drawTimer = setInterval(draw, 1000 / FPS);
      const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      rec = startSegment(stream);
      // potong per 5 menit: bagian lama diunggah selagi bagian baru direkam
      segTimer = setInterval(() => {
        const old = rec;
        rec = startSegment(stream);
        old.stop();
      }, SEGMENT_MS);
      emit();
    },
    // selesai saat semua bagian sudah diunggah (atau diunduh sebagai cadangan)
    async stop() {
      if (!on) return;
      on = false;
      clearInterval(segTimer);
      if (rec?.state !== 'inactive') {
        const stopped = new Promise((r) => rec.addEventListener('stop', r, { once: true }));
        rec.stop();
        await stopped;
      }
      clearInterval(drawTimer);
      emit();
      await Promise.all(pending);
      for (const v of videos.values()) v.srcObject = null;
      videos.clear();
      audioCtx.close().catch(() => {});
      emit();
    },
    isUploading: () => uploading > 0,
  };
}

// tautan sementara untuk memutar rekaman di Arsip rapat
export async function recordingUrl(path) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}
