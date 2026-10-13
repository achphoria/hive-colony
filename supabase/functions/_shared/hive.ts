// Logika bersama Edge Function queen-bea & agent-chat: alamat n8n, Grok Bot, pembuatan tugas agent,
// data koloni untuk Queen Bea, daftar tim agent, dan blok delegasi [[DELEGATE]].
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

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
// agent yang selalu dijawab Grok Bot (Queen Bea hanya kalau engine = 'grokbot')
export const GROK_AGENTS = ['cloud', 'workflow', 'network'];
export async function dispatchGrok(o: {
  agent: string;
  threadId: string;
  message: string;
  userName: string;
  messageId: number | null;
  history: { role: string; content: string }[];
  persona: string;
  context?: string;
}) {
  const key = o.agent.toUpperCase();
  const url = Deno.env.get(`GROKBOT_URL_${key}`);
  const token = Deno.env.get(`GROKBOT_KEY_${key}`);
  if (!url || !token) throw new Error('grokbot_not_configured');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      thread_id: o.threadId,
      agent_id: o.agent,
      message: o.message,
      user_name: o.userName,
      message_id: o.messageId,
      history: o.history, // pesan sebelumnya di thread: [{ role: 'user' | 'agent', content }]
      persona: o.persona,
      ...(o.context ? { context: o.context } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`grokbot_http_${r.status}`);
}

async function ownerId(a: Db) {
  const { data } = await a.from('hc_profiles').select('id').eq('role', 'owner').order('created_at').limit(1).maybeSingle();
  return data?.id ?? null;
}

// ---------- tugas agent: kartu papan rencana, dikerjakan n8n (balasan langsung) atau Grok Bot ----------
// Grok Bot: tugas dikirim lewat "thread tugas" (hc_agent_threads.task_id). Saat bot menulis balasan di
// thread itu, trigger database menyalinnya ke hc_plan_tasks.result dan menandai tugas selesai.
export async function startAgentTask(
  a: Db,
  o: { agent: string; nick: string; dept: string | null; title: string; detail: string; by: string | null; caller: Record<string, unknown>; activity: string },
) {
  const grok = GROK_AGENTS.includes(o.agent);
  const { data: t, error } = await a
    .from('hc_plan_tasks')
    .insert({ title: `${o.nick}: ${o.title}`.slice(0, 200), who: o.agent, kind: 'ai', col: grok ? 'doing' : 'todo', updated_by: o.by })
    .select('id')
    .single();
  if (error || !t) throw new Error('db_error');
  await a.from('hc_activity').insert({ kind: 'task', dept: o.dept, text: o.activity.slice(0, 280) });

  if (!grok) {
    background(
      callWorker(a, { agent: o.agent, title: o.title, detail: o.detail, task_id: t.id, caller: o.caller }, 110000)
        .then((r) => r.json())
        .then((d) => (d?.reply ? a.from('hc_plan_tasks').update({ result: String(d.reply).slice(0, 20000), result_at: new Date().toISOString() }).eq('id', t.id) : null))
        .catch((e) => console.error('task call', String(e))),
    );
    return t.id as string;
  }

  const userId = o.by || (await ownerId(a));
  const message = `TUGAS: ${o.title}\n\n${o.detail}`.slice(0, 8000);
  const { data: th } = await a
    .from('hc_agent_threads')
    .insert({ agent_id: o.agent, user_id: userId, title: `Tugas: ${o.title}`.slice(0, 120), task_id: t.id })
    .select('id')
    .single();
  if (!th) return t.id as string;
  const { data: msg } = await a
    .from('hc_agent_messages')
    .insert({ thread_id: th.id, role: 'user', content: message, meta: { task_id: t.id, caller: o.caller } })
    .select('id')
    .single();
  const { data: ag } = await a.from('hc_agent_prompts').select('system_prompt').eq('agent_id', o.agent).maybeSingle();
  const { data: prof } = userId ? await a.from('hc_profiles').select('name').eq('id', userId).maybeSingle() : { data: null };
  background(
    dispatchGrok({ agent: o.agent, threadId: th.id, message, userName: prof?.name || 'Hive Colony', messageId: msg?.id ?? null, history: [], persona: ag?.system_prompt || '' }).catch(
      async (e) => {
        console.error('grok task', String(e));
        await a.from('hc_plan_tasks').update({ col: 'todo', updated_at: new Date().toISOString() }).eq('id', t.id);
        await a
          .from('hc_agent_messages')
          .insert({ thread_id: th.id, role: 'system', content: `${o.nick} (Grok Bot) tidak bisa dihubungi, tugas belum dikerjakan.`, meta: { engine: 'grokbot', error: String(e).slice(0, 200) } });
      },
    ),
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
  return `TIM AGENT (agent_id · nama · divisi · peran):\n${agents.map((g) => `- ${g.agent_id} · ${g.nick} · ${g.dept} · ${roleOf(g)}${GROK_AGENTS.includes(g.agent_id) ? ' · (Grok Bot)' : ''}`).join('\n')}`;
}

const MAX_DELEGATE = 3;
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
export async function delegateTasks(a: Db, items: DelegateItem[], by: string) {
  const out: { agent: string; nick: string; title: string; task_id: string | null }[] = [];
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
      });
      out.push({ agent: it.agent.agent_id, nick: it.agent.nick, title: it.title, task_id: id });
    } catch (e) {
      console.error('delegate', it.agent.agent_id, String(e));
    }
  }
  return out;
}

// status server agent (n8n di PC kantor) dari pengecekan terakhir Edge Function agent-chat
async function agentStatus(a: Db) {
  const { data } = await a.from('hc_system_status').select('value, checked_at').eq('key', 'n8n').maybeSingle();
  const grok = 'Nimbus, Loop, dan Ping memakai Grok Bot, jadi tidak bergantung pada server ini.';
  if (!data) return `STATUS SERVER AGENT: belum pernah dicek. ${grok}`;
  const ageMin = Math.round((Date.now() - new Date(data.checked_at).getTime()) / 60000);
  const state = data.value?.online ? 'ONLINE (agent n8n bisa menerima tugas)' : 'OFFLINE (server agent di PC kantor tidak menjawab; tugas agent n8n tertunda)';
  return `STATUS SERVER AGENT: ${state}, dicek ${wib(data.checked_at)} WIB${ageMin > 10 ? ` (${ageMin} menit lalu, bisa sudah berubah)` : ''}. ${grok}`;
}

// data koloni dibaca dengan identitas staff (RLS), status server dengan service role
export async function colonyData(sb: Db, me: { name: string; role: string; primary_dept: string }, a: Db) {
  const [staff, approvals, tasks, activity, status] = await Promise.all([
    sb.from('hc_profiles').select('name, role, primary_dept').order('created_at').limit(50),
    sb.from('hc_approvals').select('title, requested_by, status, created_at').eq('status', 'pending').limit(20),
    sb.from('hc_plan_tasks').select('title, who, col').neq('col', 'done').limit(30),
    sb.from('hc_activity').select('text, created_at').order('created_at', { ascending: false }).limit(15),
    agentStatus(a),
  ]);
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
${list(tasks.data, (r) => `${r.title} · ${r.who} · ${r.col === 'doing' ? 'sedang jalan' : 'belum mulai'}`)}

Aktivitas terbaru:
${list(activity.data, (r) => `${wib(r.created_at)} · ${r.text}`)}`;
}

// petunjuk delegasi untuk Queen Bea mode Grok Bot (tanpa alat/tool: lewat blok teks di akhir jawaban)
export const GROK_DELEGATE_GUIDE = `CARA MENDELEGASIKAN (khusus mesin ini): kalau tugas perlu dikerjakan agent di TIM AGENT, tulis jawabanmu seperti biasa (sebutkan agent mana mendapat tugas apa), lalu di BARIS PALING AKHIR tambahkan blok persis seperti ini, tanpa teks lain sesudahnya:
[[DELEGATE]] [{"agent":"<agent_id>","title":"<judul singkat>","detail":"<instruksi jelas>"}]
Maksimal 3 tugas, hanya agent_id dari TIM AGENT (bukan ceo). Untuk obrolan biasa jangan tambahkan blok ini. Blok ini otomatis disembunyikan dari pengguna dan tugasnya dikirim sistem.`;
