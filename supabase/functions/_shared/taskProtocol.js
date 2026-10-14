// Aturan murni (tanpa Deno/Supabase) untuk janji chat, progres, dan hasil tugas.
// Dipakai Edge Function dan tes Node.

const PROMISE_RE =
  /akan saya kirim|begitu .{0,80}selesai|sedang saya (kerjakan|render|proses|buat)|nanti saya kirim|sedang (dirender|diproses)|hasil(nya)? (akan|nanti) (saya )?(kirim|kasih|berikan)/i;

export function stripMachineBlocks(text) {
  return String(text || '')
    .replace(/\n?\s*\[\[DELEGATE\]\][\s\S]*$/g, '')
    .replace(/\n?\s*\[\[COMMIT\]\]\s*\{[\s\S]*?\}\s*/g, '')
    .replace(/\n?\s*\[\[PROGRESS\]\]\s*\{[\s\S]*?\}\s*/g, '')
    .replace(/\n?\s*\[\[DONE\]\]\s*(\{[\s\S]*?\})?\s*/g, '')
    .trim();
}

export function parseCommit(text) {
  const m = String(text || '').match(/\[\[COMMIT\]\]\s*(\{[\s\S]*\})/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    const title = String(o.title || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!title) return null;
    return { title, detail: String(o.detail || '').trim().slice(0, 6000) };
  } catch {
    return null;
  }
}

function asFraction(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const frac = v > 1 ? v / 100 : v;
  return Math.min(0.99, Math.max(0, frac));
}

export function parseProgress(text) {
  const m = String(text || '').match(/\[\[PROGRESS\]\]\s*(\{[\s\S]*?\})/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    return { progress: asFraction(o.pct ?? o.progress), note: String(o.note || '').replace(/\s+/g, ' ').trim().slice(0, 300) };
  } catch {
    return null;
  }
}

export function parseDone(text) {
  const m = String(text || '').match(/\[\[DONE\]\]\s*(\{[\s\S]*?\})?/);
  if (!m) return null;
  let failed = false;
  let note = '';
  if (m[1]) {
    try {
      const o = JSON.parse(m[1]);
      failed = !!o.failed;
      note = String(o.note || '').trim().slice(0, 500);
    } catch {
      /* blok tanpa JSON tetap berarti selesai */
    }
  }
  return { failed, note };
}

export function isEmptyPromise(text) {
  const t = stripMachineBlocks(text);
  if (!t || t.length > 500) return false;
  if (/https?:\/\//i.test(t)) return false;
  return PROMISE_RE.test(t);
}

export function normalizeFiles(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const f of list) {
    if (!f || typeof f !== 'object') continue;
    const name = String(f.name || 'lampiran').slice(0, 120);
    const type = String(f.type || '').slice(0, 80);
    const size = Number(f.size) || 0;
    const path = typeof f.path === 'string' ? f.path.slice(0, 300) : '';
    let url = '';
    if (typeof f.url === 'string') {
      try {
        const u = new URL(f.url);
        if (u.protocol === 'https:') url = u.href.slice(0, 500);
      } catch {
        url = '';
      }
    }
    if (!path && !url) continue;
    out.push({ ...(path ? { path } : {}), ...(url ? { url } : {}), name, type, size });
    if (out.length >= 6) break;
  }
  return out;
}

export function hasRealOutput(text, files) {
  const list = normalizeFiles(files);
  if (list.length) return true;
  const t = stripMachineBlocks(text);
  if (!t) return false;
  if (isEmptyPromise(t)) return false;
  // tautan http mentah bukan hasil: tidak diambil server dan tidak ditampilkan sebagai gambar
  if (/^http:\/\/\S+$/i.test(t)) return false;
  return t.length >= 8;
}

// Balasan di thread tugas: progress (tetap jalan), result (selesai), atau failed.
export function classifyTaskReply(content, meta) {
  const files = normalizeFiles(meta?.files);
  const done = parseDone(content) || (meta?.kind === 'result' ? { failed: !!meta?.failed, note: '' } : null);
  if (done?.failed || meta?.kind === 'failed') {
    return { kind: 'failed', note: done?.note || stripMachineBlocks(content) || 'Tugas gagal.' };
  }
  if (done) {
    const text = stripMachineBlocks(content);
    if (!hasRealOutput(text, files)) return { kind: 'failed', note: done.note || 'Tugas ditutup tanpa hasil.' };
    return { kind: 'result', text, files };
  }
  const progress = parseProgress(content);
  if (meta?.kind === 'progress' || progress) {
    return {
      kind: 'progress',
      progress: progress?.progress ?? asFraction(meta?.progress),
      note: progress?.note || stripMachineBlocks(content).slice(0, 300),
    };
  }
  if (hasRealOutput(content, files)) return { kind: 'result', text: stripMachineBlocks(content), files };
  return { kind: 'progress', progress: null, note: stripMachineBlocks(content).slice(0, 300) };
}

export const IMAGE_URL_RE = /https:\/\/[^\s)\]"'<>]+\.(?:png|jpe?g|webp|gif|svg)(?:\?[^\s)\]"'<>]*)?/gi;

export function imageUrlsIn(text) {
  const found = String(text || '').match(IMAGE_URL_RE) || [];
  return [...new Set(found.map((u) => u.replace(/[.,]$/, '')))].slice(0, 6);
}
