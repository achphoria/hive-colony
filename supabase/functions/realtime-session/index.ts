// Edge Function: realtime-session
// Video call Hive Hall lewat Cloudflare Realtime (SFU + TURN), tanpa server sendiri.
// Browser tidak pernah memegang kunci Cloudflare: semua panggilan SFU lewat fungsi ini, dan fungsi ini
// hanya menjalankan operasi yang sudah divalidasi (bukan proxy bebas ke API SFU).
//
// Secrets (Supabase Edge Function Secrets, tidak pernah dikirim ke browser):
//   CLOUDFLARE_REALTIME_APP_ID, CLOUDFLARE_REALTIME_APP_TOKEN   -> Realtime SFU app
//   CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_KEY_API_TOKEN      -> TURN key (kredensial TURN sementara)
//
// Aksi (POST JSON, wajib login sebagai staff Hive Colony non-viewer, dan rapat harus sedang berjalan):
//   { action: 'ice', meeting_id }                                   -> { iceServers }
//   { action: 'push', meeting_id, offer, tracks: [{ mid, trackName }] }
//        -> sesi publikasi baru + publish track: { sessionId, token, sig, answer, tracks }
//   { action: 'pull', meeting_id, sessionId?, token?, tracks: [{ sessionId, trackName, sig }] }
//        -> (sesi penerima baru bila belum ada) + pull track: { sessionId, token, offer, tracks }
//   { action: 'renegotiate', meeting_id, sessionId, token, answer } -> { ok }
//   { action: 'close', meeting_id, sessionId, token, mids, offer? } -> { answer?, tracks }
//   { action: 'update', meeting_id, sessionId, token, tracks: [{ mid, sessionId, trackName, sig, preferredRid }] }
//        -> ganti lapisan simulcast yang saya terima (tile kecil / koneksi lemah = resolusi turun)
//   { action: 'kick', meeting_id, user_id }                          -> owner: keluarkan peserta dari rapat
//
// Otorisasi tanpa tabel: setiap sesi SFU diberi token HMAC yang terikat ke (user, rapat, sesi). Hanya
// pemilik token yang bisa mengubah sesinya. Track orang lain hanya bisa di-pull dengan "sig" yang
// terikat ke (rapat, sesi publikasi), dan sig itu hanya diberikan ke peserta rapat yang sama.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SFU = Deno.env.get('CLOUDFLARE_REALTIME_API_URL') || 'https://rtc.live.cloudflare.com/v1'; // bisa diganti untuk uji lokal
const TURN_TTL_SEC = 4 * 60 * 60; // kredensial TURN: rapat terpanjang yang wajar (maks. Cloudflare 48 jam)
const TRACK_NAMES = /^(mic|cam|screen)(-[a-z0-9]{1,8})?$/; // share screen ke-n memakai nama baru
const RIDS = /^[abc]$/; // lapisan simulcast kamera: a = penuh, b = 1/2, c = 1/4
const SESSION_RE = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_TRACKS = 32;
const MAX_SDP = 200_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Kunci HMAC diturunkan dari APP_TOKEN, jadi tidak perlu secret tambahan.
let hmacKey: CryptoKey | null = null;
async function sign(text: string) {
  if (!hmacKey) {
    const raw = await crypto.subtle.digest('SHA-256', enc.encode(`hive-realtime-session:${Deno.env.get('CLOUDFLARE_REALTIME_APP_TOKEN')}`));
    hmacKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(text)))).slice(0, 43);
}
// perbandingan waktu-konstan
function same(a: string, b: string) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const ownToken = (uid: string, meetingId: string, sessionId: string) => sign(`own|${uid}|${meetingId}|${sessionId}`);
const pubSig = (meetingId: string, sessionId: string) => sign(`pub|${meetingId}|${sessionId}`);

async function sfu(path: string, method: string, body?: unknown) {
  const appId = Deno.env.get('CLOUDFLARE_REALTIME_APP_ID');
  const res = await fetch(`${SFU}/apps/${appId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${Deno.env.get('CLOUDFLARE_REALTIME_APP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.errorCode) {
    console.error('sfu', method, path, res.status, data?.errorCode, data?.errorDescription);
    throw new HttpError(res.status === 410 ? 410 : 502, data?.errorCode || `sfu_${res.status}`);
  }
  return data;
}

function sdp(v: unknown, type: 'offer' | 'answer') {
  const s = v as { type?: string; sdp?: string } | null;
  if (!s || s.type !== type || typeof s.sdp !== 'string' || !s.sdp.startsWith('v=0') || s.sdp.length > MAX_SDP) throw new HttpError(400, `bad_${type}`);
  return { type, sdp: s.sdp };
}
const sessionIdOf = (v: unknown) => {
  if (typeof v !== 'string' || !SESSION_RE.test(v)) throw new HttpError(400, 'bad_session');
  return v;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    return json(await handle(req));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code }, e.status);
    console.error('realtime-session', e);
    return json({ error: 'server_error' }, 500);
  }
});

async function handle(req: Request) {
  if (!Deno.env.get('CLOUDFLARE_REALTIME_APP_ID') || !Deno.env.get('CLOUDFLARE_REALTIME_APP_TOKEN')) throw new HttpError(500, 'realtime_not_configured');

  // 1) siapa yang meminta (sesi Supabase miliknya, tunduk RLS)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'not_logged_in');
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await sb.auth.getUser(jwt);
  if (uErr || !u?.user) throw new HttpError(401, 'not_logged_in');
  const uid = u.user.id;
  const { data: prof } = await sb.from('hc_profiles').select('role').eq('id', uid).maybeSingle();
  if (!prof) throw new HttpError(403, 'not_hive_staff');
  if (prof.role === 'viewer') throw new HttpError(403, 'viewer_cannot_join');

  // 2) akses ke rapat: rapat harus ada dan masih berjalan
  const body = await req.json().catch(() => ({}));
  const meetingId = String(body?.meeting_id ?? '');
  if (!/^[0-9a-f-]{36}$/.test(meetingId)) throw new HttpError(400, 'bad_meeting');
  const { data: meeting } = await sb.from('hc_meetings').select('id, status').eq('id', meetingId).maybeSingle();
  if (!meeting) throw new HttpError(404, 'bad_meeting');
  if (meeting.status !== 'live') throw new HttpError(409, 'meeting_not_live');
  // peserta yang sudah dikeluarkan host tidak bisa memakai server video lagi di rapat ini
  const { data: kicked } = await sb.from('hc_meeting_participants').select('presence_key').eq('meeting_id', meetingId).eq('user_id', uid).not('kicked_at', 'is', null).limit(1);
  if (kicked?.length) throw new HttpError(403, 'kicked');

  const own = async () => {
    const sessionId = sessionIdOf(body?.sessionId);
    if (!same(String(body?.token ?? ''), await ownToken(uid, meetingId, sessionId))) throw new HttpError(403, 'not_your_session');
    return sessionId;
  };

  // track remote yang boleh diambil: sig membuktikan sesi publikasinya didaftarkan untuk rapat ini
  const remote = async (t: { sessionId?: unknown; trackName?: unknown; sig?: unknown }) => {
    const pub = sessionIdOf(t?.sessionId);
    if (typeof t?.trackName !== 'string' || !TRACK_NAMES.test(t.trackName)) throw new HttpError(400, 'bad_track');
    if (!same(String(t?.sig ?? ''), await pubSig(meetingId, pub))) throw new HttpError(403, 'track_not_in_meeting');
    return { location: 'remote', sessionId: pub, trackName: t.trackName as string };
  };
  const simulcast = (rid: unknown) =>
    typeof rid === 'string' && RIDS.test(rid) ? { simulcast: { preferredRid: rid, priorityOrdering: 'asciibetical', ridNotAvailable: 'asciibetical' } } : {};

  switch (body?.action) {
    case 'ice':
      return { iceServers: await iceServers() };

    case 'push': {
      const offer = sdp(body.offer, 'offer');
      const list = Array.isArray(body.tracks) ? body.tracks.slice(0, 3) : [];
      const tracks = list.map((t: { mid?: unknown; trackName?: unknown }) => {
        if (typeof t?.mid !== 'string' || !/^\w{1,16}$/.test(t.mid) || typeof t?.trackName !== 'string' || !TRACK_NAMES.test(t.trackName)) throw new HttpError(400, 'bad_track');
        return { location: 'local', mid: t.mid, trackName: t.trackName };
      });
      if (!tracks.length) throw new HttpError(400, 'bad_track');
      // tanpa sessionId: sesi publikasi baru; dengan sessionId+token: tambah track ke sesi saya (mis. share screen)
      const sessionId = body.sessionId ? await own() : (await sfu('/sessions/new', 'POST')).sessionId;
      const r = await sfu(`/sessions/${sessionId}/tracks/new`, 'POST', { sessionDescription: offer, tracks });
      return {
        sessionId,
        token: await ownToken(uid, meetingId, sessionId),
        sig: await pubSig(meetingId, sessionId),
        answer: r.sessionDescription,
        tracks: (r.tracks ?? []).map((t: Record<string, unknown>) => ({ mid: t.mid, trackName: t.trackName, error: t.errorCode || null })),
      };
    }

    case 'pull': {
      const list = Array.isArray(body.tracks) ? body.tracks.slice(0, MAX_TRACKS) : [];
      const tracks = [];
      for (const t of list) tracks.push({ ...(await remote(t)), ...simulcast(t?.preferredRid) });
      if (!tracks.length) throw new HttpError(400, 'bad_track');
      const sessionId = body.sessionId ? await own() : (await sfu('/sessions/new', 'POST')).sessionId;
      const r = await sfu(`/sessions/${sessionId}/tracks/new`, 'POST', { tracks });
      return {
        sessionId,
        token: await ownToken(uid, meetingId, sessionId),
        offer: r.requiresImmediateRenegotiation ? r.sessionDescription : null,
        tracks: (r.tracks ?? []).map((t: Record<string, unknown>) => ({ mid: t.mid, sessionId: t.sessionId, trackName: t.trackName, error: t.errorCode || null })),
      };
    }

    case 'renegotiate': {
      const sessionId = await own();
      await sfu(`/sessions/${sessionId}/renegotiate`, 'PUT', { sessionDescription: sdp(body.answer, 'answer') });
      return { ok: true };
    }

    case 'close': {
      const sessionId = await own();
      const mids = (Array.isArray(body.mids) ? body.mids : []).filter((m: unknown) => typeof m === 'string' && /^\w{1,16}$/.test(m)).slice(0, MAX_TRACKS);
      if (!mids.length) return { tracks: [] };
      // dengan offer: tutup lewat negosiasi; tanpa offer: hentikan paksa (mis. saat keluar)
      const offer = body.offer ? sdp(body.offer, 'offer') : null;
      const r = await sfu(`/sessions/${sessionId}/tracks/close`, 'PUT', {
        tracks: mids.map((mid: string) => ({ mid })),
        ...(offer ? { sessionDescription: offer, force: false } : { force: true }),
      });
      return { answer: r.sessionDescription ?? null, tracks: (r.tracks ?? []).map((t: Record<string, unknown>) => ({ mid: t.mid, error: t.errorCode || null })) };
    }

    case 'update': {
      const sessionId = await own();
      const list = Array.isArray(body.tracks) ? body.tracks.slice(0, MAX_TRACKS) : [];
      const tracks = [];
      for (const t of list) {
        if (typeof t?.mid !== 'string' || !/^\w{1,16}$/.test(t.mid) || !RIDS.test(String(t?.preferredRid))) throw new HttpError(400, 'bad_track');
        tracks.push({ ...(await remote(t)), mid: t.mid, ...simulcast(t.preferredRid) });
      }
      if (!tracks.length) return { tracks: [] };
      const r = await sfu(`/sessions/${sessionId}/tracks/update`, 'PUT', { tracks });
      return { tracks: (r.tracks ?? []).map((t: Record<string, unknown>) => ({ mid: t.mid, error: t.errorCode || null })) };
    }

    case 'kick': {
      if (prof.role !== 'owner') throw new HttpError(403, 'owner_only');
      const target = String(body?.user_id ?? '');
      if (!/^[0-9a-f-]{36}$/.test(target) || target === uid) throw new HttpError(400, 'bad_user');
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
      const { data: rows } = await admin
        .from('hc_meeting_participants')
        .update({ kicked_at: new Date().toISOString(), left_at: new Date().toISOString() })
        .eq('meeting_id', meetingId)
        .eq('user_id', target)
        .select('pub_session');
      if (!rows?.length) {
        // belum pernah tercatat (mis. baru di layar preview): catat supaya tidak bisa masuk
        await admin.from('hc_meeting_participants').insert({ meeting_id: meetingId, presence_key: `kicked:${target}`, user_id: target, name: 'Dikeluarkan', kicked_at: new Date().toISOString(), left_at: new Date().toISOString() });
      }
      // hentikan paksa semua track yang ia publish, supaya peserta lain langsung berhenti menerimanya
      let closed = 0;
      for (const r of rows ?? []) {
        if (!r.pub_session || !SESSION_RE.test(r.pub_session)) continue;
        const state = await sfu(`/sessions/${r.pub_session}`, 'GET').catch(() => null);
        const mids = (state?.tracks ?? []).filter((t: { location?: string; status?: string; mid?: string }) => t.location === 'local' && t.status !== 'inactive' && t.mid).map((t: { mid: string }) => ({ mid: t.mid }));
        if (!mids.length) continue;
        await sfu(`/sessions/${r.pub_session}/tracks/close`, 'PUT', { tracks: mids, force: true }).catch(() => null);
        closed += mids.length;
      }
      return { ok: true, closed };
    }

    default:
      throw new HttpError(400, 'bad_action');
  }
}

// STUN publik Cloudflare selalu ada; TURN hanya kalau TURN key sudah dipasang.
async function iceServers() {
  const stun = { urls: ['stun:stun.cloudflare.com:3478'] };
  const id = Deno.env.get('CLOUDFLARE_TURN_KEY_ID');
  const token = Deno.env.get('CLOUDFLARE_TURN_KEY_API_TOKEN');
  if (!id || !token) return [stun];
  const res = await fetch(`${SFU}/turn/keys/${id}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TURN_TTL_SEC }),
  });
  if (!res.ok) {
    console.error('turn', res.status);
    return [stun];
  }
  const data = await res.json().catch(() => ({}));
  // port 53 diblokir browser dan hanya membuat ICE menunggu timeout
  return (data.iceServers ?? [stun]).map((s: { urls: string | string[] }) => ({
    ...s,
    urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((url) => !/:53(\?|$)/.test(url)),
  }));
}
