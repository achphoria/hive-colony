// Papan misi mode real: tugas yang sedang jalan, plus yang baru selesai (±10 menit).
// world.missions hanya memegang tugas yang masih dikerjakan; perayaan selesai tetap di finishReal.
import { resolveAgent, SEATS } from '../data/hive.js';

export const RECENT_DONE_MS = 10 * 60 * 1000;
export const BOARD_EMPTY_REAL =
  'Tidak ada tugas yang sedang dikerjakan. Yang baru selesai tetap tampil di sini sekitar 10 menit. Aktivitas sebelumnya ada di tab Log koloni.';

function stamp(raw) {
  if (!raw) return null;
  const n = Date.parse(raw);
  return Number.isNaN(n) ? null : n;
}

// Data sungguhan dari Supabase punya cap waktu. Data demo awal di store tidak, jadi tidak ikut tampil
// sebelum sinkron selesai.
export function isStoredTask(t) {
  return [t?.updatedAt, t?.updated_at, t?.createdAt, t?.created_at, t?.resultAt, t?.result_at].some(Boolean);
}

// Saat selesai, result_at dan updated_at diisi bersamaan. Kalau tugas dibuka lagi lalu selesai,
// updated_at yang baru yang dipakai supaya kartu tidak ikut cap waktu hasil yang lama.
export function taskFinishedAt(t) {
  const stamps = [t?.resultAt, t?.result_at, t?.updatedAt, t?.updated_at].map(stamp).filter((n) => n != null);
  if (!stamps.length) return null;
  return Math.max(...stamps);
}

function displayTitle(title, nick) {
  const s = String(title || '');
  const prefix = `${nick}: `;
  if (s.length >= prefix.length && s.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) return s.slice(prefix.length);
  return s;
}

// Saat berikutnya kartu selesai harus dihitung ulang. null = tidak ada yang menunggu hilang.
export function nextBoardTick(tasks, now = Date.now(), windowMs = RECENT_DONE_MS) {
  let next = null;
  for (const t of tasks || []) {
    if (!t || t.kind !== 'ai' || t.col !== 'done') continue;
    const at = taskFinishedAt(t);
    if (at == null) continue;
    const drop = at + windowMs;
    if (drop <= now) continue;
    if (next == null || drop < next) next = drop;
  }
  return next;
}

export function missionBoardItems(tasks, missions, now = Date.now(), windowMs = RECENT_DONE_MS) {
  const live = new Map();
  for (const m of missions || []) {
    if (m?.taskId) live.set(String(m.taskId), m);
  }
  const running = [];
  const finished = [];
  for (const t of tasks || []) {
    if (!t || t.kind !== 'ai' || !isStoredTask(t)) continue;
    const agent = resolveAgent(t.who);
    const roomId = agent && SEATS[agent.id]?.roomId;
    if (!agent || !roomId) continue;
    const id = String(t.id);
    const base = {
      id,
      taskId: id,
      title: displayTitle(t.title, agent.nick),
      dept: agent.dept,
      leadId: agent.id,
      collabId: null,
      roomId,
      real: true,
    };
    if (t.col === 'doing') {
      const m = live.get(id);
      const progress = m && Number.isFinite(m.progress) ? Math.min(1, Math.max(0, m.progress)) : 0.05;
      running.push({ ...base, phase: 'work', progress, finished: false });
    } else if (t.col === 'done') {
      const at = taskFinishedAt(t);
      if (at == null || now - at >= windowMs) continue;
      finished.push({ at, row: { ...base, phase: 'done', progress: 1, finished: true } });
    }
  }
  finished.sort((a, b) => b.at - a.at || String(a.row.id).localeCompare(String(b.row.id)));
  return [...running, ...finished.map((x) => x.row)];
}
