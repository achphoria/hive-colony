// Data Ruang Kerja Agent: kesehatan server agent (n8n di PC kantor), akses saya ke tiap agent,
// riwayat percakapan, dan kirim pesan lewat Edge Function agent-chat.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuth } from '../sim/auth';

const HEALTH_MS = 2 * 60 * 1000; // server mencache hasil 2 menit, jadi polling tidak membebani PC

// online: null (belum dicek) | true | false
export const useAgentNet = create(() => ({ online: null, checkedAt: null }));
// levels: { agent_id: 'use' | 'train' }; owner = akses penuh ke semua agent
export const useAgentAccess = create(() => ({ loaded: false, owner: false, levels: {} }));

let healthTimer = null;
export async function checkHealth() {
  if (!useAuth.getState().account || document.hidden) return;
  const { data, error } = await supabase.functions.invoke('agent-chat', { body: { action: 'health' } });
  if (error || !data) return;
  useAgentNet.setState({ online: !!data.online, checkedAt: data.checked_at || null });
}

export async function loadAccess() {
  const acc = useAuth.getState().account;
  const uid = useAuth.getState().session?.user?.id;
  if (!acc || !uid) {
    useAgentAccess.setState({ loaded: true, owner: false, levels: {} });
    return;
  }
  if (acc.role === 'owner') {
    useAgentAccess.setState({ loaded: true, owner: true, levels: {} });
    return;
  }
  const { data } = await supabase.from('hc_agent_access').select('agent_id, level').eq('user_id', uid);
  useAgentAccess.setState({ loaded: true, owner: false, levels: Object.fromEntries((data || []).map((r) => [r.agent_id, r.level])) });
}

export function startAgentWatch() {
  stopAgentWatch();
  checkHealth();
  loadAccess();
  loadScores();
  healthTimer = setInterval(checkHealth, HEALTH_MS);
  document.addEventListener('visibilitychange', checkHealth);
}

export function stopAgentWatch() {
  clearInterval(healthTimer);
  healthTimer = null;
  document.removeEventListener('visibilitychange', checkHealth);
  useAgentNet.setState({ online: null, checkedAt: null });
  useAgentAccess.setState({ loaded: false, owner: false, levels: {} });
  useAgentScores.setState({}, true);
}

// tingkat akses saya: 'owner' | 'train' | 'use' | null
export function levelFor(state, agentId) {
  if (state.owner) return 'owner';
  return state.levels[agentId] || null;
}

const ERR = {
  not_logged_in: 'Sesi login habis. Silakan login ulang.',
  not_hive_staff: 'Akun ini belum terdaftar sebagai staff Hive Colony.',
  no_access: 'Kamu belum punya akses ke agent ini. Minta owner mengaturnya di halaman Akses agent.',
  unknown_agent: 'Agent ini belum aktif.',
  empty_message: 'Tulis pesan dulu.',
  viewer: 'Akun viewer tidak bisa membuat tugas.',
};

async function invoke(body, fallback) {
  const { data, error } = await supabase.functions.invoke('agent-chat', { body });
  if (error) {
    let res = {};
    try {
      res = await error.context.json();
    } catch {
      /* bukan JSON */
    }
    if (res.error === 'daily_limit') throw new Error(`Batas pesan harian kamu sudah habis (${res.used}/${res.limit}). Coba lagi besok, atau minta owner menaikkan batas.`);
    throw new Error(ERR[res.error] || fallback);
  }
  return data;
}

// kirim pesan (+ lampiran yang sudah diunggah); hasil: { thread_id, reply, status, meta }
// engine ('claude' | 'grokbot') hanya dipakai untuk Queen Bea; status 'pending' = balasan Grok Bot menyusul
export function sendToAgent({ agent, message, threadId, files, engine }) {
  return invoke(
    { action: 'send', agent, message, thread_id: threadId || undefined, files: files?.length ? files : undefined, engine: agent === 'ceo' ? engine : undefined },
    'Pesan gagal dikirim. Coba lagi.',
  );
}

// Jadikan tugas untuk agent: kartu papan rencana yang langsung dikerjakan agent lewat n8n
export function createAgentTask({ agent, title, detail }) {
  return invoke({ action: 'task', agent, title, detail }, 'Tugas gagal dibuat. Coba lagi.');
}

// Jadikan tugas untuk diri sendiri (tugas manusia di papan rencana)
export async function createHumanTask(title) {
  const acc = useAuth.getState().account;
  const uid = useAuth.getState().session?.user?.id;
  const { error } = await supabase.from('hc_plan_tasks').insert({ title: title.slice(0, 200), who: acc.name, kind: 'human', col: 'todo', updated_by: uid, assignee: uid });
  if (error) throw new Error(error.message.includes('row-level') ? 'Akun viewer tidak bisa membuat tugas.' : 'Tugas gagal dibuat.');
  await supabase.from('hc_activity').insert({ kind: 'task', dept: acc.primary_dept || null, text: `${acc.name} menambah tugas: ${title.slice(0, 120)}` });
}

// ---------- lampiran (bucket privat hc-agent-files, folder milik sendiri) ----------
export const FILE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.md,.json';
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json' };
export const MAX_FILES = 3;
export const MAX_FILE_MB = 10;
export function fileProblem(f) {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!MIME[ext]) return `${f.name}: jenis file belum didukung (pakai gambar, PDF, TXT, CSV, MD, atau JSON).`;
  if (f.size > MAX_FILE_MB * 1024 * 1024) return `${f.name}: lebih dari ${MAX_FILE_MB} MB.`;
  return '';
}
export async function uploadFiles(list) {
  const uid = useAuth.getState().session?.user?.id;
  const out = [];
  for (const f of list) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const safe = f.name.replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
    const { error } = await supabase.storage.from('hc-agent-files').upload(path, f, { contentType: MIME[ext], upsert: false });
    if (error) throw new Error(`${f.name} gagal diunggah.`);
    out.push({ path, name: f.name, type: MIME[ext], size: f.size });
  }
  return out;
}
export async function openFile(path) {
  const { data } = await supabase.storage.from('hc-agent-files').createSignedUrl(path, 300);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
}

// ---------- hasil tersimpan ----------
export async function loadResults(agentId) {
  const { data } = await supabase.from('hc_agent_results').select('id, title, content, user_id, created_at').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(30);
  return data || [];
}
export async function saveResult({ agent, messageId, title, content }) {
  const { error } = await supabase.from('hc_agent_results').insert({ agent_id: agent, message_id: typeof messageId === 'number' ? messageId : null, title: title.slice(0, 200), content: content.slice(0, 20000) });
  if (error) throw new Error('Hasil gagal disimpan.');
}
export async function deleteResult(id) {
  await supabase.from('hc_agent_results').delete().eq('id', id);
}

// ---------- latih agent: penilaian, skill & pelajaran, persona, skor ----------
// skor skill nyata per agent (30 hari): { [agent_id]: { up, down, score } }
export const useAgentScores = create(() => ({}));
export async function loadScores() {
  const { data } = await supabase.rpc('hc_agent_scores');
  useAgentScores.setState(Object.fromEntries((data || []).map((r) => [r.agent_id, { up: r.up, down: r.down, score: r.score }])), true);
}

// penilaian saya untuk pesan-pesan di satu percakapan: { [message_id]: { rating, note } }
export async function loadMyFeedback(messageIds) {
  const uid = useAuth.getState().session?.user?.id;
  const ids = messageIds.filter((x) => typeof x === 'number');
  if (!ids.length || !uid) return {};
  const { data } = await supabase.from('hc_agent_feedback').select('message_id, rating, note').eq('user_id', uid).in('message_id', ids);
  return Object.fromEntries((data || []).map((r) => [r.message_id, { rating: r.rating, note: r.note }]));
}
export async function rateMessage({ agent, messageId, rating, note }) {
  const uid = useAuth.getState().session?.user?.id;
  const { error } = await supabase
    .from('hc_agent_feedback')
    .upsert({ message_id: messageId, agent_id: agent, user_id: uid, rating, note: note?.trim() ? note.trim().slice(0, 1000) : null, status: 'open' }, { onConflict: 'message_id,user_id' });
  if (error) throw new Error('Penilaian gagal disimpan.');
  loadScores();
}
// masukan staff untuk Pelatih/owner: 👎 atau yang punya catatan, belum diproses
export async function loadFeedbackQueue(agent) {
  const { data } = await supabase
    .from('hc_agent_feedback')
    .select('id, user_id, rating, note, ask_excerpt, reply_excerpt, created_at')
    .eq('agent_id', agent)
    .eq('status', 'open')
    .or('rating.eq.-1,note.not.is.null')
    .order('created_at', { ascending: false })
    .limit(30);
  return data || [];
}
export async function setFeedbackStatus(id, status) {
  await supabase.from('hc_agent_feedback').update({ status }).eq('id', id);
}

export async function loadSkills(agent) {
  const { data } = await supabase.from('hc_agent_skills').select('id, kind, name, instruction, active, created_at').eq('agent_id', agent).order('created_at');
  return data || [];
}
export async function saveSkill(agent, s) {
  const row = { kind: s.kind || 'skill', name: s.name.trim().slice(0, 80), instruction: s.instruction.trim().slice(0, 1500), active: s.active ?? true };
  const q = s.id ? supabase.from('hc_agent_skills').update(row).eq('id', s.id) : supabase.from('hc_agent_skills').insert({ ...row, agent_id: agent, source_feedback: s.source_feedback || null });
  const { error } = await q;
  if (error) throw new Error(error.message.includes('row-level') ? 'Hanya owner atau Pelatih agent ini yang bisa mengubah skill.' : 'Skill gagal disimpan.');
}
export async function deleteSkill(id) {
  await supabase.from('hc_agent_skills').delete().eq('id', id);
}
export async function loadPersona(agent) {
  const { data } = await supabase.from('hc_agent_prompts').select('persona, system_prompt').eq('agent_id', agent).maybeSingle();
  return data?.persona || data?.system_prompt || '';
}
export async function savePersona(agent, text) {
  const { error } = await supabase.rpc('hc_agent_set_persona', { p_agent: agent, p_persona: text });
  if (error) throw new Error(error.message.includes('persona_length') ? 'Persona minimal 50 karakter.' : 'Persona gagal disimpan.');
}

// ---------- tugas rutin ----------
export async function loadRoutines(agent) {
  const { data } = await supabase
    .from('hc_agent_routines')
    .select('id, title, instruction, kind, dow, dom, at_time, active, last_run_at, next_run_at, last_task_id')
    .eq('agent_id', agent)
    .order('created_at');
  return data || [];
}
export async function saveRoutine(agent, r) {
  const row = {
    title: r.title.trim().slice(0, 120),
    instruction: r.instruction.trim().slice(0, 3000),
    kind: r.kind,
    dow: r.kind === 'weekly' ? Number(r.dow) : null,
    dom: r.kind === 'monthly' ? Number(r.dom) : null,
    at_time: r.at_time,
    active: r.active ?? true,
  };
  const q = r.id ? supabase.from('hc_agent_routines').update(row).eq('id', r.id) : supabase.from('hc_agent_routines').insert({ ...row, agent_id: agent });
  const { error } = await q;
  if (error) throw new Error(error.message.includes('row-level') ? 'Hanya owner atau Pelatih agent ini yang bisa mengatur tugas rutin.' : 'Tugas rutin gagal disimpan.');
}
export async function deleteRoutine(id) {
  await supabase.from('hc_agent_routines').delete().eq('id', id);
}
export function runRoutineNow(id) {
  return invoke({ action: 'routine_run', routine_id: id }, 'Tugas rutin gagal dijalankan.');
}

// pesan baru di percakapan (mis. jawaban agent setelah approval disetujui)
export function watchThread(threadId, onChange) {
  const ch = supabase
    .channel(`aw-thread-${threadId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hc_agent_messages', filter: `thread_id=eq.${threadId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}

export async function loadThreads(agentId) {
  const { data } = await supabase
    .from('hc_agent_threads')
    .select('id, title, user_id, updated_at, pinned, task_id')
    .eq('agent_id', agentId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(60);
  return data || [];
}

// ganti judul / sematkan percakapan milik sendiri
export async function updateThread(id, patch) {
  const row = {};
  if (typeof patch.title === 'string') row.title = patch.title.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Percakapan';
  if (typeof patch.pinned === 'boolean') row.pinned = patch.pinned;
  const { error } = await supabase.from('hc_agent_threads').update(row).eq('id', id);
  if (error) throw new Error('Percakapan gagal diubah.');
}

// cari di semua percakapan yang boleh saya lihat (judul & isi pesan)
export async function searchConversations(query) {
  const q = query.replace(/[%_*,()\\]/g, ' ').trim();
  if (q.length < 2) return [];
  const [byMsg, byTitle] = await Promise.all([
    supabase
      .from('hc_agent_messages')
      .select('id, thread_id, content, created_at, hc_agent_threads!inner(id, agent_id, title, user_id)')
      .ilike('content', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase.from('hc_agent_threads').select('id, agent_id, title, user_id, updated_at').ilike('title', `%${q}%`).order('updated_at', { ascending: false }).limit(20),
  ]);
  const out = new Map();
  for (const t of byTitle.data || []) out.set(t.id, { threadId: t.id, agent: t.agent_id, title: t.title, userId: t.user_id, snippet: '', at: t.updated_at });
  for (const m of byMsg.data || []) {
    const t = m.hc_agent_threads;
    if (out.has(t.id) && out.get(t.id).snippet) continue;
    const i = m.content.toLowerCase().indexOf(q.toLowerCase());
    const snippet = `${i > 40 ? '…' : ''}${m.content.slice(Math.max(0, i - 40), i + q.length + 60).replace(/\s+/g, ' ')}…`;
    out.set(t.id, { threadId: t.id, agent: t.agent_id, title: t.title, userId: t.user_id, snippet, at: m.created_at });
  }
  return [...out.values()].slice(0, 30);
}

// ---------- kuota & statistik ----------
export function loadUsage() {
  return invoke({ action: 'usage' }, 'Kuota gagal dimuat.').catch(() => null);
}
export async function loadStats(days) {
  const { data, error } = await supabase.rpc('hc_agent_stats', { p_days: days });
  if (error) throw new Error(error.message.includes('owner_only') ? 'Hanya owner yang bisa melihat statistik.' : 'Statistik gagal dimuat.');
  return data;
}
export async function setDailyLimit(n) {
  const { data, error } = await supabase.rpc('hc_set_limits', { p_daily: n });
  if (error) throw new Error('Batas gagal disimpan.');
  return data;
}

// agent yang dijawab Grok Bot (bukan n8n): status online tidak bergantung server PC kantor
export const GROK_AGENTS = ['cloud', 'workflow', 'network'];

export async function loadMessages(threadId) {
  const { data } = await supabase
    .from('hc_agent_messages')
    .select('id, role, content, meta, created_at')
    .eq('thread_id', threadId)
    .order('created_at')
    .limit(200);
  return data || [];
}

export async function deleteThread(threadId) {
  await supabase.from('hc_agent_threads').delete().eq('id', threadId);
}
