// Edge Function: queen-bea
// Queen Bea (Chief Executive Hive Colony) dijawab oleh Claude. Hanya untuk staff yang login.
// Kunci API dibaca dari Supabase Edge Function Secrets (ANTHROPIC_API_KEY), tidak pernah ke browser.
//   POST { action: 'status' }                        -> { configured, model }
//   POST { mode: 'chat' | 'meeting', messages, transcript?, attachments? } -> { reply }
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { QUEEN_PERSONA } from '../_shared/queenPersona.ts';

const MODEL = 'claude-haiku-5-5';
const MAX_TURNS = 12; // riwayat chat yang dikirim ke Claude
const MAX_CHARS = 2000; // per pesan
const MAX_TX_LINES = 40; // baris transkrip meeting
const MAX_ATTACH = 60000; // karakter isi lampiran

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PERSONA = QUEEN_PERSONA;

// pencarian web (alat server Claude): maks. 3 pencarian per pertanyaan, lokasi Indonesia
const WEB_SEARCH = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 3,
  user_location: { type: 'approximate', country: 'ID', timezone: 'Asia/Jakarta' },
};
const DELEGATE_TOOL = {
  name: 'delegate_tasks',
  description: 'Kirim tugas ke agent di TIM AGENT. Maksimal 3 tugas. Tugas muncul di papan rencana dan dikerjakan agent secara otomatis.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array', maxItems: 3,
        items: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'agent_id dari TIM AGENT, misalnya analyst' },
            title: { type: 'string', description: 'judul tugas singkat' },
            detail: { type: 'string', description: 'instruksi jelas untuk agent' },
          },
          required: ['agent', 'title', 'detail'],
        },
      },
    },
    required: ['tasks'],
  },
};
const MAX_CONTINUE = 3; // lanjutan saat stop_reason pause_turn

const ROLE = { owner: 'Owner', lead: 'Kepala divisi', staff: 'Staff', viewer: 'Viewer' } as Record<string, string>;
const wib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

type Sb = ReturnType<typeof createClient>;

// alamat n8n: secret N8N_AGENT_TASK_URL kalau ada, selain itu dari Vault (hive_n8n_url) supaya cukup diubah di satu tempat
let cachedTaskUrl: string | null = Deno.env.get('N8N_AGENT_TASK_URL') || null;
async function taskUrl(a: any): Promise<string> {
  if (cachedTaskUrl) return cachedTaskUrl;
  const { data } = await a.rpc('hive_n8n_url');
  const base = typeof data === 'string' && data ? data : 'https://sliceable-mousiness-exorcist.ngrok-free.dev';
  return (cachedTaskUrl = `${base.replace(/\/+$/, '')}/webhook/hive/agent-task`);
}
const MAX_DELEGATE = 3;
type Agent = { agent_id: string; nick: string; dept: string; system_prompt: string };
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
let cachedSecret: string | null = null;
async function hiveSecret(a: any): Promise<string | null> {
  if (cachedSecret) return cachedSecret;
  const env = Deno.env.get('HIVE_WEBHOOK_SECRET');
  if (env) return (cachedSecret = env);
  const { data } = await a.rpc('hive_webhook_secret');
  return (cachedSecret = typeof data === 'string' && data ? data : null);
}
async function loadAgents(a: any): Promise<Agent[]> {
  const { data } = await a.from('hc_agent_prompts').select('agent_id, nick, dept, system_prompt').eq('active', true).order('dept');
  return (data ?? []) as Agent[];
}
const roleOf = (ag: Agent) => (ag.system_prompt.split(`Kamu adalah ${ag.nick}. `)[1] || ag.system_prompt).slice(0, 140);
function teamBlock(agents: Agent[]) {
  if (!agents.length) return 'TIM AGENT: (tidak tersedia, jangan delegasi)';
  return `TIM AGENT (agent_id · nama · divisi · peran):\n${agents.map((g) => `- ${g.agent_id} · ${g.nick} · ${g.dept} · ${roleOf(g)}`).join('\n')}`;
}
function parseDelegation(text: string, agents: Agent[]) {
  const m = text.match(/\n?\s*\[\[DELEGATE\]\]\s*(\[[\s\S]*\])\s*$/);
  if (!m) return { reply: text.replace(/\[\[DELEGATE\]\][\s\S]*$/, '').trim(), items: [] as { agent: Agent; title: string; detail: string }[] };
  const byId = new Map(agents.map((g) => [g.agent_id, g]));
  let arr: unknown[] = [];
  try { arr = JSON.parse(m[1]); } catch { arr = []; }
  const items: { agent: Agent; title: string; detail: string }[] = [];
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
async function delegate(a: any, items: { agent: Agent; title: string; detail: string }[], by: string) {
  const out: { agent: string; nick: string; title: string; task_id: string | null }[] = [];
  const secret = await hiveSecret(a);
  const url = await taskUrl(a);
  const calls: Promise<unknown>[] = [];
  for (const it of items) {
    const { data, error } = await a.from('hc_plan_tasks').insert({ title: `${it.agent.nick}: ${it.title}`.slice(0, 200), who: it.agent.agent_id, kind: 'ai', col: 'todo' }).select('id').single();
    if (error || !data) { console.error('delegate insert', error?.message); continue; }
    out.push({ agent: it.agent.agent_id, nick: it.agent.nick, title: it.title, task_id: String(data.id) });
    if (!secret) continue;
    calls.push(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1', 'x-hive-secret': secret },
        body: JSON.stringify({ agent: it.agent.agent_id, title: it.title, detail: it.detail, task_id: data.id, caller: { type: 'queen-bea', id: by } }),
        signal: AbortSignal.timeout(110000),
      })
        .then((r) => r.json())
        // simpan jawaban lengkap agent ke kartu tugas (log aktivitas hanya 280 karakter)
        .then((d) => (d?.reply ? a.from('hc_plan_tasks').update({ result: String(d.reply).slice(0, 20000), result_at: new Date().toISOString() }).eq('id', data.id) : null))
        .catch((e) => console.error('delegate call', String(e))),
    );
  }
  if (calls.length) {
    const all = Promise.allSettled(calls);
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(all); else all.catch(() => {});
  }
  return out;
}

// status server agent (n8n di PC kantor) dari pengecekan terakhir Edge Function agent-chat
async function agentStatus(a: any) {
  const { data } = await a.from('hc_system_status').select('value, checked_at').eq('key', 'n8n').maybeSingle();
  if (!data) return 'STATUS SERVER AGENT: belum pernah dicek.';
  const ageMin = Math.round((Date.now() - new Date(data.checked_at).getTime()) / 60000);
  const state = data.value?.online ? 'ONLINE (20 agent bisa menerima tugas)' : 'OFFLINE (server agent di PC kantor tidak menjawab; tugas baru tertunda)';
  return `STATUS SERVER AGENT: ${state}, dicek ${wib(data.checked_at)} WIB${ageMin > 10 ? ` (${ageMin} menit lalu, bisa sudah berubah)` : ''}.`;
}

async function colonyData(sb: Sb, me: { name: string; role: string; primary_dept: string }, a: any) {
  const [staff, approvals, tasks, activity, status] = await Promise.all([
    sb.from('hc_profiles').select('name, role, primary_dept').order('created_at').limit(50),
    sb.from('hc_approvals').select('title, requested_by, status, created_at').eq('status', 'pending').limit(20),
    sb.from('hc_plan_tasks').select('title, who, col').neq('col', 'done').limit(30),
    sb.from('hc_activity').select('text, created_at').order('created_at', { ascending: false }).limit(15),
    agentStatus(a),
  ]);
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // staff Hive Colony yang login saja (token diperiksa ke Supabase Auth)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const adm = admin();
  if (!jwt) return json({ error: 'not_logged_in' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let me: { name: string; role: string; primary_dept: string } | null = null;
  let uid = '';
  {
    const { data: u, error: uErr } = await sb.auth.getUser(jwt);
    if (uErr || !u?.user) return json({ error: 'not_logged_in' }, 401);
    uid = u.user.id;
    const { data: prof } = await sb.from('hc_profiles').select('name, role, primary_dept').eq('id', u.user.id).maybeSingle();
    me = prof as typeof me;
  }
  if (!me) return json({ error: 'not_hive_staff' }, 403);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const body = await req.json().catch(() => ({}));
  if (body?.action === 'status') return json({ configured: !!apiKey, model: MODEL });
  if (!apiKey) return json({ error: 'ai_not_configured' }, 503);

  // riwayat chat: hanya teks, dipotong, harus diawali pesan user dan bergantian
  const raw = Array.isArray(body?.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of raw) {
    const role = m?.role === 'assistant' ? 'assistant' : 'user';
    const text = String(m?.content ?? '').slice(0, MAX_CHARS).trim();
    if (!text) continue;
    if (!messages.length && role === 'assistant') continue;
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n${text}`;
    else messages.push({ role, content: text });
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'empty_message' }, 400);
  // isi lampiran (sudah dibaca agent-chat) menempel di pesan terakhir, tidak ikut batas MAX_CHARS
  const attachments = typeof body?.attachments === 'string' ? body.attachments.slice(0, MAX_ATTACH) : '';
  if (attachments) messages[messages.length - 1].content += `\n\nLAMPIRAN (isi file yang dikirim pengguna):\n${attachments}`;

  const agents = await loadAgents(adm);
  let context = (await colonyData(sb as Sb, me, adm)) +'\n\n' + teamBlock(agents);
  if (body?.mode === 'meeting') {
    const tx = Array.isArray(body?.transcript) ? body.transcript.slice(-MAX_TX_LINES) : [];
    const lines = tx.map((l: { who?: string; text?: string }) => `${String(l?.who ?? '?').slice(0, 40)}: ${String(l?.text ?? '').slice(0, 400)}`);
    context += `\n\nSITUASI: kamu sedang ikut rapat suara di Hive Hall dalam mode standby: kamu mendengarkan seluruh rapat dan baru bicara saat dipanggil. Peserta memanggilmu dengan menyebut namamu, lalu meminta saran, pendapat, ringkasan, atau riset. Jawabanmu dibacakan ke semua peserta, jadi buat ringkas (maks. 5 kalimat) dan beri saran yang konkret dan bisa langsung dijalankan, merujuk hal yang dibahas di transkrip.
Transkrip rapat terakhir:
${lines.length ? lines.join('\n') : '- (belum ada yang bicara)'}`;
  }

  const client = new Anthropic({ apiKey });
  const canDelegate = agents.length > 0 && (me as { role: string }).role !== 'viewer';
  const system = [
    { type: 'text' as const, text: PERSONA },
    { type: 'text' as const, text: context },
  ];
  const ask = (msgs: unknown[], tools: unknown[]) =>
    client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      // obrolan cepat: tanpa thinking, effort rendah
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system,
      // deno-lint-ignore no-explicit-any
      messages: msgs as any,
      // deno-lint-ignore no-explicit-any
      ...(tools.length ? { tools: tools as any } : {}),
    });
  try {
    let res;
    try {
      res = await ask(messages, canDelegate ? [WEB_SEARCH, DELEGATE_TOOL] : [WEB_SEARCH]);
    } catch (e) {
      // kalau alat pencarian ditolak untuk model/akun ini, tetap jawab tanpa riset
      if (e instanceof Anthropic.BadRequestError) {
        console.warn('web search tidak tersedia:', e.message);
        res = await ask(messages, canDelegate ? [DELEGATE_TOOL] : []);
      } else throw e;
    }
    // pencarian panjang bisa berhenti di tengah (pause_turn): kirim ulang apa adanya, server melanjutkan
    for (let i = 0; res.stop_reason === 'pause_turn' && i < MAX_CONTINUE; i++) {
      res = await ask([...messages, { role: 'assistant', content: res.content }], canDelegate ? [WEB_SEARCH, DELEGATE_TOOL] : [WEB_SEARCH]);
    }
    // delegasi lewat tool use (1 level): jalankan, kirim hasilnya, lalu minta jawaban akhir tanpa alat delegasi
    let delegated: { agent: string; nick: string; title: string; task_id: string | null }[] = [];
    const useBlock = res.stop_reason === 'tool_use' ? (res.content.find((b) => b.type === 'tool_use' && (b as { name?: string }).name === 'delegate_tasks') as { id: string; input?: { tasks?: unknown[] } } | undefined) : undefined;
    if (useBlock) {
      const items = parseDelegation('[[DELEGATE]] ' + JSON.stringify(useBlock.input?.tasks ?? []), agents).items;
      delegated = items.length ? await delegate(adm, items, uid) : [];
      const resultText = delegated.length ? 'Terkirim: ' + delegated.map((d) => `${d.nick} (${d.agent}) -> ${d.title}`).join('; ') : 'Tidak ada tugas yang valid; tidak ada yang dikirim.';
      const toolResults = res.content.filter((b) => b.type === 'tool_use').map((b) => ({ type: 'tool_result', tool_use_id: (b as { id: string }).id, content: (b as { id: string }).id === useBlock.id ? resultText : 'Tidak dijalankan.' }));
      res = await ask([...messages, { role: 'assistant', content: res.content }, { role: 'user', content: toolResults }], []);
    }
    if (res.stop_reason === 'refusal') return json({ reply: 'Maaf, untuk pertanyaan itu saya tidak bisa membantu. Ada hal lain soal koloni?' });
    const texts = res.content.filter((b) => b.type === 'text') as { text: string; citations?: { url?: string; title?: string }[] | null }[];
    const parsed = parseDelegation(texts.map((b) => b.text).join('').trim(), agents);
    let reply = parsed.reply;
    if (!delegated.length && parsed.items.length && canDelegate) delegated = await delegate(adm, parsed.items, uid);
    if (delegated.length) {
      const missing = delegated.filter((d) => !reply.includes(d.nick));
      if (missing.length) reply += `\n\nTugas sudah saya kirim: ${delegated.map((d) => `${d.nick} (${d.title})`).join(', ')}.`;
    }
    // sumber riset dari kutipan pencarian web (unik per URL)
    const seen = new Set<string>();
    const sources: { title: string; url: string }[] = [];
    for (const b of texts) {
      for (const c of b.citations ?? []) {
        if (c?.url && !seen.has(c.url) && sources.length < 5) {
          seen.add(c.url);
          let host = c.url;
          try {
            host = new URL(c.url).hostname;
          } catch {
            /* URL tidak valid */
          }
          sources.push({ title: (c.title || host).slice(0, 120), url: c.url });
        }
      }
    }
    const researched = res.content.some((b) => b.type === 'server_tool_use');
    return json({ reply: reply || 'Hmm, saya belum punya jawaban. Coba tanyakan dengan cara lain?', sources, researched, ...(delegated.length ? { delegated } : {}) });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'ai_key_invalid' }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'ai_busy' }, 429);
    if (e instanceof Anthropic.APIError) {
      console.error('Claude API error', e.status, e.message);
      return json({ error: 'ai_error', status: e.status }, 502);
    }
    console.error('queen-bea error', e);
    return json({ error: 'ai_error' }, 500);
  }
});
