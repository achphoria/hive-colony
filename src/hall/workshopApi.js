// Data Workshop (#/workshop): paket kerja Queen Bea (hc_delegations) + tugas agent (hc_plan_tasks)
// ditampilkan sebagai tiket ala Agent Hub. Semua data dari proyek Supabase Hive Colony sendiri.
import { supabase } from '../lib/supabase';
import { resolveAgent } from '../data/hive';
import { sendToAgent } from './agentApi';

const TASK_COLS = 'id, title, who, col, progress, progress_note, result, result_at, result_files, created_at, updated_at';

// status satu tugas di panggung: pending · running · approval · revise (gagal) · done
export function stepState(t) {
  if (t.col === 'done') return 'done';
  if (t.col === 'failed') return 'revise';
  if (t.col === 'doing') return 'running';
  if (t.progress_note === 'Menunggu persetujuan') return 'approval';
  return 'pending';
}

// "Pixel: Buat poster promo" -> "Buat poster promo"
function shortTitle(title, agent) {
  const s = String(title || '');
  const i = s.indexOf(': ');
  return agent && i > 0 && s.slice(0, i).toLowerCase() === agent.nick.toLowerCase() ? s.slice(i + 2) : s;
}

function toStep(t) {
  const agent = resolveAgent(t.who);
  const st = stepState(t);
  const start = new Date(t.created_at).getTime();
  const end = t.result_at ? new Date(t.result_at).getTime() : st === 'done' || st === 'revise' ? new Date(t.updated_at).getTime() : Date.now();
  return {
    id: t.id,
    agentId: agent?.id || t.who,
    agent,
    task: shortTitle(t.title, agent),
    st,
    p: st === 'done' ? 1 : Math.min(1, Number(t.progress) || 0),
    note: t.progress_note || '',
    result: t.result || '',
    files: Array.isArray(t.result_files) ? t.result_files : [],
    min: Math.max(0, (end - start) / 60000),
  };
}

function toPackage(d, byId) {
  const steps = (d.task_ids || []).map((id) => byId.get(id)).filter(Boolean).map(toStep);
  const closed = !!d.reported_at || (steps.length > 0 && steps.every((s) => s.st === 'done' || s.st === 'revise'));
  const failed = steps.filter((s) => s.st === 'revise').length;
  return {
    id: d.id,
    threadId: d.thread_id,
    userId: d.user_id,
    request: d.request || 'Paket kerja',
    createdAt: d.created_at,
    reportedAt: d.reported_at,
    status: closed ? (failed && failed === steps.length ? 'failed' : 'done') : 'running',
    steps,
  };
}

// paket kerja yang boleh saya lihat (RLS: milik sendiri, atau semua untuk owner), terbaru dulu
export async function loadPackages(limit = 40) {
  const { data: ds, error } = await supabase
    .from('hc_delegations')
    .select('id, thread_id, user_id, request, task_ids, created_at, reported_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Paket kerja gagal dimuat.');
  const ids = [...new Set((ds || []).flatMap((d) => d.task_ids || []))];
  const byId = new Map();
  if (ids.length) {
    const { data: ts } = await supabase.from('hc_plan_tasks').select(TASK_COLS).in('id', ids);
    for (const t of ts || []) byId.set(t.id, t);
  }
  return (ds || []).map((d) => toPackage(d, byId));
}

// "Mulai paket": permintaan ke Queen Bea dengan arahan supaya langsung dipecah jadi tugas tim.
// Queen sendiri yang memutuskan agent mana; kalau dia hanya menjawab, tidak ada paket yang tercatat.
export function startPackage(text, threadId) {
  const message = `[Workshop] ${text}\n\nPecah permintaan ini menjadi tugas untuk agent yang paling tepat dan kirim sekarang sebagai satu paket kerja.`;
  return sendToAgent({ agent: 'ceo', message, threadId });
}

export function askQueen(text, threadId) {
  return sendToAgent({ agent: 'ceo', message: text, threadId });
}

// perubahan tugas agent (realtime) -> muat ulang paket; hc_delegations sendiri tidak di-publish, jadi juga dipolling
export function watchPackages(onChange) {
  const ch = supabase
    .channel('hc-workshop')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hc_plan_tasks' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}

const THREAD_KEY = 'hive.workshop.thread';
export function savedThread() {
  try {
    return localStorage.getItem(THREAD_KEY) || null;
  } catch {
    return null;
  }
}
export function saveThread(id) {
  try {
    if (id) localStorage.setItem(THREAD_KEY, id);
    else localStorage.removeItem(THREAD_KEY);
  } catch {
    /* penyimpanan browser tidak tersedia */
  }
}
