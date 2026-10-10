// Edge Function: livekit-token
// Memberi "tiket masuk" ruang suara Hive Hall (LiveKit) untuk staff Hive Colony yang sudah login.
// Rahasia LiveKit dibaca dari Supabase Edge Function Secrets dan TIDAK pernah dikirim ke browser.
//   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ROOM = 'hive-hall';
const TTL_SEC = 2 * 60 * 60; // tiket berlaku 2 jam

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();

// Token akses LiveKit = JWT HS256 (iss = API key, sub = identitas peserta, video = izin ruang)
async function livekitToken(key: string, secret: string, claims: Record<string, unknown>) {
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(enc.encode(JSON.stringify({ iss: key, nbf: now - 10, exp: now + TTL_SEC, ...claims })));
  const hmac = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', hmac, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('LIVEKIT_URL');
  const key = Deno.env.get('LIVEKIT_API_KEY');
  const secret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !key || !secret) return json({ error: 'livekit_not_configured' }, 500);

  // Pastikan yang meminta adalah staff yang login (pakai sesi Supabase miliknya, tunduk RLS)
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'not_logged_in' }, 401);
  const uid = userData.user.id;

  const { data: prof } = await sb.from('hc_profiles').select('name, role, primary_dept, avatar').eq('id', uid).maybeSingle();
  if (!prof) return json({ error: 'not_hive_staff' }, 403);
  if (prof.role === 'viewer') return json({ error: 'viewer_cannot_join' }, 403);

  const token = await livekitToken(key, secret, {
    sub: uid,
    name: prof.name,
    metadata: JSON.stringify({ role: prof.role, dept: prof.primary_dept, color: prof.avatar?.outfitColor ?? null }),
    video: { room: ROOM, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  });

  return json({ token, url, room: ROOM });
});
