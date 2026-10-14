// Edge Function: agent-chat
// Ruang Kerja Agent: staff ngobrol langsung dengan agent. Akses dicek (hc_agent_level), riwayat
// disimpan di hc_agent_threads/hc_agent_messages, lalu pesan diteruskan ke:
//   - 20 agent  -> webhook n8n "Hive - Agent Task Worker" (Claude, persona di hc_agent_prompts)
//   - Queen Bea -> Edge Function queen-bea (supaya delegasi ke agent tetap jalan)
//   POST { action: 'health' }                                     -> { online, checked_at }
//   POST { action: 'send', agent, message, thread_id?, files?, engine? } -> { thread_id, reply, status, meta }
//        status 'pending' = diteruskan ke Grok Bot; balasan masuk belakangan lewat Realtime
//   POST { action: 'task', agent, title, detail }                 -> { task_id }   (Jadikan tugas untuk agent)
//   POST { action: 'routine_run', routine_id }                    -> { task_id }   (Jalankan sekarang, owner/Pelatih)
//   POST { action: 'resume', approval_id, status } + x-hive-secret -> 202          (dari trigger hc_approvals)
//   POST { action: 'routines' } + x-hive-secret                   -> { ran }       (dari n8n "Hive - Routine Tick")
//   POST { action: 'grok_delegate', message_id } + x-hive-secret  -> 202          (balasan Queen mode Grok berisi [[DELEGATE]])
//   POST { action: 'usage' }                                      -> { used, limit } (kuota pesan harian saya)
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { QUEEN_PERSONA } from '../_shared/queenPersona.ts';
import {
  background,
  n8nConfig,
  callN8n,
  callWorker,
  GROK_AGENTS,
  dispatchGrok,
  startAgentTask,
  loadAgents,
  teamBlock,
  parseDelegation,
  delegateTasks,
  colonyData,
  GROK_DELEGATE_GUIDE,
} from '../_shared/hive.ts';

const MAX_HISTORY = 10; // pesan sebelumnya yang ikut dikirim
const MAX_MESSAGE = 4000;
const MAX_FILES = 3;
const MAX_FILE_TEXT = 30000; // karakter isi per lampiran
const BUCKET = 'hc-agent-files';
const MODEL = 'claude-haiku-5-5';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

// n8n hidup kalau menjawab JSON "unknown_agent" untuk agent fiktif (tanpa memanggil AI).
// Hasilnya di-cache 2 menit di hc_system_status, berapa pun jumlah staff yang membuka website.
const HEALTH_TTL_MS = 2 * 60 * 1000;
async function ping() {
  try {
    const r = await callWorker(admin, { agent: '__ping__', message: 'ping' }, 8000);
    const d = await r.json().catch(() => null);
    return r.status === 404 && d?.error === 'unknown_agent';
  } catch {
    return false;
  }
}
async function health() {
  const { data: row } = await admin.from('hc_system_status').select('value, checked_at').eq('key', 'n8n').maybeSingle();
  if (row && Date.now() - new Date(row.checked_at).getTime() < HEALTH_TTL_MS) return { online: !!row.value?.online, checked_at: row.checked_at };
  const online = await ping();
  const checked_at = new Date().toISOString();
  await admin.from('hc_system_status').upsert({ key: 'n8n', value: { online }, checked_at });
  return { online, checked_at };
}

async function nickOf(agent: string) {
  if (agent === 'ceo') return { nick: 'Queen Bea', dept: 'ceo' };
  const { data } = await admin.from('hc_agent_prompts').select('nick, dept').eq('agent_id', agent).maybeSingle();
  return { nick: data?.nick || agent, dept: data?.dept || null };
}

// ---------- approval disetujui/ditolak: teruskan ke n8n, jawabannya kembali ke percakapan ----------
async function resume(approvalId: string, status: string) {
  const { data: ap } = await admin.from('hc_approvals').select('id, requested_by, payload').eq('id', approvalId).maybeSingle();
  if (!ap) return;
  let d: { worker?: { reply?: string }; skipped?: boolean } | null = null;
  try {
    const r = await callN8n(admin, '/webhook/hive/approval-resume', { approval_id: approvalId, status }, 140000);
    d = await r.json().catch(() => null);
  } catch (e) {
    console.error('approval-resume', String(e));
  }
  const reply = d?.worker?.reply ? String(d.worker.reply) : '';
  let payload = ap.payload as Record<string, unknown> | string | null;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  const taskId = (payload as Record<string, unknown> | null)?.task_id;
  if (reply && typeof taskId === 'string' && taskId) {
    await admin.from('hc_plan_tasks').update({ result: reply.slice(0, 20000), result_at: new Date().toISOString() }).eq('id', taskId);
  }

  // percakapan asal: pesan sistem "butuh persetujuan" menyimpan approval_id
  const { data: origin } = await admin.from('hc_agent_messages').select('thread_id').eq('meta->>approval_id', approvalId).order('id').limit(1).maybeSingle();
  if (!origin) return;
  const { nick } = await nickOf(String(ap.requested_by || ''));
  let role: 'agent' | 'system' = 'system';
  let content = '';
  if (status === 'rejected') content = `Owner menolak permintaan ini, jadi ${nick} tidak mengerjakannya.`;
  else if (reply) {
    role = 'agent';
    content = reply;
  } else if (d?.skipped) return;
  else content = `Permintaan sudah disetujui, tapi ${nick} belum berhasil mengerjakannya (server agent tidak menjawab). Coba kirim ulang perintahnya.`;
  await admin.from('hc_agent_messages').insert({ thread_id: origin.thread_id, role, content: content.slice(0, 20000), meta: { resumed_from: approvalId, status } });
  await admin.from('hc_agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', origin.thread_id);
}

// ---------- tugas rutin: dipanggil workflow n8n "Hive - Routine Tick" tiap 5 menit ----------
type Routine = { id: string; agent_id: string; title: string; instruction: string; next_run_at: string | null; created_by: string | null };
async function runRoutine(r: Routine, by: string | null, manual: boolean) {
  const { nick, dept } = await nickOf(r.agent_id);
  const taskId = await startAgentTask(admin, {
    agent: r.agent_id,
    nick,
    dept,
    title: r.title,
    detail: `Tugas rutin${manual ? ' (dijalankan manual)' : ''}: ${r.title}\n\n${r.instruction}`,
    by,
    caller: { type: 'routine', id: r.id },
    activity: `Tugas rutin ${nick}${manual ? ' (manual)' : ''}: ${r.title}`,
  });
  await admin.from('hc_agent_routines').update({ last_task_id: taskId, ...(manual ? {} : { last_run_at: new Date().toISOString() }) }).eq('id', r.id);
  return taskId;
}
async function runDueRoutines() {
  const nowIso = new Date().toISOString();
  const { data: due } = await admin
    .from('hc_agent_routines')
    .select('id, agent_id, title, instruction, next_run_at, created_by')
    .eq('active', true)
    .lte('next_run_at', nowIso)
    .order('next_run_at')
    .limit(10);
  let ran = 0;
  for (const r of (due ?? []) as Routine[]) {
    // klaim dulu (jadwal berikutnya dihitung ulang trigger), supaya tick yang bersamaan tidak menjalankan dua kali
    const { data: claimed } = await admin.from('hc_agent_routines').update({ last_run_at: nowIso }).eq('id', r.id).eq('next_run_at', r.next_run_at).select('id').maybeSingle();
    if (!claimed) continue;
    try {
      await runRoutine(r, r.created_by, false);
      ran++;
    } catch (e) {
      console.error('routine', r.id, String(e));
    }
  }
  return ran;
}

// ---------- Queen Bea mode Grok: blok [[DELEGATE]] di balasan bot -> tugas ke agent ----------
async function grokDelegate(messageId: number) {
  const { data: m } = await admin.from('hc_agent_messages').select('id, thread_id, content, meta').eq('id', messageId).maybeSingle();
  if (!m || !String(m.content).includes('[[DELEGATE]]')) return;
  const { data: t } = await admin.from('hc_agent_threads').select('agent_id, user_id').eq('id', m.thread_id).maybeSingle();
  if (!t || t.agent_id !== 'ceo') return;
  const { data: prof } = await admin.from('hc_profiles').select('role').eq('id', t.user_id).maybeSingle();
  const parsed = parseDelegation(String(m.content), await loadAgents(admin));
  const delegated = parsed.items.length && prof && prof.role !== 'viewer' ? await delegateTasks(admin, parsed.items, t.user_id) : [];
  let reply = parsed.reply || 'Siap.';
  const missing = delegated.filter((d) => !reply.includes(d.nick));
  if (missing.length) reply += `\n\nTugas sudah saya kirim: ${delegated.map((d) => `${d.nick} (${d.title})`).join(', ')}.`;
  await admin
    .from('hc_agent_messages')
    .update({ content: reply.slice(0, 20000), meta: { ...(m.meta || {}), delegated } })
    .eq('id', m.id);
}

// ---------- kuota pesan harian per staff (owner tanpa batas) ----------
async function quota(sb: ReturnType<typeof createClient>, role: string) {
  const [{ data: used }, { data: lim }] = await Promise.all([sb.rpc('hc_my_usage_today'), admin.from('hc_system_status').select('value').eq('key', 'limits').maybeSingle()]);
  const limit = role === 'owner' ? 0 : Number(lim?.value?.daily_per_staff) || 0;
  return { used: Number(used) || 0, limit };
}

// ---------- lampiran: teks dibaca langsung, gambar & PDF dibaca Claude ----------
function base64(buf: Uint8Array) {
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
const IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const READ_PROMPT = `Baca lampiran ini untuk rekan kerja yang tidak bisa melihatnya. Tuliskan isinya selengkap dan seakurat mungkin dalam Bahasa Indonesia:
- semua teks penting apa adanya (judul, angka, tanggal, nama),
- tabel sebagai daftar baris,
- untuk gambar/foto: jelaskan apa yang terlihat.
Jangan menambah opini atau saran. Langsung tulis isinya.`;

type FileRef = { path: string; name: string; type: string; size: number };
async function readFiles(files: FileRef[]) {
  const client = apiKey ? new Anthropic({ apiKey }) : null;
  const parts = await Promise.all(
    files.map(async (f) => {
      const { data: blob, error } = await admin.storage.from(BUCKET).download(f.path);
      if (error || !blob) return `### Lampiran: ${f.name}\n(file tidak bisa diambil)`;
      const type = blob.type || f.type;
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (type.startsWith('text/') || type === 'application/json') {
        return `### Lampiran: ${f.name}\n${new TextDecoder().decode(buf).slice(0, MAX_FILE_TEXT)}`;
      }
      if (!client || !(IMAGE.includes(type) || type === 'application/pdf')) return `### Lampiran: ${f.name}\n(jenis file ini belum bisa dibaca)`;
      const data = base64(buf);
      const block =
        type === 'application/pdf'
          ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
          : { type: 'image' as const, source: { type: 'base64' as const, media_type: type as 'image/png', data } };
      try {
        const res = await client.messages.create({
          model: MODEL,
          max_tokens: 4000,
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: [block, { type: 'text', text: READ_PROMPT }] }],
        });
        const text = res.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { text: string }).text)
          .join('\n')
          .trim();
        return `### Lampiran: ${f.name}\n${text.slice(0, MAX_FILE_TEXT) || '(isi kosong)'}`;
      } catch (e) {
        console.error('read file', f.name, String(e));
        return `### Lampiran: ${f.name}\n(file gagal dibaca)`;
      }
    }),
  );
  return parts.join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // panggilan dari trigger database (approval diputuskan): dijaga secret webhook, bukan login
  const hook = req.headers.get('x-hive-secret');
  if (hook) {
    const { secret } = await n8nConfig(admin).catch(() => ({ secret: '' }));
    if (!secret || hook !== secret) return json({ error: 'forbidden' }, 403);
    const b = await req.json().catch(() => ({}));
    if (b?.action === 'routines') return json({ ok: true, ran: await runDueRoutines() });
    if (b?.action === 'grok_delegate') {
      const mid = Number(b?.message_id);
      if (!Number.isInteger(mid)) return json({ error: 'bad_request' }, 400);
      background(grokDelegate(mid).catch((e) => console.error('grok_delegate', String(e))));
      return json({ ok: true, queued: true }, 202);
    }
    const id = String(b?.approval_id ?? '');
    if (b?.action !== 'resume' || !/^[0-9a-f-]{36}$/i.test(id) || !['approved', 'rejected'].includes(b?.status)) return json({ error: 'bad_request' }, 400);
    background(resume(id, b.status).catch((e) => console.error('resume', String(e))));
    return json({ ok: true, queued: true }, 202);
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_logged_in' }, 401);
  const sb = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await sb.auth.getUser(jwt);
  if (uErr || !u?.user) return json({ error: 'not_logged_in' }, 401);
  const uid = u.user.id;
  const { data: me } = await sb.from('hc_profiles').select('name, role').eq('id', uid).maybeSingle();
  if (!me) return json({ error: 'not_hive_staff' }, 403);

  const body = await req.json().catch(() => ({}));
  if (body?.action === 'health') return json(await health());
  if (body?.action === 'usage') return json(await quota(sb, me.role));
  // Jalankan sekarang (owner / Pelatih agent itu), jadwal rutin tidak berubah
  if (body?.action === 'routine_run') {
    const rid = String(body?.routine_id ?? '');
    const { data: r } = await sb.from('hc_agent_routines').select('id, agent_id, title, instruction, next_run_at, created_by').eq('id', rid).maybeSingle();
    if (!r) return json({ error: 'not_found' }, 404);
    const { data: lv } = await sb.rpc('hc_agent_level', { p_agent: r.agent_id });
    if (lv !== 'owner' && lv !== 'train') return json({ error: 'no_access' }, 403);
    try {
      return json({ task_id: await runRoutine(r as Routine, uid, true) });
    } catch {
      return json({ error: 'db_error' }, 500);
    }
  }
  if (body?.action !== 'send' && body?.action !== 'task') return json({ error: 'bad_action' }, 400);

  const agent = String(body?.agent ?? '');
  if (!/^[a-z_]{2,30}$/.test(agent)) return json({ error: 'unknown_agent' }, 404);
  // akses dicek dengan identitas staff sendiri (owner = semua agent)
  const { data: level } = await sb.rpc('hc_agent_level', { p_agent: agent });
  if (!level) return json({ error: 'no_access' }, 403);
  let nick = 'Queen Bea';
  let dept: string | null = 'ceo';
  let persona = QUEEN_PERSONA; // prompt lengkap agent (persona + skill + pelajaran) untuk Grok Bot
  if (agent !== 'ceo') {
    const { data: ag } = await admin.from('hc_agent_prompts').select('nick, dept, active, system_prompt').eq('agent_id', agent).maybeSingle();
    if (!ag || !ag.active) return json({ error: 'unknown_agent' }, 404);
    nick = ag.nick;
    persona = ag.system_prompt || '';
    dept = ag.dept;
  }

  // ---------- Jadikan tugas: kartu di papan rencana, dikerjakan agent lewat n8n ----------
  if (body?.action === 'task') {
    if (agent === 'ceo') return json({ error: 'unknown_agent' }, 404);
    if (!['owner', 'lead', 'staff'].includes(me.role)) return json({ error: 'viewer' }, 403);
    const title = String(body?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const detail = String(body?.detail ?? '').trim().slice(0, 6000);
    if (!title) return json({ error: 'empty_message' }, 400);
    try {
      const taskId = await startAgentTask(admin, { agent, nick, dept, title, detail, by: uid, caller: { type: 'staff', id: uid }, activity: `${me.name} memberi tugas ke ${nick}: ${title}` });
      return json({ task_id: taskId });
    } catch {
      return json({ error: 'db_error' }, 500);
    }
  }

  // ---------- kirim pesan ----------
  const files: FileRef[] = (Array.isArray(body?.files) ? body.files : [])
    .slice(0, MAX_FILES)
    .map((f: Record<string, unknown>) => ({ path: String(f?.path ?? ''), name: String(f?.name ?? 'file').slice(0, 120), type: String(f?.type ?? ''), size: Number(f?.size) || 0 }))
    .filter((f: FileRef) => f.path.startsWith(`${uid}/`) && !f.path.includes('..'));
  let message = String(body?.message ?? '').trim().slice(0, MAX_MESSAGE);
  if (!message && files.length) message = 'Tolong pelajari lampiran ini.';
  if (!message) return json({ error: 'empty_message' }, 400);

  const q = await quota(sb, me.role);
  if (q.limit > 0 && q.used >= q.limit) return json({ error: 'daily_limit', ...q }, 429);
  const quotaAfter = { used: q.used + 1, limit: q.limit };

  // percakapan: lanjutkan milik sendiri, atau buat baru
  let threadId = typeof body?.thread_id === 'string' ? body.thread_id : '';
  if (threadId) {
    const { data: t } = await admin.from('hc_agent_threads').select('id, user_id, agent_id').eq('id', threadId).maybeSingle();
    if (!t || t.user_id !== uid || t.agent_id !== agent) return json({ error: 'bad_thread' }, 404);
  } else {
    const title = (body?.message ? message : files[0]?.name || message).replace(/\s+/g, ' ').slice(0, 60);
    const { data: t, error } = await admin
      .from('hc_agent_threads')
      .insert({ agent_id: agent, user_id: uid, title: title || 'Percakapan baru' })
      .select('id')
      .single();
    if (error || !t) return json({ error: 'db_error' }, 500);
    threadId = t.id;
  }
  const { data: past } = await admin
    .from('hc_agent_messages')
    .select('role, content, meta')
    .eq('thread_id', threadId)
    .neq('role', 'system')
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY);
  const history = (past ?? []).reverse().map((m) => ({
    role: m.role,
    content: m.content + (Array.isArray(m.meta?.files) && m.meta.files.length ? `\n[lampiran: ${m.meta.files.map((f: FileRef) => f.name).join(', ')}]` : ''),
  }));
  const { data: userMsg } = await admin
    .from('hc_agent_messages')
    .insert({
      thread_id: threadId,
      role: 'user',
      content: message,
      meta: { by: uid, name: me.name, ...(files.length ? { files } : {}) },
    })
    .select('id')
    .single();

  // Grok Bot: diteruskan ke bot, balasannya ditulis bot sendiri ke hc_agent_messages (meta.engine = 'grokbot')
  const engine = body?.engine === 'grokbot' ? 'grokbot' : 'claude';
  const useGrok = GROK_AGENTS.includes(agent) || (agent === 'ceo' && engine === 'grokbot');
  if (useGrok) {
    try {
      const attachments = files.length ? await readFiles(files) : '';
      const full = attachments ? `${message}\n\nLAMPIRAN dari ${me.name} (isi file yang dikirim):\n${attachments}` : message;
      // Queen Bea: data koloni + tim agent + cara mendelegasikan lewat blok [[DELEGATE]]
      let context = '';
      if (agent === 'ceo') {
        const { data: meFull } = await sb.from('hc_profiles').select('name, role, primary_dept').eq('id', uid).maybeSingle();
        context = [await colonyData(sb, meFull || { ...me, primary_dept: '-' }, admin, uid), teamBlock(await loadAgents(admin)), me.role === 'viewer' ? 'Pengguna ini viewer: jangan mendelegasikan tugas.' : GROK_DELEGATE_GUIDE].join('\n\n');
      }
      await dispatchGrok({ agent, threadId, message: full, userName: me.name, messageId: userMsg?.id ?? null, history, persona, context });
      await admin.from('hc_agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
      return json({ thread_id: threadId, reply: '', status: 'pending', meta: { engine: 'grokbot' }, quota: quotaAfter });
    } catch (e) {
      const errMeta = { engine: 'grokbot', error: String((e as Error)?.message || e).slice(0, 200) };
      const errReply = `${nick} (Grok Bot) tidak bisa dihubungi. Coba lagi nanti.`;
      await admin.from('hc_agent_messages').insert({ thread_id: threadId, role: 'system', content: errReply, meta: errMeta });
      await admin.from('hc_agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
      return json({ thread_id: threadId, reply: errReply, status: 'error', meta: errMeta, quota: quotaAfter });
    }
  }

  let reply = '';
  let role: 'agent' | 'system' = 'agent';
  let status = 'ok';
  let meta: Record<string, unknown> = {};
  try {
    const attachments = files.length ? await readFiles(files) : '';
    if (agent === 'ceo') {
      const msgs = [...history.map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.content })), { role: 'user', content: message }];
      const r = await fetch(`${SUPABASE_URL}/functions/v1/queen-bea`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, attachments }),
        signal: AbortSignal.timeout(120000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.reply) throw new Error(d?.error || 'agent_failed');
      reply = d.reply;
      meta = { sources: d.sources ?? [], delegated: d.delegated ?? [] };
    } else {
      const convo = history.map((m) => `${m.role === 'agent' ? nick : me.name}: ${m.content.slice(0, 1500)}`).join('\n');
      const prompt =
        (convo ? `Riwayat percakapan sebelumnya dengan ${me.name}:\n${convo}\n\n` : '') +
        `Pesan terbaru dari ${me.name} (staff Hive Colony). Jawab langsung sebagai ${nick}:\n${message}` +
        (attachments ? `\n\nLAMPIRAN dari ${me.name} (isi file yang dikirim):\n${attachments}` : '');
      const r = await callWorker(admin, { agent, message: prompt, caller: { type: 'staff', id: uid } }, 110000);
      const d = await r.json().catch(() => null);
      if (r.status === 202 && d?.status === 'pending_approval') {
        status = 'pending_approval';
        role = 'system';
        reply = `Permintaan ini butuh persetujuan owner dulu (ada di tab Persetujuan Hive Hall). Setelah disetujui, jawaban ${nick} otomatis muncul di percakapan ini.`;
        meta = { approval_id: d.approval_id };
      } else if (!d) {
        throw new Error('agent_offline');
      } else if (!r.ok || !d.reply) {
        throw new Error(d.error || 'agent_failed');
      } else {
        reply = String(d.reply);
      }
    }
  } catch (e) {
    const code = String((e as Error)?.message || e);
    status = 'error';
    role = 'system';
    const offline = code.includes('offline') || code.includes('timed out') || code.includes('n8n') || code.includes('error sending request');
    reply = offline
      ? `${nick} sedang offline (server agent di PC kantor tidak menjawab). Coba lagi nanti.`
      : `${nick} gagal menjawab. Coba lagi sebentar lagi.`;
    meta = { error: code.slice(0, 200) };
  }

  await admin.from('hc_agent_messages').insert({ thread_id: threadId, role, content: reply.slice(0, 20000), meta });
  await admin.from('hc_agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
  return json({ thread_id: threadId, reply, status, meta, quota: quotaAfter });
});
