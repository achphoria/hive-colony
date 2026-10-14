// Logika bersama Edge Function queen-bea & agent-chat: alamat n8n, Grok Bot, pembuatan tugas agent,
// data koloni untuk Queen Bea, daftar tim agent, dan blok delegasi [[DELEGATE]].
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { hasRealOutput, normalizeFiles } from './taskProtocol.js';

// deno-lint-ignore no-explicit-any
export type Db = any;
export type Agent = { agent_id: string; nick: string; dept: string; system_prompt: string };

export const newAdmin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

// kerja latar belakang setelah respons dikirim
export function background(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else p.catch(() => {});
}

export const ROLE = { owner: 'Owner', lead: 'Kepala divisi', staff: 'Staff', viewer: 'Viewer' } as Record<string, string>;
export const wib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

// ---------- n8n (PC kantor): alamat di Vault hive_n8n_url, secret di Vault hive_webhook_secret ----------
let n8nCache: { url: string; secret: string } | null = null;
export async function n8nConfig(a: Db) {
  if (n8nCache) return n8nCache;
  const [{ data: url }, { data: secret }] = await Promise.all([a.rpc('hive_n8n_url'), a.rpc('hive_webhook_secret')]);
  const s = Deno.env.get('HIVE_WEBHOOK_SECRET') || secret;
  if (typeof url !== 'string' || typeof s !== 'string' || !url || !s) throw new Error('n8n_not_configured');
  n8nCache = { url: url.replace(/\/+$/, ''), secret: s };
  return n8nCache;
}
export async function callN8n(a: Db, path: string, body: unknown, timeoutMs: number) {
  const { url, secret } = await n8nConfig(a);
  // secret lama N8N_AGENT_TASK_URL (kalau masih dipasang) menimpa alamat worker
  const target = path === '/webhook/hive/agent-task' && Deno.env.get('N8N_AGENT_TASK_URL') ? Deno.env.get('N8N_AGENT_TASK_URL')! : `${url}${path}`;
  return fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1', 'x-hive-secret': secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
export const callWorker = (a: Db, body: unknown, timeoutMs: number) => callN8n(a, '/webhook/hive/agent-task', body, timeoutMs);

// ---------- Grok Bot: GROKBOT_URL_<AGENT> & GROKBOT_KEY_<AGENT> di Edge Function Secrets ----------
// Agent di daftar ini dijawab Grok Bot hanya kalau kedua secret-nya terpasang.
// Kalau secret belum ada, chat & tugas jatuh ke n8n/Claude (bukan gagal).
// Queen Bea tidak ada di daftar ini: dia ke Grok Bot hanya kalau engine = 'grokbot'.
export const GROK_AGENTS = ['cloud', 'workflow', 'network', 'visual', 'ads'];

export function grokCredentials(agent: string, envGet: (name: string) => string | undefined = (n) => Deno.env.get(n)) {
  const id = agent.trim().toUpperCase();
  const url = (envGet(`GROKBOT_URL_${id}`) ?? '').trim();
  const token = (envGet(`GROKBOT_KEY_${id}`) ?? '').trim();
  return url && token ? { url, token } : null;
}

// 'grok' = webhook Grok Bot; 'claude' = n8n/Claude (queen-bea untuk ceo).
// Queen yang dipilih Grok Bot tetap mencoba Grok meski secret kosong (pilihan eksplisit, bukan fallback diam-diam).
export function routeAgent(agent: string, opts: { engine?: string; configured: boolean }): 'grok' | 'claude' {
  if (GROK_AGENTS.includes(agent)) return opts.configured ? 'grok' : 'claude';
  if (agent === 'ceo' && opts.engine === 'grokbot') return 'grok';
  return 'claude';
}

// Ditambahkan di setiap panggilan Grok (bukan di kolom persona), supaya skill panel tetap
// sumber persona/skill/pelajaran, dan bot tidak berjanji kerja latar dari chat biasa.
export const GROK_TASK_RULES = `ATURAN TUGAS (wajib):
- Jangan pernah berjanji akan mengirim hasil nanti, setelah render selesai, atau mengerjakan sesuatu di latar belakang dari jawaban chat biasa. Chat hanya untuk jawaban yang sudah selesai sekarang.
- Kalau pekerjaannya sungguhan dan butuh waktu (gambar, render, riset panjang, file), akhiri jawaban dengan satu blok ini dan jangan menulis seolah hasilnya sudah jadi:
[[COMMIT]] {"title":"<judul singkat>","detail":"<instruksi lengkap>"}
Sistem membuat kartu di papan misi lalu mengirim tugas itu kepadamu di thread terpisah. Kerjakan di thread itu, bukan di chat.
- Kalau pengguna yang harus memutuskan dulu, jangan mulai sendiri. Minta mereka menekan tombol ✅ Jadikan tugas.
- Di thread yang pesannya diawali TUGAS:, laporkan progres tanpa menyelesaikan tugas:
[[PROGRESS]] {"pct":40,"note":"apa yang sudah jadi"}
pct adalah 0-100. Ini tidak menutup tugas.
- Selesaikan hanya kalau ada hasil nyata (teks lengkap, atau file/URL gambar). Akhiri dengan [[DONE]] lalu hasilnya. Kalau gagal: [[DONE]] {"failed":true,"note":"alasan"}.
- Jangan mengirim [[DONE]] kosong atau yang hanya berisi janji.
- Kalau payload berisi objek task (id, callback_url, token), kamu juga boleh POST JSON ke callback_url: {"action":"task_update","task_id","token","status":"progress"|"done"|"failed","progress":0.4,"note":"...","result":"...","files":[{"url":"https://...","name":"poster.png","type":"image/png"}]}. status done tanpa result ditolak dan tugas menjadi gagal, bukan selesai.`;

export async function dispatchGrok(o: {
  agent: string;
  threadId: string;
  message: string;
  userName: string;
  messageId: number | null;
  history: { role: string; content: string }[];
  persona: string;
  context?: string;
  task?: { id: string; callback_url: string; token: string };
}) {
  const creds = grokCredentials(o.agent);
  if (!creds) throw new Error('grokbot_not_configured');
  const persona = o.agent === 'ceo' ? o.persona || '' : `${o.persona || ''}\n\n${GROK_TASK_RULES}`;
  const r = await fetch(creds.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      thread_id: o.threadId,
      agent_id: o.agent,
      message: o.message,
      user_name: o.userName,
      message_id: o.messageId,
      history: o.history, // pesan sebelumnya di thread: [{ role: 'user' | 'agent', content }]
      persona,
      ...(o.context ? { context: o.context } : {}),
      ...(o.task ? { task: o.task } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`grokbot_http_${r.status}`);
}

export const BUSY_MINUTES = 30;

export class AgentBusyError extends Error {
  taskTitle: string;
  constructor(taskTitle: string) {
    super('agent_busy');
    this.name = 'AgentBusyError';
    this.taskTitle = taskTitle;
  }
}

// Prompt yang benar-benar dipakai bot: hasil hc_agent_compile (persona + skill aktif + pelajaran aktif).
export async function compiledPrompt(a: Db, agentId: string) {
  const { data } = await a.from('hc_agent_prompts').select('system_prompt, persona').eq('agent_id', agentId).maybeSingle();
  return String(data?.system_prompt || data?.persona || '');
}

export async function releaseStaleTasks(a: Db) {
  const { error } = await a.rpc('hc_release_stale_agent_tasks', { p_minutes: BUSY_MINUTES });
  if (error) console.error('release stale', error.message);
}

export async function busyTask(a: Db, agent: string) {
  await releaseStaleTasks(a);
  const since = new Date(Date.now() - BUSY_MINUTES * 60 * 1000).toISOString();
  const { data } = await a
    .from('hc_plan_tasks')
    .select('id, title, created_by, progress, progress_note')
    .eq('who', agent)
    .eq('kind', 'ai')
    .eq('col', 'doing')
    .gt('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; title: string; created_by: string | null; progress: number | null; progress_note: string | null } | null;
}

type ResultFile = { path?: string; url?: string; name?: string; type?: string; size?: number };

async function posted(a: Db, threadId: string, taskId: string, kind: string) {
  const { data } = await a.from('hc_agent_messages').select('id').eq('thread_id', threadId).eq('meta->>task_id', taskId).eq('meta->>kind', kind).limit(1);
  return !!data?.length;
}

async function echoOutcome(
  a: Db,
  task: { id: string; title: string; who: string; source_thread_id?: string | null; created_by?: string | null },
  text: string,
  files: ResultFile[],
  col: 'done' | 'failed',
  skipThreadId?: string | null,
) {
  const kind = col === 'done' ? 'result' : 'failed';
  const { data: threads } = await a.from('hc_agent_threads').select('id').eq('task_id', task.id).limit(1);
  let taskThread = threads?.[0]?.id as string | undefined;
  if (!taskThread && task.created_by) {
    const { data: created } = await a
      .from('hc_agent_threads')
      .insert({ agent_id: task.who, user_id: task.created_by, title: `Hasil: ${task.title}`.slice(0, 120), task_id: task.id })
      .select('id')
      .single();
    taskThread = created?.id;
  }
  const targets = new Set<string>();
  if (taskThread && taskThread !== skipThreadId) targets.add(taskThread);
  if (task.source_thread_id && task.source_thread_id !== skipThreadId) {
    const { data: src } = await a.from('hc_agent_threads').select('agent_id').eq('id', task.source_thread_id).maybeSingle();
    // hasil masuk chat agent yang mengerjakan, bukan ringkasan Queen (itu lewat laporan paket)
    if (!src || src.agent_id === task.who) targets.add(task.source_thread_id);
  }
  const content = (col === 'done' ? text : `${task.title}: ${text}`).slice(0, 20000);
  for (const threadId of targets) {
    if (await posted(a, threadId, task.id, kind)) continue;
    await a.from('hc_agent_messages').insert({
      thread_id: threadId,
      role: col === 'done' ? 'agent' : 'system',
      content: content || 'Tugas diperbarui.',
      meta: { skip: true, kind, task_id: task.id, ...(files.length ? { files } : {}) },
    });
    await a.from('hc_agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
  }
}

// Selesai hanya kalau ada isi. Kosong/janji menjadi gagal dan kunci sibuk lepas.
export async function settleTask(a: Db, o: { taskId: string; outcome: 'done' | 'failed'; result: string; files?: unknown; sourceMessageId?: number | null }) {
  const { data: task } = await a
    .from('hc_plan_tasks')
    .select('id, title, who, col, result, result_files, source_thread_id, created_by')
    .eq('id', o.taskId)
    .maybeSingle();
  if (!task) return;
  let skipThread: string | null = null;
  if (o.sourceMessageId) {
    const { data: src } = await a.from('hc_agent_messages').select('thread_id').eq('id', o.sourceMessageId).maybeSingle();
    skipThread = src?.thread_id ?? null;
  }
  const files = normalizeFiles(o.files ?? []);
  const text = String(o.result || '').trim().slice(0, 20000);
  const real = o.outcome === 'done' && hasRealOutput(text, files);
  if (task.col === 'done' && hasRealOutput(String(task.result || ''), task.result_files) && !real) {
    await echoOutcome(a, task, String(task.result || ''), normalizeFiles(task.result_files), 'done', skipThread);
    return;
  }
  const col = real ? 'done' : 'failed';
  const stored = (real ? text : text || 'Tidak ada hasil. Tugas tidak ditandai selesai.').slice(0, 20000);
  if (!(task.col === col && String(task.result || '') === stored)) {
    await a
      .from('hc_plan_tasks')
      .update({
        col,
        result: stored,
        result_at: new Date().toISOString(),
        result_files: files,
        ...(col === 'done' ? { progress: 1 } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);
  }
  await echoOutcome(a, task, stored, files, col, skipThread);
}

export async function touchTaskProgress(a: Db, taskId: string, progress: number | null, note: string) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (progress != null && Number.isFinite(progress)) patch.progress = Math.min(0.99, Math.max(0, progress));
  if (note) patch.progress_note = note.slice(0, 300);
  await a.from('hc_plan_tasks').update(patch).eq('id', taskId).eq('col', 'doing');
}

async function callbackFor(a: Db, taskId: string) {
  const { data } = await a.from('hc_task_callbacks').select('token').eq('task_id', taskId).maybeSingle();
  const base = Deno.env.get('SUPABASE_URL') || '';
  if (!data?.token || !base) return null;
  return { id: taskId, callback_url: `${base}/functions/v1/agent-chat`, token: String(data.token) };
}

async function runWorker(a: Db, o: { agent: string; nick: string; title: string; detail: string; taskId: string; caller: Record<string, unknown> }) {
  try {
    const r = await callWorker(a, { agent: o.agent, title: o.title, detail: o.detail, task_id: o.taskId, caller: o.caller }, 110000);
    const d = await r.json().catch(() => null);
    if (r.status === 202 && d?.status === 'pending_approval') {
      await a.from('hc_plan_tasks').update({ col: 'todo', progress_note: 'Menunggu persetujuan', updated_at: new Date().toISOString() }).eq('id', o.taskId);
      return;
    }
    const reply = d?.reply ? String(d.reply) : '';
    if (!r.ok || !hasRealOutput(reply, [])) {
      await settleTask(a, { taskId: o.taskId, outcome: 'failed', result: reply.trim() || `${o.nick} tidak mengirim hasil. Tugas tidak ditandai selesai.` });
      return;
    }
    await settleTask(a, { taskId: o.taskId, outcome: 'done', result: reply });
  } catch (e) {
    console.error('task call', String(e));
    await settleTask(a, { taskId: o.taskId, outcome: 'failed', result: `${o.nick} gagal mengerjakan tugas. Coba lagi nanti.` });
  }
}

async function ownerId(a: Db) {
  const { data } = await a.from('hc_profiles').select('id').eq('role', 'owner').order('created_at').limit(1).maybeSingle();
  return data?.id ?? null;
}

// ---------- tugas agent: kartu papan rencana, dikerjakan n8n (balasan langsung) atau Grok Bot ----------
// Grok Bot: tugas dikirim lewat "thread tugas" (hc_agent_threads.task_id). Balasan bot di thread itu
// (atau callback task_update) mengisi hasil. Selesai hanya kalau ada isi; janji kosong menjadi gagal.
export async function startAgentTask(
  a: Db,
  o: {
    agent: string;
    nick: string;
    dept: string | null;
    title: string;
    detail: string;
    by: string | null;
    caller: Record<string, unknown>;
    activity: string;
    sourceThreadId?: string | null;
  },
) {
  const busy = await busyTask(a, o.agent);
  if (busy) throw new AgentBusyError(String(busy.title || o.title));
  const grok = routeAgent(o.agent, { configured: !!grokCredentials(o.agent) }) === 'grok';
  const { data: t, error } = await a
    .from('hc_plan_tasks')
    .insert({
      title: `${o.nick}: ${o.title}`.slice(0, 200),
      who: o.agent,
      kind: 'ai',
      col: 'doing',
      progress: 0.05,
      updated_by: o.by,
      created_by: o.by,
      ...(o.sourceThreadId ? { source_thread_id: o.sourceThreadId } : {}),
    })
    .select('id')
    .single();
  if (error || !t) throw new Error('db_error');
  await a.from('hc_task_callbacks').insert({ task_id: t.id });
  await a.from('hc_activity').insert({ kind: 'task', dept: o.dept, text: o.activity.slice(0, 280) });

  if (!grok) {
    background(runWorker(a, { agent: o.agent, nick: o.nick, title: o.title, detail: o.detail, taskId: t.id, caller: o.caller }));
    return t.id as string;
  }

  const userId = o.by || (await ownerId(a));
  const message = `TUGAS: ${o.title}\n\n${o.detail}\n\nKerjakan tugas ini sekarang. Laporkan progres dengan [[PROGRESS]] dan tutup dengan [[DONE]] hanya kalau hasilnya sudah ada.`.slice(0, 8000);
  const { data: th } = await a
    .from('hc_agent_threads')
    .insert({ agent_id: o.agent, user_id: userId, title: `Tugas: ${o.title}`.slice(0, 120), task_id: t.id })
    .select('id')
    .single();
  if (!th) return t.id as string;
  const { data: msg } = await a
    .from('hc_agent_messages')
    .insert({ thread_id: th.id, role: 'user', content: message, meta: { task_id: t.id, caller: o.caller, skip: true } })
    .select('id')
    .single();
  const persona = await compiledPrompt(a, o.agent);
  const { data: prof } = userId ? await a.from('hc_profiles').select('name').eq('id', userId).maybeSingle() : { data: null };
  const task = await callbackFor(a, t.id);
  background(
    dispatchGrok({
      agent: o.agent,
      threadId: th.id,
      message,
      userName: prof?.name || 'Hive Colony',
      messageId: msg?.id ?? null,
      history: [],
      persona,
      ...(task ? { task } : {}),
    }).catch(async (e) => {
      if (String(e).includes('grokbot_not_configured')) {
        console.warn('grok secrets missing, fallback n8n', o.agent);
        await runWorker(a, { agent: o.agent, nick: o.nick, title: o.title, detail: o.detail, taskId: t.id, caller: o.caller });
        return;
      }
      console.error('grok task', String(e));
      await settleTask(a, { taskId: t.id, outcome: 'failed', result: `${o.nick} (Grok Bot) tidak bisa dihubungi, tugas belum dikerjakan.` });
    }),
  );
  return t.id as string;
}

// ---------- konteks Queen Bea ----------
export async function loadAgents(a: Db): Promise<Agent[]> {
  const { data } = await a.from('hc_agent_prompts').select('agent_id, nick, dept, system_prompt').eq('active', true).order('dept');
  return (data ?? []) as Agent[];
}
const roleOf = (ag: Agent) => (ag.system_prompt.split(`Kamu adalah ${ag.nick}. `)[1] || ag.system_prompt).slice(0, 140);
export function teamBlock(agents: Agent[]) {
  if (!agents.length) return 'TIM AGENT: (tidak tersedia, jangan delegasi)';
  return `TIM AGENT (agent_id · nama · divisi · peran):\n${agents.map((g) => `- ${g.agent_id} · ${g.nick} · ${g.dept} · ${roleOf(g)}${routeAgent(g.agent_id, { configured: !!grokCredentials(g.agent_id) }) === 'grok' ? ' · (Grok Bot)' : ''}`).join('\n')}`;
}

export const MAX_DELEGATE = 5;
export type DelegateItem = { agent: Agent; title: string; detail: string };
// blok di akhir jawaban: [[DELEGATE]] [{"agent":"analyst","title":"…","detail":"…"}]
export function parseDelegation(text: string, agents: Agent[]) {
  const m = text.match(/\n?\s*\[\[DELEGATE\]\]\s*(\[[\s\S]*\])\s*$/);
  if (!m) return { reply: text.replace(/\[\[DELEGATE\]\][\s\S]*$/, '').trim(), items: [] as DelegateItem[] };
  const byId = new Map(agents.map((g) => [g.agent_id, g]));
  let arr: unknown[] = [];
  try {
    arr = JSON.parse(m[1]);
  } catch {
    arr = [];
  }
  const items: DelegateItem[] = [];
  for (const it of Array.isArray(arr) ? arr : []) {
    const r = it as { agent?: string; title?: string; detail?: string };
    const key = String(r?.agent ?? '').trim().toLowerCase();
    const ag = byId.get(key) || agents.find((g) => g.nick.toLowerCase() === key);
    const title = String(r?.title ?? '').trim().slice(0, 200);
    if (!ag || !title || items.some((x) => x.agent.agent_id === ag.agent_id && x.title === title)) continue;
    items.push({ agent: ag, title, detail: String(r?.detail ?? '').slice(0, 2000) });
    if (items.length >= MAX_DELEGATE) break;
  }
  return { reply: text.slice(0, m.index).trim(), items };
}

// kirim tugas hasil delegasi Queen Bea ke agent masing-masing
export function busyNote(items: { nick: string; busy?: string }[]) {
  const busy = items.filter((d) => d.busy);
  if (!busy.length) return '';
  return `\n\nBelum terkirim karena sedang bekerja: ${busy.map((d) => `${d.nick} sedang mengerjakan “${String(d.busy).replace(/^[^:]+:\s*/, '')}”`).join('; ')}.`;
}

export async function delegateTasks(a: Db, items: DelegateItem[], by: string, sourceThreadId?: string | null) {
  const out: { agent: string; nick: string; title: string; task_id: string | null; busy?: string }[] = [];
  for (const it of items) {
    try {
      const id = await startAgentTask(a, {
        agent: it.agent.agent_id,
        nick: it.agent.nick,
        dept: it.agent.dept,
        title: it.title,
        detail: it.detail,
        by,
        caller: { type: 'queen-bea', id: by },
        activity: `Queen Bea memberi tugas ke ${it.agent.nick}: ${it.title}`,
        sourceThreadId,
      });
      out.push({ agent: it.agent.agent_id, nick: it.agent.nick, title: it.title, task_id: id });
    } catch (e) {
      if (e instanceof AgentBusyError) out.push({ agent: it.agent.agent_id, nick: it.agent.nick, title: it.title, task_id: null, busy: e.taskTitle });
      else console.error('delegate', it.agent.agent_id, String(e));
    }
  }
  return out;
}

// ---------- paket kerja Queen: dicatat per percakapan, laporan otomatis saat semua selesai ----------
// Trigger hc_plan_tasks_delegation_done memanggil agent-chat (queen_report) begitu semua tugas paket
// punya hasil. Agent yang sangat cepat bisa selesai sebelum paket tercatat, jadi dicek sekali di sini.
export async function requestReport(a: Db, delegationId: string) {
  const { secret } = await n8nConfig(a);
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hive-secret': secret },
    body: JSON.stringify({ action: 'queen_report', delegation_id: delegationId }),
    signal: AbortSignal.timeout(8000),
  }).catch((e) => console.error('report request', String(e)));
}
export async function recordDelegation(a: Db, o: { threadId: string; userId: string; request: string; taskIds: (string | null)[] }) {
  const taskIds = o.taskIds.filter(Boolean) as string[];
  if (!o.threadId || !taskIds.length) return null;
  const { data } = await a
    .from('hc_delegations')
    .insert({ thread_id: o.threadId, user_id: o.userId, request: String(o.request || '').slice(0, 2000), task_ids: taskIds })
    .select('id')
    .single();
  if (!data) return null;
  const { data: rows } = await a.from('hc_plan_tasks').select('col, result').in('id', taskIds);
  if (rows && rows.length === taskIds.length && rows.every((r: { col: string; result: string | null }) => (r.col === 'done' || r.col === 'failed') && String(r.result || '').trim())) await requestReport(a, data.id);
  return data.id as string;
}

// status server agent (n8n di PC kantor) dari pengecekan terakhir Edge Function agent-chat
async function agentStatus(a: Db) {
  const { data } = await a.from('hc_system_status').select('value, checked_at').eq('key', 'n8n').maybeSingle();
  const grok = 'Nimbus, Loop, Ping, Pixel, dan Spark memakai Grok Bot bila secret botnya terpasang, jadi tidak bergantung pada server ini. Tanpa secret, agent itu tetap lewat n8n.';
  if (!data) return `STATUS SERVER AGENT: belum pernah dicek. ${grok}`;
  const ageMin = Math.round((Date.now() - new Date(data.checked_at).getTime()) / 60000);
  const state = data.value?.online ? 'ONLINE (agent n8n bisa menerima tugas)' : 'OFFLINE (server agent di PC kantor tidak menjawab; tugas agent n8n tertunda)';
  return `STATUS SERVER AGENT: ${state}, dicek ${wib(data.checked_at)} WIB${ageMin > 10 ? ` (${ageMin} menit lalu, bisa sudah berubah)` : ''}. ${grok}`;
}

const RESULT_DAYS = 2; // hasil tugas agent yang ikut dibaca Queen
const RESULT_MAX = 8;
const RESULT_CHARS = 900;

// data koloni dibaca dengan identitas staff (RLS), status server dengan service role.
// uid (opsional) = staff yang sedang bicara, supaya tugas yang dia minta ditandai.
export async function colonyData(sb: Db, me: { name: string; role: string; primary_dept: string }, a: Db, uid?: string) {
  const since = new Date(Date.now() - RESULT_DAYS * 86400e3).toISOString();
  const [staff, approvals, tasks, done, activity, status] = await Promise.all([
    sb.from('hc_profiles').select('name, role, primary_dept').order('created_at').limit(50),
    sb.from('hc_approvals').select('title, requested_by, status, created_at').eq('status', 'pending').limit(20),
    sb.from('hc_plan_tasks').select('title, who, col, created_by').neq('col', 'done').limit(30),
    sb
      .from('hc_plan_tasks')
      .select('title, who, kind, result, result_at, created_by')
      .eq('kind', 'ai')
      .not('result', 'is', null)
      .gte('result_at', since)
      .order('result_at', { ascending: false })
      .limit(RESULT_MAX),
    sb.from('hc_activity').select('text, created_at').order('created_at', { ascending: false }).limit(15),
    agentStatus(a),
  ]);
  const mine = (r: { created_by?: string }) => (uid && r.created_by === uid ? ' · diminta pengguna ini' : '');
  const results = (done.data ?? []).length
    ? (done.data ?? [])
        .map((r: { title: string; who: string; result: string; result_at: string; created_by?: string }) => {
          const body = String(r.result).replace(/\s+/g, ' ').trim();
          return `- ${r.title} · ${r.who} · selesai ${wib(r.result_at)} WIB${mine(r)}\n  Hasil: ${body.slice(0, RESULT_CHARS)}${body.length > RESULT_CHARS ? '… (terpotong; hasil lengkap ada di panel Tugas agent itu & Portal saya)' : ''}`;
        })
        .join('\n')
    : '- (belum ada hasil dalam 2 hari terakhir)';
  // deno-lint-ignore no-explicit-any
  const list = (rows: unknown[] | null, fmt: (r: any) => string) => (rows && rows.length ? rows.map((r) => `- ${fmt(r)}`).join('\n') : '- (kosong)');
  const now = wib(new Date().toISOString());
  return `DATA KOLONI (diambil dari database saat ini, ${now} WIB)
Yang sedang bicara denganmu: ${me.name} (${ROLE[me.role] || me.role}, divisi ${me.primary_dept}).
${status}

Staff manusia terdaftar:
${list(staff.data, (r) => `${r.name} · ${ROLE[r.role] || r.role} · ${r.primary_dept}`)}

Persetujuan yang menunggu:
${list(approvals.data, (r) => `${r.title} (diajukan ${r.requested_by})`)}

Tugas papan rencana yang belum selesai:
${list(tasks.data, (r) => `${r.title} · ${r.who} · ${r.col === 'doing' ? 'sedang jalan' : 'belum mulai / menunggu'}${mine(r)}`)}

HASIL TUGAS AGENT TERBARU (${RESULT_DAYS} hari terakhir, terbaru di atas):
${results}

Aktivitas terbaru:
${list(activity.data, (r) => `${wib(r.created_at)} · ${r.text}`)}`;
}

// petunjuk delegasi untuk Queen Bea mode Grok Bot (tanpa alat/tool: lewat blok teks di akhir jawaban)
export const GROK_DELEGATE_GUIDE = `CARA MENDELEGASIKAN (khusus mesin ini): kalau tugas perlu dikerjakan agent di TIM AGENT, tulis jawabanmu seperti biasa (sebutkan agent mana mendapat tugas apa), lalu di BARIS PALING AKHIR tambahkan blok persis seperti ini, tanpa teks lain sesudahnya:
[[DELEGATE]] [{"agent":"<agent_id>","title":"<judul singkat>","detail":"<instruksi jelas>"}]
Maksimal 5 tugas, hanya agent_id dari TIM AGENT (bukan ceo). Untuk obrolan biasa jangan tambahkan blok ini. Blok ini otomatis disembunyikan dari pengguna dan tugasnya dikirim sistem.`;
