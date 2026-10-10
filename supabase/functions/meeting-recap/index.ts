// Edge Function: meeting-recap
// Menutup rapat Hive Hall lalu Queen Bea (Claude) membuat notulen (MoM) dan laporan dari transkrip.
//   POST { meeting_id }               -> akhiri rapat yang masih berjalan + buat notulen
//   POST { meeting_id, retry: true }  -> owner: buat ulang notulen yang gagal
// Siapa yang boleh mengakhiri: owner kapan saja; staff lain hanya jika ruang suara sudah kosong
// (dia peserta terakhir / semua sudah pergi). Penulisan memakai service role di server.
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const MODEL = 'claude-haiku-5-5';
const ROOM = 'hive-hall';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();
async function lkToken(key: string, secret: string, claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64url(enc.encode(JSON.stringify({ iss: key, nbf: now - 10, exp: now + 60, ...claims })));
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${h}.${p}.${b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(`${h}.${p}`))))}`;
}

// identitas peserta yang masih ada di ruang suara LiveKit (null = tidak bisa dicek)
async function voiceParticipants(): Promise<string[] | null> {
  const url = Deno.env.get('LIVEKIT_URL');
  const key = Deno.env.get('LIVEKIT_API_KEY');
  const secret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !key || !secret) return null;
  const token = await lkToken(key, secret, { sub: 'hive-recap', video: { room: ROOM, roomAdmin: true, roomList: true } });
  const res = await fetch(`${url.replace(/^ws/, 'http').replace(/\/+$/, '')}/twirp/livekit.RoomService/ListParticipants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: ROOM }),
  });
  if (res.status === 404) return [];
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return (data.participants ?? []).map((p: { identity: string }) => p.identity);
}

const MOM_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    topics: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    action_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { task: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string' } },
        required: ['task', 'owner', 'due'],
        additionalProperties: false,
      },
    },
    report: { type: 'string' },
  },
  required: ['summary', 'topics', 'decisions', 'action_items', 'report'],
  additionalProperties: false,
};

const RECAP_PROMPT = `Kamu adalah Queen Bea, Chief Executive Hive Colony (bisnis gym/HYROX, F&B, dan retail). Kamu wajib membuat notulen setiap rapat.
Dari transkrip rapat di bawah, buat dalam Bahasa Indonesia:
- summary: ringkasan rapat 2-4 kalimat.
- topics: topik yang dibahas (pendek-pendek).
- decisions: keputusan yang benar-benar disepakati. Kosongkan jika tidak ada.
- action_items: tugas tindak lanjut. owner = nama orang yang disebut bertanggung jawab, atau "Belum ditentukan". due = tenggat yang disebut, atau "Belum ditentukan".
- report: laporan rapat untuk atasan dalam 2-4 paragraf teks biasa (tanpa markdown): latar, pembahasan utama, keputusan, tindak lanjut, dan catatan risiko bila ada.
Aturan: hanya pakai isi transkrip. Jangan mengarang nama, angka, atau keputusan. Transkrip berasal dari pengenal suara otomatis, jadi abaikan salah ketik kecil dan pahami maksudnya. Kalau transkrip sangat pendek, katakan apa adanya.`;

const wib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(11, 16);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_logged_in' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await asUser.auth.getUser(jwt);
  if (uErr || !u?.user) return json({ error: 'not_logged_in' }, 401);
  const { data: me } = await asUser.from('hc_profiles').select('name, role').eq('id', u.user.id).maybeSingle();
  if (!me) return json({ error: 'not_hive_staff' }, 403);

  const body = await req.json().catch(() => ({}));
  const id = String(body?.meeting_id ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'bad_meeting' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: meeting } = await admin.from('hc_meetings').select('*').eq('id', id).maybeSingle();
  if (!meeting) return json({ error: 'bad_meeting' }, 404);

  // 1) tutup rapat (atomik: hanya satu pemanggil yang berhasil)
  if (body?.retry) {
    if (me.role !== 'owner') return json({ error: 'owner_only' }, 403);
    if (meeting.status !== 'failed') return json({ status: meeting.status });
    await admin.from('hc_meetings').update({ status: 'summarizing', error: null }).eq('id', id).eq('status', 'failed');
  } else {
    if (meeting.status !== 'live') return json({ status: meeting.status });
    if (me.role !== 'owner') {
      const left = await voiceParticipants();
      if (left === null || left.some((p) => p !== u.user.id)) return json({ error: 'meeting_still_running' }, 409);
    }
    const { data: closed } = await admin
      .from('hc_meetings')
      .update({ status: 'summarizing', ended_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'live')
      .select('id');
    if (!closed?.length) return json({ status: 'summarizing' });
  }

  // 2) notulen dibuat di latar belakang server: tetap selesai walau peserta menutup tab
  EdgeRuntime.waitUntil(summarize(admin, meeting));
  return json({ status: 'summarizing' });
});

type Admin = ReturnType<typeof createClient>;

async function summarize(admin: Admin, meeting: { id: string; title: string; started_at: string; ended_at: string | null }) {
  const id = meeting.id;
  const { data: lines } = await admin
    .from('hc_meeting_lines')
    .select('speaker_name, kind, text, created_at')
    .eq('meeting_id', id)
    .order('created_at')
    .limit(1500);
  const all = lines ?? [];
  const participants = [...new Set(all.filter((l) => l.kind !== 'ai').map((l) => l.speaker_name))];
  const speech = all.filter((l) => l.kind === 'speech' || l.kind === 'ai');

  const finish = async (patch: Record<string, unknown>) => {
    await admin.from('hc_meetings').update({ participants, ...patch }).eq('id', id);
    if (patch.status === 'done') {
      await admin.from('hc_activity').insert({ kind: 'meeting', dept: 'ceo', text: `Queen Bea menyelesaikan notulen rapat "${meeting.title}"` });
    }
  };

  if (!speech.length) {
    const mom = { summary: 'Rapat berlangsung tanpa percakapan yang tercatat di transkrip.', topics: [], decisions: [], action_items: [] };
    await finish({ status: 'done', mom, report: `Rapat "${meeting.title}" dibuka, tetapi tidak ada percakapan yang tertranskrip, sehingga belum ada pembahasan, keputusan, atau tindak lanjut yang bisa dilaporkan.` });
    return;
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    await finish({ status: 'failed', error: 'Kunci API Anthropic belum dipasang.' });
    return;
  }

  // transkrip dipotong dari belakang supaya muat (~60 ribu karakter)
  let tx = speech.map((l) => `[${wib(l.created_at)}] ${l.kind === 'ai' ? 'Queen Bea (AI)' : l.speaker_name}: ${l.text}`);
  while (tx.join('\n').length > 60000) tx = tx.slice(1);
  const endMs = meeting.ended_at ? new Date(meeting.ended_at).getTime() : Date.now();
  const durMin = Math.max(1, Math.round((endMs - new Date(meeting.started_at).getTime()) / 60000));

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: MOM_SCHEMA } },
      system: RECAP_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Judul rapat: ${meeting.title}\nDurasi: sekitar ${durMin} menit\nPeserta: ${participants.join(', ') || '-'}\n\nTranskrip:\n${tx.join('\n')}`,
        },
      ],
    });
    if (res.stop_reason === 'refusal') throw new Error('Claude menolak membuat notulen untuk transkrip ini.');
    const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    const out = JSON.parse(text);
    const { report, ...mom } = out;
    await finish({ status: 'done', mom, report });
  } catch (e) {
    console.error('recap error', e);
    const msg = e instanceof Anthropic.APIError ? `Claude API error ${e.status}` : String((e as Error)?.message || e).slice(0, 200);
    await finish({ status: 'failed', error: msg });
  }
}
