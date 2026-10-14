// Data Portal saya (#/saya): to-do pribadi, tugas papan tim untuk saya, percakapan & hasil saya,
// rapat yang saya ikuti, dan penanda video perkenalan untuk staff baru.
import { supabase } from '../lib/supabase';
import { useAuth } from '../sim/auth';

const uidNow = () => useAuth.getState().session?.user?.id;

// ---------- to-do pribadi ----------
export async function loadTodos() {
  const { data } = await supabase.from('hc_todos').select('id, title, col, sort, source, created_at, updated_at').order('sort').order('created_at');
  return data || [];
}
export async function addTodo(title, source = null) {
  const { data, error } = await supabase
    .from('hc_todos')
    .insert({ title: title.replace(/\s+/g, ' ').trim().slice(0, 200), source, sort: Date.now() % 2147483647 })
    .select('id, title, col, sort, source, created_at, updated_at')
    .single();
  if (error) throw new Error('To-do gagal ditambahkan.');
  return data;
}
export async function moveTodo(id, col) {
  const { error } = await supabase.from('hc_todos').update({ col }).eq('id', id);
  if (error) throw new Error('To-do gagal dipindah.');
}
export async function deleteTodo(id) {
  await supabase.from('hc_todos').delete().eq('id', id);
}

// tugas papan tim yang ditugaskan ke saya
export async function moveTeamTask(id, col) {
  const { error } = await supabase.from('hc_plan_tasks').update({ col, updated_by: uidNow(), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message.includes('row-level') ? 'Akun viewer tidak bisa memindah tugas.' : 'Tugas gagal dipindah.');
}

// ---------- percakapan & hasil saya ----------
export async function loadMyThreads(limit = 6) {
  const { data } = await supabase
    .from('hc_agent_threads')
    .select('id, agent_id, title, updated_at, pinned, task_id')
    .eq('user_id', uidNow())
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);
  return data || [];
}
export async function loadMyResults(limit = 5) {
  const { data } = await supabase.from('hc_agent_results').select('id, agent_id, title, content, created_at').eq('user_id', uidNow()).order('created_at', { ascending: false }).limit(limit);
  return data || [];
}

// ---------- rapat yang saya ikuti (peserta / pembuat) ----------
export async function loadMyMeetings(name, limit = 5) {
  const { data } = await supabase
    .from('hc_meetings')
    .select('id, title, started_at, ended_at, status, participants, mom, created_by')
    .order('started_at', { ascending: false })
    .limit(60);
  const me = uidNow();
  const n = (name || '').trim().toLowerCase();
  return (data || [])
    .filter((m) => m.created_by === me || (Array.isArray(m.participants) && m.participants.some((p) => String(p).trim().toLowerCase() === n)))
    .slice(0, limit);
}
// tindak lanjut notulen yang PIC-nya saya
export function myActionItems(meetings, name) {
  const n = (name || '').trim().toLowerCase();
  const first = n.split(/\s+/)[0];
  const out = [];
  for (const m of meetings) {
    for (const a of m.mom?.action_items || []) {
      const owner = String(a.owner || '').toLowerCase();
      if (owner && (owner.includes(n) || (first && owner.split(/[\s,/&]+/).includes(first)))) out.push({ ...a, meetingId: m.id, meetingTitle: m.title });
    }
  }
  return out;
}

// ---------- video perkenalan wajib untuk staff baru ----------
export async function markIntroSeen() {
  const { error } = await supabase.rpc('hc_mark_intro_seen');
  if (error) throw new Error('Gagal menyimpan. Coba lagi.');
  await useAuth.getState().loadAccount();
}
