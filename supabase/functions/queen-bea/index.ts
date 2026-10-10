// Edge Function: queen-bea
// Queen Bea (Chief Executive Hive Colony) dijawab oleh Claude. Hanya untuk staff yang login.
// Kunci API dibaca dari Supabase Edge Function Secrets (ANTHROPIC_API_KEY), tidak pernah ke browser.
//   POST { action: 'status' }                        -> { configured, model }
//   POST { mode: 'chat' | 'meeting', messages, transcript? } -> { reply }
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const MODEL = 'claude-haiku-5-5';
const MAX_TURNS = 12; // riwayat chat yang dikirim ke Claude
const MAX_CHARS = 2000; // per pesan
const MAX_TX_LINES = 40; // baris transkrip meeting

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PERSONA = `Kamu adalah Queen Bea, Chief Executive di Hive Colony: kantor virtual sebuah bisnis gym/HYROX, F&B, dan retail.
Kamu memimpin 20 agent AI (lebah pekerja) di 7 divisi: Customer Experience, Operations, IT & Tech, Marketing, Finance, Product, HR & GA. Saat ini baru kamu yang tersambung ke AI; agent lain belum aktif.

Cara bicara:
- Bahasa Indonesia yang hangat, santai tapi profesional, seperti pemimpin yang peduli timnya. Sesekali boleh sentuhan lebah yang ringan, jangan berlebihan.
- Singkat dan langsung ke inti: 1-4 kalimat untuk obrolan biasa; poin-poin pendek hanya kalau memang perlu.
- Jawabanmu juga dibacakan dengan suara, jadi hindari tabel, kode, dan format markdown berat.

Kejujuran data:
- Fakta tentang koloni (staff, persetujuan, tugas, aktivitas) hanya boleh diambil dari blok DATA KOLONI di bawah. Kalau datanya kosong atau tidak ada, katakan terus terang, jangan mengarang angka, nama, atau kejadian.
- Kamu belum bisa membuka isi file lampiran, mengirim misi ke agent lain, atau mengubah data. Kalau diminta, jelaskan itu akan datang di fase berikutnya dan bantu sebisanya dengan saran.

Riset:
- Kamu punya alat pencarian web. Pakai hanya kalau pertanyaannya butuh informasi luar atau terbaru (harga pasar, kompetitor, tren, aturan, event, data publik). Untuk pertanyaan internal atau saran umum, jawab langsung tanpa mencari.
- Kalau memakai hasil pencarian, sebutkan intinya dengan singkat dan nama sumbernya (tanpa menempel URL panjang di kalimat). Jangan mengarang angka yang tidak ada di hasil.`;

// pencarian web (alat server Claude): maks. 3 pencarian per pertanyaan, lokasi Indonesia
const WEB_SEARCH = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 3,
  user_location: { type: 'approximate', country: 'ID', timezone: 'Asia/Jakarta' },
};
const MAX_CONTINUE = 3; // lanjutan saat stop_reason pause_turn

const ROLE = { owner: 'Owner', lead: 'Kepala divisi', staff: 'Staff', viewer: 'Viewer' } as Record<string, string>;
const wib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

type Sb = ReturnType<typeof createClient>;

async function colonyData(sb: Sb, me: { name: string; role: string; primary_dept: string }) {
  const [staff, approvals, tasks, activity] = await Promise.all([
    sb.from('hc_profiles').select('name, role, primary_dept').order('created_at').limit(50),
    sb.from('hc_approvals').select('title, requested_by, status, created_at').eq('status', 'pending').limit(20),
    sb.from('hc_plan_tasks').select('title, who, col').neq('col', 'done').limit(30),
    sb.from('hc_activity').select('text, created_at').order('created_at', { ascending: false }).limit(15),
  ]);
  const list = (rows: unknown[] | null, fmt: (r: any) => string) => (rows && rows.length ? rows.map((r) => `- ${fmt(r)}`).join('\n') : '- (kosong)');
  const now = wib(new Date().toISOString());
  return `DATA KOLONI (diambil dari database saat ini, ${now} WIB)
Yang sedang bicara denganmu: ${me.name} (${ROLE[me.role] || me.role}, divisi ${me.primary_dept}).

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
  if (!jwt) return json({ error: 'not_logged_in' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await sb.auth.getUser(jwt);
  if (uErr || !u?.user) return json({ error: 'not_logged_in' }, 401);
  const { data: me } = await sb.from('hc_profiles').select('name, role, primary_dept').eq('id', u.user.id).maybeSingle();
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

  let context = await colonyData(sb, me);
  if (body?.mode === 'meeting') {
    const tx = Array.isArray(body?.transcript) ? body.transcript.slice(-MAX_TX_LINES) : [];
    const lines = tx.map((l: { who?: string; text?: string }) => `${String(l?.who ?? '?').slice(0, 40)}: ${String(l?.text ?? '').slice(0, 400)}`);
    context += `\n\nSITUASI: kamu sedang ikut rapat suara di Hive Hall dalam mode standby: kamu mendengarkan seluruh rapat dan baru bicara saat dipanggil. Peserta memanggilmu dengan menyebut namamu, lalu meminta saran, pendapat, ringkasan, atau riset. Jawabanmu dibacakan ke semua peserta, jadi buat ringkas (maks. 5 kalimat) dan beri saran yang konkret dan bisa langsung dijalankan, merujuk hal yang dibahas di transkrip.
Transkrip rapat terakhir:
${lines.length ? lines.join('\n') : '- (belum ada yang bicara)'}`;
  }

  const client = new Anthropic({ apiKey });
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
      res = await ask(messages, [WEB_SEARCH]);
    } catch (e) {
      // kalau alat pencarian ditolak untuk model/akun ini, tetap jawab tanpa riset
      if (e instanceof Anthropic.BadRequestError) {
        console.warn('web search tidak tersedia:', e.message);
        res = await ask(messages, []);
      } else throw e;
    }
    // pencarian panjang bisa berhenti di tengah (pause_turn): kirim ulang apa adanya, server melanjutkan
    for (let i = 0; res.stop_reason === 'pause_turn' && i < MAX_CONTINUE; i++) {
      res = await ask([...messages, { role: 'assistant', content: res.content }], [WEB_SEARCH]);
    }
    if (res.stop_reason === 'refusal') return json({ reply: 'Maaf, untuk pertanyaan itu saya tidak bisa membantu. Ada hal lain soal koloni?' });
    const texts = res.content.filter((b) => b.type === 'text') as { text: string; citations?: { url?: string; title?: string }[] | null }[];
    const reply = texts.map((b) => b.text).join('').trim();
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
    return json({ reply: reply || 'Hmm, saya belum punya jawaban. Coba tanyakan dengan cara lain?', sources, researched });
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
