// Edge Function: queen-bea
// Queen Bea (Chief Executive Hive Colony) dijawab oleh Claude Sonnet 5.5. Hanya untuk staff yang login.
// Kunci API dibaca dari Supabase Edge Function Secrets (ANTHROPIC_API_KEY), tidak pernah ke browser.
//   POST { action: 'status' }                        -> { configured, model }
//   POST { mode: 'chat' | 'meeting', messages, transcript?, attachments? } -> { reply }
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { QUEEN_PERSONA } from '../_shared/queenPersona.ts';
import { newAdmin, loadAgents, teamBlock, parseDelegation, delegateTasks, colonyData, recordDelegation, busyNote } from '../_shared/hive.ts';

// Queen Bea memakai Sonnet 5.5: lebih pintar membagi kerja, merangkum, dan bernalar (Haiku 5.5 sebelumnya)
const MODEL = 'claude-sonnet-5-5';
const FALLBACK_MODEL = 'claude-haiku-5-5'; // cadangan kalau Sonnet menolak pengaturan permintaan
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
  description: 'Kirim tugas ke agent di TIM AGENT. Maksimal 5 tugas. Tugas muncul di papan rencana, dikerjakan agent otomatis, dan rekapnya dikirim ke percakapan saat semua selesai.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array', maxItems: 5,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // staff Hive Colony yang login saja (token diperiksa ke Supabase Auth)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const adm = newAdmin();
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
  let context = (await colonyData(sb, me, adm, uid)) +'\n\n' + teamBlock(agents);
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
  // Sonnet 5.5: thinking adaptif (thinking 'disabled' ditolak model ini). Effort sedang untuk chat,
  // rendah saat rapat supaya jawaban suara tetap cepat. Thinking ikut dihitung ke max_tokens.
  const meeting = body?.mode === 'meeting';
  let model = MODEL;
  const ask = (msgs: unknown[], tools: unknown[], toolChoice?: { type: 'none' | 'auto' }) =>
    client.messages.create({
      model,
      max_tokens: meeting ? 2048 : 4096,
      // deno-lint-ignore no-explicit-any
      thinking: (model === MODEL ? { type: 'adaptive' } : { type: 'disabled' }) as any,
      output_config: { effort: model === MODEL ? (meeting ? 'low' : 'medium') : 'low' },
      system,
      // deno-lint-ignore no-explicit-any
      messages: msgs as any,
      // deno-lint-ignore no-explicit-any
      ...(tools.length ? { tools: tools as any, ...(toolChoice ? { tool_choice: toolChoice } : {}) } : {}),
    });
  try {
    let res;
    // daftar alat tidak boleh berubah sepanjang satu giliran (thinking terikat ke system, tools & riwayat)
    let tools: unknown[] = canDelegate ? [WEB_SEARCH, DELEGATE_TOOL] : [WEB_SEARCH];
    try {
      res = await ask(messages, tools);
    } catch (e) {
      // kalau alat pencarian ditolak untuk model/akun ini, tetap jawab tanpa riset
      if (e instanceof Anthropic.BadRequestError) {
        console.warn('web search tidak tersedia:', e.message);
        tools = canDelegate ? [DELEGATE_TOOL] : [];
        try {
          res = await ask(messages, tools);
        } catch (e2) {
          // pengaturan Sonnet ditolak: tetap jawab dengan model cadangan
          if (!(e2 instanceof Anthropic.BadRequestError)) throw e2;
          console.error('Sonnet ditolak, pakai cadangan:', e2.message);
          model = FALLBACK_MODEL;
          tools = canDelegate ? [WEB_SEARCH, DELEGATE_TOOL] : [WEB_SEARCH];
          res = await ask(messages, tools);
        }
      } else throw e;
    }
    // pencarian panjang bisa berhenti di tengah (pause_turn): kirim ulang apa adanya, server melanjutkan
    for (let i = 0; res.stop_reason === 'pause_turn' && i < MAX_CONTINUE; i++) {
      res = await ask([...messages, { role: 'assistant', content: res.content }], tools);
    }
    // delegasi lewat tool use (1 level): jalankan, kirim hasilnya, lalu minta jawaban akhir tanpa alat delegasi
    let delegated: { agent: string; nick: string; title: string; task_id: string | null; busy?: string }[] = [];
    const threadId = typeof body?.thread_id === 'string' ? body.thread_id : '';
    const useBlock = res.stop_reason === 'tool_use' ? (res.content.find((b) => b.type === 'tool_use' && (b as { name?: string }).name === 'delegate_tasks') as { id: string; input?: { tasks?: unknown[] } } | undefined) : undefined;
    if (useBlock) {
      const items = parseDelegation('[[DELEGATE]] ' + JSON.stringify(useBlock.input?.tasks ?? []), agents).items;
      delegated = items.length ? await delegateTasks(adm, items, uid, threadId || null) : [];
      const sent = delegated.filter((d) => d.task_id);
      const resultText = (sent.length ? 'Terkirim: ' + sent.map((d) => `${d.nick} (${d.agent}) -> ${d.title}`).join('; ') : 'Tidak ada tugas yang valid; tidak ada yang dikirim.') + busyNote(delegated);
      const toolResults = res.content.filter((b) => b.type === 'tool_use').map((b) => ({ type: 'tool_result', tool_use_id: (b as { id: string }).id, content: (b as { id: string }).id === useBlock.id ? resultText : 'Tidak dijalankan.' }));
      // jawaban akhir: alat tetap sama (supaya thinking sah), tapi tool_choice 'none' = tidak memanggil alat lagi
      res = await ask([...messages, { role: 'assistant', content: res.content }, { role: 'user', content: toolResults }], tools, { type: 'none' });
    }
    if (res.stop_reason === 'refusal') return json({ reply: 'Maaf, untuk pertanyaan itu saya tidak bisa membantu. Ada hal lain soal koloni?' });
    const texts = res.content.filter((b) => b.type === 'text') as { text: string; citations?: { url?: string; title?: string }[] | null }[];
    const parsed = parseDelegation(texts.map((b) => b.text).join('').trim(), agents);
    let reply = parsed.reply;
    if (!delegated.length && parsed.items.length && canDelegate) delegated = await delegateTasks(adm, parsed.items, uid, threadId || null);
    if (delegated.length) {
      const sent = delegated.filter((d) => d.task_id);
      const missing = sent.filter((d) => !reply.includes(d.nick));
      if (missing.length) reply += `\n\nTugas sudah saya kirim: ${sent.map((d) => `${d.nick} (${d.title})`).join(', ')}.`;
      reply += busyNote(delegated);
      // paket kerja dari percakapan Ruang Kerja: rekap & lampiran dikirim otomatis saat semua selesai
      if (threadId) {
        const { data: th } = await adm.from('hc_agent_threads').select('user_id, agent_id').eq('id', threadId).maybeSingle();
        if (th && th.user_id === uid && th.agent_id === 'ceo') {
          await recordDelegation(adm, { threadId, userId: uid, request: messages[messages.length - 1]?.content || '', taskIds: delegated.map((d) => d.task_id) });
        }
      }
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
