// Edge Function: agent-chat
// Ruang Kerja Agent: staff ngobrol langsung dengan agent. Akses dicek (hc_agent_level), riwayat
// disimpan di hc_agent_threads/hc_agent_messages, lalu pesan diteruskan ke:
//   - 20 agent  -> webhook n8n "Hive - Agent Task Worker" (Claude, persona di hc_agent_prompts)
//   - Queen Bea -> Edge Function queen-bea (supaya delegasi ke agent tetap jalan)
//   POST { action: 'health' }                              -> { online, checked_at }
//   POST { action: 'send', agent, message, thread_id? }    -> { thread_id, reply, status, meta }
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const MAX_HISTORY = 10; // pesan sebelumnya yang ikut dikirim
const MAX_MESSAGE = 4000;

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

let cache: { url: string; secret: string } | null = null;
async function n8n() {
  if (cache) return cache;
  const [{ data: url }, { data: secret }] = await Promise.all([admin.rpc('hive_n8n_url'), admin.rpc('hive_webhook_secret')]);
  if (typeof url !== 'string' || typeof secret !== 'string' || !url || !secret) throw new Error('n8n_not_configured');
  cache = { url: url.replace(/\/+$/, ''), secret };
  return cache;
}

function callWorker(body: unknown, timeoutMs: number) {
  return n8n().then(({ url, secret }) =>
    fetch(`${url}/webhook/hive/agent-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1', 'x-hive-secret': secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }),
  );
}

// n8n hidup kalau menjawab JSON "unknown_agent" untuk agent fiktif (tanpa memanggil AI).
// Hasilnya di-cache 2 menit di hc_system_status, berapa pun jumlah staff yang membuka website.
const HEALTH_TTL_MS = 2 * 60 * 1000;
async function ping() {
  try {
    const r = await callWorker({ agent: '__ping__', message: 'ping' }, 8000);
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

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
  if (body?.action !== 'send') return json({ error: 'bad_action' }, 400);

  const agent = String(body?.agent ?? '');
  const message = String(body?.message ?? '').trim().slice(0, MAX_MESSAGE);
  if (!/^[a-z_]{2,30}$/.test(agent)) return json({ error: 'unknown_agent' }, 404);
  if (!message) return json({ error: 'empty_message' }, 400);

  // akses dicek dengan identitas staff sendiri (owner = semua agent)
  const { data: level } = await sb.rpc('hc_agent_level', { p_agent: agent });
  if (!level) return json({ error: 'no_access' }, 403);
  let nick = 'Queen Bea';
  if (agent !== 'ceo') {
    const { data: ag } = await admin.from('hc_agent_prompts').select('nick, active').eq('agent_id', agent).maybeSingle();
    if (!ag || !ag.active) return json({ error: 'unknown_agent' }, 404);
    nick = ag.nick;
  }

  // percakapan: lanjutkan milik sendiri, atau buat baru
  let threadId = typeof body?.thread_id === 'string' ? body.thread_id : '';
  if (threadId) {
    const { data: t } = await admin.from('hc_agent_threads').select('id, user_id, agent_id').eq('id', threadId).maybeSingle();
    if (!t || t.user_id !== uid || t.agent_id !== agent) return json({ error: 'bad_thread' }, 404);
  } else {
    const { data: t, error } = await admin
      .from('hc_agent_threads')
      .insert({ agent_id: agent, user_id: uid, title: message.replace(/\s+/g, ' ').slice(0, 60) || 'Percakapan baru' })
      .select('id')
      .single();
    if (error || !t) return json({ error: 'db_error' }, 500);
    threadId = t.id;
  }
  const { data: past } = await admin
    .from('hc_agent_messages')
    .select('role, content')
    .eq('thread_id', threadId)
    .neq('role', 'system')
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY);
  const history = (past ?? []).reverse();
  await admin.from('hc_agent_messages').insert({ thread_id: threadId, role: 'user', content: message, meta: { by: uid, name: me.name } });

  let reply = '';
  let role: 'agent' | 'system' = 'agent';
  let status = 'ok';
  let meta: Record<string, unknown> = {};
  try {
    if (agent === 'ceo') {
      const msgs = [...history.map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.content })), { role: 'user', content: message }];
      const r = await fetch(`${SUPABASE_URL}/functions/v1/queen-bea`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs }),
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
        `Pesan terbaru dari ${me.name} (staff Hive Colony). Jawab langsung sebagai ${nick}:\n${message}`;
      const r = await callWorker({ agent, message: prompt, caller: { type: 'staff', id: uid } }, 110000);
      const d = await r.json().catch(() => null);
      if (r.status === 202 && d?.status === 'pending_approval') {
        status = 'pending_approval';
        role = 'system';
        reply = `Permintaan ini butuh persetujuan owner dulu (ada di tab Persetujuan Hive Hall). Setelah disetujui, ${nick} akan mengerjakannya dan hasilnya muncul di log aktivitas.`;
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
  return json({ thread_id: threadId, reply, status, meta });
});
