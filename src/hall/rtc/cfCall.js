// Video call lewat Cloudflare Realtime SFU (tanpa server sendiri).
// Setiap peserta punya dua koneksi WebRTC ke SFU, mengikuti contoh video-room Cloudflare:
//   - publikasi (sendonly): mic, kamera (simulcast 3 lapis), dan share screen
//   - penerima (recvonly): track peserta lain yang saya pull
// Semua panggilan API SFU lewat Edge Function "realtime-session" (kunci Cloudflare tidak ada di browser).
// Siapa sedang di room dan track apa yang ia publish dibagikan lewat Supabase Realtime Presence;
// perintah host (mute/keluarkan) dan chat lewat broadcast di kanal yang sama.
// Catatan peserta disimpan di hc_meeting_participants, chat di hc_meeting_lines (kind 'chat').
import { supabase } from '../../lib/supabase';

const ERR = {
  not_logged_in: 'Sesi login habis. Silakan login ulang.',
  not_hive_staff: 'Akun ini belum terdaftar sebagai staff Hive Colony.',
  viewer_cannot_join: 'Akun viewer tidak bisa ikut video call.',
  realtime_not_configured: 'Server video belum dikonfigurasi (secret Cloudflare Realtime belum diisi).',
  meeting_not_live: 'Rapat ini sudah selesai.',
  bad_meeting: 'Rapat tidak ditemukan.',
  kicked: 'Anda sudah dikeluarkan dari rapat ini oleh host.',
  owner_only: 'Hanya host (owner) yang bisa melakukan ini.',
};

const CONNECT_TIMEOUT_MS = 15000;
const GATHER_TIMEOUT_MS = 2500;
const NET_EVERY_MS = 3000;
const LEVEL_EVERY_MS = 200;
const HEARTBEAT_MS = 60000;
const MAX_RECONNECT = 3;
// kamera: tiga lapis simulcast; penerima memilih lapis sesuai ukuran tile & kondisi jaringan
const CAM_LAYERS = [
  { rid: 'a', maxBitrate: 900_000, maxFramerate: 24 },
  { rid: 'b', scaleResolutionDownBy: 2, maxBitrate: 300_000, maxFramerate: 24 },
  { rid: 'c', scaleResolutionDownBy: 4, maxBitrate: 100_000, maxFramerate: 15 },
];
const RID_ORDER = ['a', 'b', 'c'];
const lower = (rid) => RID_ORDER[Math.min(RID_ORDER.length - 1, RID_ORDER.indexOf(rid) + 1)];

async function api(meetingId, action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('realtime-session', { body: { action, meeting_id: meetingId, ...payload } });
  if (error) {
    let code = '';
    try {
      code = (await error.context.json()).error;
    } catch {
      /* bukan JSON */
    }
    const e = new Error(ERR[code] || `Server video menolak permintaan (${code || 'jaringan'}).`);
    e.code = code;
    throw e;
  }
  return data;
}

// Kumpulkan kandidat ICE sebelum SDP dikirim (tanpa trickle ICE), dibatasi waktu.
function gathered(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const t = setTimeout(done, GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

function connected(pc) {
  if (pc.connectionState === 'connected') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = (fn) => {
      clearTimeout(t);
      pc.removeEventListener('connectionstatechange', check);
      fn();
    };
    const check = () => {
      if (pc.connectionState === 'connected') done(resolve);
      else if (pc.connectionState === 'failed') done(() => reject(new Error('Koneksi ke server video gagal. Cek jaringan lalu coba lagi.')));
    };
    const t = setTimeout(() => done(() => reject(new Error('Koneksi ke server video terlalu lama.'))), CONNECT_TIMEOUT_MS);
    pc.addEventListener('connectionstatechange', check);
  });
}

// Satu antrean per sesi SFU: operasi berikutnya baru jalan setelah pertukaran SDP sebelumnya selesai.
function queue() {
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => {});
    return run;
  };
}

const offerOf = (pc) => ({ type: 'offer', sdp: pc.localDescription.sdp });
const answerOf = (pc) => ({ type: 'answer', sdp: pc.localDescription.sdp });

// Daftar perangkat untuk layar preview; label baru terisi setelah izin kamera/mic diberikan.
export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const pick = (kind) => all.filter((d) => d.kind === kind && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `${kind === 'audioinput' ? 'Mikrofon' : kind === 'videoinput' ? 'Kamera' : 'Speaker'} ${i + 1}` }));
  return { audioIn: pick('audioinput'), videoIn: pick('videoinput'), audioOut: pick('audiooutput') };
}
export const canShareScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
export const canPickSpeaker = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

// onChange(snapshot): perubahan untuk UI. onLevels({ me, [peerKey] }): level suara 0..1 (5x per detik).
// onEvent({ t: 'chat' | 'muted' | 'kicked' | 'joined' | 'left', ... }): kejadian untuk notifikasi/chat.
export function createCfCall({ meetingId, me, onChange, onLevels, onEvent }) {
  const key = `${me.id}:${Math.random().toString(36).slice(2, 8)}`; // satu orang boleh dua tab
  let iceServers = null;
  let local = null; // MediaStream mic + kamera saya
  let screen = null; // MediaStream share screen saya
  let pubPc = null;
  let pub = null; // { sessionId, token, sig, tracks: { mic, cam, screen? } }
  const tx = {}; // transceiver publikasi: { mic, cam, screen }
  let subPc = null;
  let sub = null; // { sessionId, token }
  let pubQueue = queue();
  let subQueue = queue();
  const midToLoc = new Map(); // mid penerima -> "pubSession/trackName"
  const pulled = new Map(); // "pubSession/trackName" -> { mid, key, trackName, rid }
  const peers = new Map(); // presenceKey -> { key, uid, name, role, mic, cam, screen, net, pub, stream, screenStream }
  const wantRid = new Map(); // presenceKey -> lapis yang diinginkan UI ('a' | 'b' | 'c')
  let channel = null;
  let state = 'idle'; // idle | connecting | on | reconnecting | error | left | kicked
  let error = '';
  let micOn = true;
  let camOn = true;
  let net = 'good';
  let timers = [];
  let reconnects = 0;
  let audioCtx = null;
  let localMeter = null;
  let screenSeq = 0;
  const statsPrev = { lost: 0, recv: 0 };
  let weakStreak = 0;
  let goodStreak = 0;
  let topLayerOff = false;

  const snapshot = () => ({
    state,
    error,
    local,
    screen,
    micOn,
    camOn,
    screenOn: !!screen,
    net,
    key,
    peers: [...peers.values()].map((p) => ({ key: p.key, uid: p.uid, name: p.name, role: p.role, mic: p.mic, cam: p.cam, screen: p.screen, net: p.net, stream: p.stream, screenStream: p.screenStream })),
  });
  const emit = () => onChange?.(snapshot());
  const fail = (e) => {
    if (state === 'left' || state === 'kicked') return;
    state = 'error';
    error = e?.message || String(e);
    emit();
  };

  /* ---------- perangkat ---------- */
  const devices = { audioIn: null, videoIn: null };
  const audioConstraint = () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(devices.audioIn ? { deviceId: { exact: devices.audioIn } } : {}) });
  const videoConstraint = () => ({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, ...(devices.videoIn ? { deviceId: { exact: devices.videoIn } } : {}) });

  async function captureMedia() {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: audioConstraint(), video: videoConstraint() });
    } catch (e) {
      // tanpa kamera (atau izin kamera ditolak): tetap ikut dengan suara saja
      const s = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint() }).catch(() => null);
      if (!s) throw new Error(e?.name === 'NotAllowedError' ? 'Izin mikrofon dan kamera ditolak. Izinkan di pengaturan browser lalu coba lagi.' : 'Mikrofon tidak bisa dipakai. Cek izin browser dan perangkat audio.');
      camOn = false;
      return s;
    }
  }

  function meterLocal() {
    const track = local?.getAudioTracks()[0];
    if (!track) return;
    try {
      audioCtx = audioCtx || new AudioContext();
      const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      localMeter = () => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        return Math.min(1, Math.sqrt(sum / buf.length) * 4);
      };
    } catch {
      localMeter = null;
    }
  }

  async function switchDevice(kind, deviceId) {
    devices[kind === 'audio' ? 'audioIn' : 'videoIn'] = deviceId || null;
    if (!local) return;
    const fresh = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: audioConstraint() } : { video: videoConstraint() });
    const track = fresh.getTracks()[0];
    const old = kind === 'audio' ? local.getAudioTracks()[0] : local.getVideoTracks()[0];
    track.enabled = kind === 'audio' ? micOn : camOn;
    const t = tx[kind === 'audio' ? 'mic' : 'cam'];
    if (t) await t.sender.replaceTrack(track);
    local = new MediaStream([...local.getTracks().filter((x) => x !== old), track]);
    old?.stop();
    if (kind === 'video' && !old) camOn = true;
    if (kind === 'audio') meterLocal();
    emit();
  }

  /* ---------- publikasi ---------- */
  async function publish() {
    pubPc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
    const want = [];
    const audio = local.getAudioTracks()[0];
    const video = local.getVideoTracks()[0];
    if (audio) want.push(['mic', (tx.mic = pubPc.addTransceiver(audio, { direction: 'sendonly' }))]);
    if (video) want.push(['cam', (tx.cam = pubPc.addTransceiver(video, { direction: 'sendonly', sendEncodings: CAM_LAYERS.map((l) => ({ ...l })) }))]);
    await pubPc.setLocalDescription(await pubPc.createOffer());
    await gathered(pubPc);
    const r = await api(meetingId, 'push', { offer: offerOf(pubPc), tracks: want.map(([trackName, t]) => ({ mid: t.mid, trackName })) });
    await pubPc.setRemoteDescription(r.answer);
    pub = { sessionId: r.sessionId, token: r.token, sig: r.sig, tracks: Object.fromEntries(r.tracks.filter((t) => !t.error).map((t) => [t.trackName, t.trackName])) };
    await connected(pubPc);
    watchPc(pubPc);
  }

  async function startScreen() {
    if (screen || !pubPc || !pub) return;
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 15 } }, audio: false });
    const track = s.getVideoTracks()[0];
    track.contentHint = 'detail';
    screen = s;
    emit();
    track.addEventListener('ended', () => stopScreen());
    const trackName = `screen-${++screenSeq}`;
    try {
      await pubQueue(async () => {
        tx.screen = pubPc.addTransceiver(track, { direction: 'sendonly', sendEncodings: [{ maxBitrate: 1_500_000, maxFramerate: 15 }] });
        await pubPc.setLocalDescription(await pubPc.createOffer());
        await gathered(pubPc);
        const r = await api(meetingId, 'push', { sessionId: pub.sessionId, token: pub.token, offer: offerOf(pubPc), tracks: [{ mid: tx.screen.mid, trackName }] });
        await pubPc.setRemoteDescription(r.answer);
        if (r.tracks.some((t) => t.error)) throw new Error('Share screen ditolak server video.');
        pub.tracks.screen = trackName;
      });
      announce();
    } catch (e) {
      s.getTracks().forEach((t) => t.stop());
      screen = null;
      emit();
      throw e;
    }
  }

  async function stopScreen() {
    if (!screen) return;
    const s = screen;
    screen = null;
    s.getTracks().forEach((t) => t.stop());
    delete pub?.tracks.screen;
    announce();
    const t = tx.screen;
    tx.screen = null;
    if (!t || !pubPc) return;
    await pubQueue(async () => {
      t.stop();
      await pubPc.setLocalDescription(await pubPc.createOffer());
      await gathered(pubPc);
      const r = await api(meetingId, 'close', { sessionId: pub.sessionId, token: pub.token, mids: [t.mid], offer: offerOf(pubPc) });
      if (r.answer) await pubPc.setRemoteDescription(r.answer);
    }).catch(async () => {
      if (pubPc?.signalingState === 'have-local-offer') await pubPc.setLocalDescription({ type: 'rollback' }).catch(() => {});
    });
  }

  /* ---------- menerima track peserta lain ---------- */
  function ensureSubPc() {
    if (subPc) return;
    subPc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
    subPc.addEventListener('track', (e) => {
      const loc = midToLoc.get(e.transceiver.mid);
      const info = loc && pulled.get(loc);
      const p = info && peers.get(info.key);
      if (!p) return;
      if (info.trackName.startsWith('screen')) p.screenStream = new MediaStream([e.track]);
      else p.stream = new MediaStream([...(p.stream?.getTracks() || []).filter((t) => t.kind !== e.track.kind), e.track]);
      emit();
    });
    subPc.addEventListener('connectionstatechange', () => subPc?.connectionState === 'connected' && watchPc(subPc));
  }

  const ridFor = (peerKey) => {
    const want = wantRid.get(peerKey) || 'b';
    return net === 'weak' ? lower(want) : want;
  };

  async function pullTracks(list) {
    ensureSubPc();
    const r = await api(meetingId, 'pull', {
      ...(sub ? { sessionId: sub.sessionId, token: sub.token } : {}),
      tracks: list.map((x) => ({ sessionId: x.sessionId, trackName: x.trackName, sig: x.sig, ...(x.trackName === 'cam' ? { preferredRid: x.rid } : {}) })),
    });
    sub = { sessionId: r.sessionId, token: r.token };
    for (const t of r.tracks) {
      const loc = `${t.sessionId}/${t.trackName}`;
      const want = list.find((x) => `${x.sessionId}/${x.trackName}` === loc);
      if (!want) continue;
      if (t.error) {
        pulled.delete(loc);
        continue;
      }
      midToLoc.set(t.mid, loc);
      pulled.set(loc, { mid: t.mid, key: want.key, trackName: want.trackName, sessionId: want.sessionId, sig: want.sig, rid: want.rid });
    }
    if (!r.offer) return;
    await subPc.setRemoteDescription(r.offer);
    await subPc.setLocalDescription(await subPc.createAnswer());
    await gathered(subPc);
    await api(meetingId, 'renegotiate', { sessionId: sub.sessionId, token: sub.token, answer: answerOf(subPc) });
  }

  async function closeTracks(locs) {
    const items = locs.map((loc) => pulled.get(loc)).filter((v) => v?.mid);
    for (const loc of locs) pulled.delete(loc);
    const mids = items.map((v) => v.mid);
    if (!mids.length || !sub || !subPc) return;
    for (const mid of mids) midToLoc.delete(mid);
    try {
      for (const t of subPc.getTransceivers()) if (mids.includes(t.mid)) t.stop();
      await subPc.setLocalDescription(await subPc.createOffer());
      await gathered(subPc);
      const r = await api(meetingId, 'close', { sessionId: sub.sessionId, token: sub.token, mids, offer: offerOf(subPc) });
      if (r.answer) await subPc.setRemoteDescription(r.answer);
    } catch (e) {
      console.warn('tutup track gagal, dihentikan paksa', e);
      if (subPc?.signalingState === 'have-local-offer') await subPc.setLocalDescription({ type: 'rollback' }).catch(() => {});
      await api(meetingId, 'close', { sessionId: sub.sessionId, token: sub.token, mids }).catch(() => {});
    }
  }

  // ganti lapis simulcast yang diterima (tile berubah ukuran, atau jaringan melemah/membaik)
  function retune() {
    const changes = [];
    for (const v of pulled.values()) {
      if (v.trackName !== 'cam' || !v.mid) continue;
      const rid = ridFor(v.key);
      if (rid !== v.rid) changes.push({ v, rid });
    }
    if (!changes.length || !sub) return;
    for (const { v, rid } of changes) v.rid = rid;
    subQueue(() =>
      api(meetingId, 'update', {
        sessionId: sub.sessionId,
        token: sub.token,
        tracks: changes.map(({ v, rid }) => ({ mid: v.mid, sessionId: v.sessionId, trackName: v.trackName, sig: v.sig, preferredRid: rid })),
      }),
    ).catch((e) => console.warn('ganti kualitas gagal', e));
  }

  // Samakan track yang saya pull dengan daftar publikasi di presence.
  function reconcile() {
    if (state !== 'on' && state !== 'connecting') return;
    const want = new Map();
    for (const p of peers.values()) {
      if (!p.pub?.sessionId) continue;
      for (const trackName of Object.values(p.pub.tracks || {})) {
        want.set(`${p.pub.sessionId}/${trackName}`, { key: p.key, sessionId: p.pub.sessionId, trackName, sig: p.pub.sig, rid: ridFor(p.key) });
      }
    }
    const add = [...want.entries()].filter(([loc]) => !pulled.has(loc)).map(([, v]) => v);
    const drop = [...pulled.keys()].filter((loc) => !want.has(loc));
    for (const x of add) pulled.set(`${x.sessionId}/${x.trackName}`, { mid: null, key: x.key, trackName: x.trackName, pending: true });
    // share screen yang berhenti: lepaskan dari tampilan sekarang juga
    for (const loc of drop) {
      const v = pulled.get(loc);
      const p = v && peers.get(v.key);
      if (p && v.trackName.startsWith('screen')) p.screenStream = null;
    }
    const q = subQueue;
    if (add.length)
      q(() => (state === 'on' || state === 'connecting' ? pullTracks(add) : null)).catch((e) => {
        for (const x of add) if (pulled.get(`${x.sessionId}/${x.trackName}`)?.pending) pulled.delete(`${x.sessionId}/${x.trackName}`);
        console.warn('pull gagal', e);
      });
    if (drop.length) q(() => closeTracks(drop)).catch(() => {});
  }

  /* ---------- kondisi jaringan & level suara ---------- */
  function watchPc(pc) {
    if (pc.__watched) return;
    pc.__watched = true;
    let downAt = 0;
    pc.addEventListener('connectionstatechange', () => {
      if (pc !== pubPc && pc !== subPc) return;
      if (pc.connectionState === 'failed') reconnect();
      else if (pc.connectionState === 'disconnected') {
        downAt = Date.now();
        setTimeout(() => pc.connectionState === 'disconnected' && Date.now() - downAt >= 8000 && reconnect(), 8100);
      }
    });
  }

  async function checkNet() {
    if (!pubPc || state !== 'on') return;
    let rtt = 0;
    let aob = 0;
    let limited = false;
    let lost = 0;
    let recv = 0;
    try {
      (await pubPc.getStats()).forEach((s) => {
        if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') {
          rtt = s.currentRoundTripTime || 0;
          aob = s.availableOutgoingBitrate || 0;
        }
        if (s.type === 'outbound-rtp' && s.kind === 'video' && s.qualityLimitationReason === 'bandwidth') limited = true;
      });
      if (subPc)
        (await subPc.getStats()).forEach((s) => {
          if (s.type === 'inbound-rtp') {
            lost += s.packetsLost || 0;
            recv += s.packetsReceived || 0;
          }
        });
    } catch {
      return;
    }
    const dl = lost - statsPrev.lost;
    const dr = recv - statsPrev.recv;
    statsPrev.lost = lost;
    statsPrev.recv = recv;
    const loss = dl > 0 && dl + dr > 0 ? dl / (dl + dr) : 0;
    const weakNow = rtt > 0.45 || loss > 0.06 || (aob > 0 && aob < 250_000);
    // butuh dua kali berturut-turut lemah, dan ±15 detik baik untuk pulih, supaya tidak naik-turun terus
    weakStreak = weakNow ? weakStreak + 1 : 0;
    goodStreak = weakNow ? 0 : goodStreak + 1;
    const next = weakStreak >= 2 ? 'weak' : goodStreak >= 5 ? 'good' : net;
    // unggahan saya terbatas: matikan lapis kamera teratas, penerima otomatis turun ke lapis berikutnya
    if (tx.cam && (limited || next === 'weak') !== topLayerOff) {
      topLayerOff = limited || next === 'weak';
      const p = tx.cam.sender.getParameters();
      if (p.encodings?.[0]) {
        p.encodings[0].active = !topLayerOff;
        tx.cam.sender.setParameters(p).catch(() => {});
      }
    }
    if (next !== net) {
      net = next;
      announce();
      retune();
    }
  }

  function levels() {
    if (!onLevels) return;
    const out = { me: micOn && localMeter ? localMeter() : 0 };
    if (subPc)
      for (const t of subPc.getTransceivers()) {
        const loc = t.mid && midToLoc.get(t.mid);
        const v = loc && pulled.get(loc);
        if (!v || v.trackName !== 'mic') continue;
        const src = t.receiver.getSynchronizationSources?.()[0];
        out[v.key] = src ? Math.min(1, (src.audioLevel || 0) * 2) : 0;
      }
    onLevels(out);
  }

  /* ---------- presence, broadcast, catatan peserta ---------- */
  const presenceMeta = () => ({
    uid: me.id,
    name: me.name,
    role: me.role,
    mic: micOn,
    cam: camOn,
    screen: !!screen,
    net,
    pub: pub && { sessionId: pub.sessionId, sig: pub.sig, tracks: pub.tracks },
  });

  // beri tahu peserta lain (presence) dan catat di database
  function announce() {
    if (channel) channel.track(presenceMeta());
    if (pub && state === 'on')
      supabase
        .from('hc_meeting_participants')
        .update({ pub_session: pub.sessionId, tracks: pub.tracks, mic: micOn, cam: camOn, screen: !!screen, last_seen_at: new Date().toISOString() })
        .eq('meeting_id', meetingId)
        .eq('presence_key', key)
        .then(() => {});
    emit();
  }

  async function record() {
    const { error: e } = await supabase.from('hc_meeting_participants').upsert({
      meeting_id: meetingId,
      presence_key: key,
      name: (me.name || 'Staff').slice(0, 60),
      pub_session: pub?.sessionId || null,
      tracks: pub?.tracks || {},
      mic: micOn,
      cam: camOn,
      screen: !!screen,
      last_seen_at: new Date().toISOString(),
      left_at: null,
    });
    if (e) console.warn('catatan peserta gagal', e.message);
  }

  function onControl({ payload: m }) {
    if (!m || typeof m !== 'object') return;
    const from = [...peers.values()].find((p) => p.uid === m.from);
    if (m.t === 'chat' && typeof m.text === 'string') onEvent?.({ t: 'chat', id: m.id, name: String(m.name || from?.name || 'Staff').slice(0, 60), uid: m.from, text: m.text.slice(0, 1000), at: m.at || Date.now() });
    // perintah host hanya dituruti dari peserta yang tercatat sebagai owner
    if (m.target !== me.id || from?.role !== 'owner') return;
    if (m.t === 'mute' && micOn) {
      call.setMic(false);
      onEvent?.({ t: 'muted', by: from.name });
    } else if (m.t === 'kick') {
      // dikeluarkan sungguhan dicek ke database (ditulis server), bukan hanya pesan broadcast
      supabase
        .from('hc_meeting_participants')
        .select('kicked_at')
        .eq('meeting_id', meetingId)
        .eq('user_id', me.id)
        .not('kicked_at', 'is', null)
        .limit(1)
        .then(({ data }) => data?.length && call.leave('kicked'));
    }
  }

  function joinPresence() {
    return new Promise((resolve, reject) => {
      const ch = supabase.channel(`hc-call:${meetingId}`, { config: { presence: { key }, broadcast: { self: false } } });
      channel = ch;
      ch.on('presence', { event: 'sync' }, () => {
        if (channel !== ch) return;
        const st = ch.presenceState();
        const seen = new Set();
        for (const [k, metas] of Object.entries(st)) {
          if (k === key) continue;
          const m = metas[metas.length - 1];
          seen.add(k);
          const prev = peers.get(k);
          if (!prev) onEvent?.({ t: 'joined', name: m.name || 'Staff' });
          peers.set(k, {
            key: k,
            uid: m.uid,
            name: m.name || 'Staff',
            role: m.role || 'staff',
            mic: m.mic !== false,
            cam: m.cam !== false,
            screen: !!m.screen,
            net: m.net || 'good',
            pub: m.pub,
            stream: prev?.stream || null,
            screenStream: prev?.screenStream || null,
          });
        }
        for (const [k, p] of [...peers.entries()])
          if (!seen.has(k)) {
            peers.delete(k);
            wantRid.delete(k);
            onEvent?.({ t: 'left', name: p.name });
          }
        reconcile();
        emit();
      });
      ch.on('broadcast', { event: 'ctl' }, onControl);
      let first = true;
      ch.subscribe((status) => {
        if (channel !== ch) return;
        if (status === 'SUBSCRIBED') {
          ch.track(presenceMeta());
          if (first) resolve();
          first = false;
        } else if (first && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          first = false;
          reject(new Error('Kanal rapat tidak tersambung. Coba lagi.'));
        }
      });
    });
  }

  const send = (payload) => channel?.send({ type: 'broadcast', event: 'ctl', payload: { ...payload, from: me.id } });

  /* ---------- sambung, sambung ulang, keluar ---------- */
  function teardownMedia() {
    pubPc?.close();
    subPc?.close();
    pubPc = subPc = null;
    pub = sub = null;
    tx.mic = tx.cam = tx.screen = null;
    pulled.clear();
    midToLoc.clear();
    pubQueue = queue();
    subQueue = queue();
    for (const p of peers.values()) {
      p.stream = null;
      p.screenStream = null;
    }
  }

  async function connect() {
    if (!iceServers) iceServers = (await api(meetingId, 'ice')).iceServers;
    await publish();
    if (state === 'left' || state === 'kicked') return;
    if (screen) {
      // share screen berhenti saat sambung ulang; peserta bisa share lagi dari tombolnya
      const s = screen;
      screen = null;
      s.getTracks().forEach((t) => t.stop());
    }
    if (!channel) await joinPresence();
    state = 'on';
    await record();
    announce();
    reconcile();
  }

  async function reconnect() {
    if (state !== 'on' || reconnects >= MAX_RECONNECT) {
      if (state === 'on') fail(new Error('Koneksi video terputus. Klik "Sambung ulang".'));
      return;
    }
    reconnects++;
    state = 'reconnecting';
    emit();
    teardownMedia();
    try {
      await connect();
      emit();
    } catch (e) {
      fail(e);
    }
  }

  function startTimers() {
    stopTimers();
    timers = [
      setInterval(checkNet, NET_EVERY_MS),
      setInterval(levels, LEVEL_EVERY_MS),
      setInterval(() => {
        if (state === 'on') supabase.from('hc_meeting_participants').update({ last_seen_at: new Date().toISOString() }).eq('meeting_id', meetingId).eq('presence_key', key).then(() => {});
        reconnects = 0; // jendela percobaan sambung ulang dihitung per menit
      }, HEARTBEAT_MS),
    ];
  }
  function stopTimers() {
    timers.forEach(clearInterval);
    timers = [];
  }

  const call = {
    snapshot,
    // tampilkan kamera saya sebelum masuk (layar preview)
    async preview() {
      if (!local) {
        local = await captureMedia();
        meterLocal();
        emit();
      }
      return local;
    },
    devices: listDevices,
    async setDevice(kind, deviceId) {
      if (kind === 'audio' || kind === 'video') await switchDevice(kind, deviceId);
    },
    async join() {
      if (state === 'connecting' || state === 'on' || state === 'reconnecting' || state === 'kicked') return;
      state = 'connecting';
      error = '';
      emit();
      teardownMedia();
      if (channel) supabase.removeChannel(channel);
      channel = null;
      try {
        await this.preview();
        audioCtx?.resume?.().catch(() => {});
        await connect();
        startTimers();
        emit();
      } catch (e) {
        if (e.code === 'kicked') {
          state = 'kicked';
          error = ERR.kicked;
          emit();
        } else fail(e);
      }
    },
    setMic(on) {
      micOn = on && !!local?.getAudioTracks().length;
      local?.getAudioTracks().forEach((t) => (t.enabled = micOn));
      announce();
    },
    setCam(on) {
      // track tetap hidup (mengirim frame hitam) supaya publikasi tidak kedaluwarsa di SFU
      camOn = on && !!local?.getVideoTracks().length;
      local?.getVideoTracks().forEach((t) => (t.enabled = camOn));
      announce();
    },
    startScreen,
    stopScreen,
    // UI memberi tahu ukuran tile peserta -> lapis simulcast yang diminta
    setQuality(peerKey, rid) {
      if (!RID_ORDER.includes(rid) || wantRid.get(peerKey) === rid) return;
      wantRid.set(peerKey, rid);
      retune();
    },
    async sendChat(text) {
      const t = String(text || '').trim().slice(0, 1000);
      if (!t) return;
      const msg = { t: 'chat', id: `${key}-${Date.now()}`, name: me.name, text: t, at: Date.now() };
      onEvent?.({ ...msg, uid: me.id, mine: true });
      send(msg);
      const { error: e } = await supabase.from('hc_meeting_lines').insert({ meeting_id: meetingId, speaker_name: (me.name || 'Staff').slice(0, 60), kind: 'chat', text: t });
      if (e) throw new Error('Chat terkirim ke peserta, tapi gagal disimpan.');
    },
    async loadChat() {
      const { data } = await supabase.from('hc_meeting_lines').select('id, speaker_id, speaker_name, text, created_at').eq('meeting_id', meetingId).eq('kind', 'chat').order('created_at').limit(200);
      return (data || []).map((r) => ({ t: 'chat', id: `db-${r.id}`, name: r.speaker_name, uid: r.speaker_id, text: r.text, at: new Date(r.created_at).getTime(), mine: r.speaker_id === me.id }));
    },
    // host: matikan mic peserta (peserta tetap bisa menyalakan lagi, seperti Zoom)
    mutePeer(uid) {
      send({ t: 'mute', target: uid });
    },
    // host: keluarkan peserta (ditegakkan server: track-nya dihentikan dan ia tidak bisa masuk lagi)
    async kickPeer(uid) {
      await api(meetingId, 'kick', { user_id: uid });
      send({ t: 'kick', target: uid });
    },
    retry() {
      reconnects = 0;
      return this.join();
    },
    async leave(reason) {
      if (state === 'left' || state === 'kicked') return;
      state = reason === 'kicked' ? 'kicked' : 'left';
      if (reason === 'kicked') error = ERR.kicked;
      stopTimers();
      const c = channel;
      channel = null;
      if (c) {
        await c.untrack().catch(() => {});
        supabase.removeChannel(c);
      }
      // bereskan sumber daya SFU (kalau gagal, track tetap kedaluwarsa sendiri ±30 detik tanpa media)
      if (pub && pubPc) {
        const mids = pubPc.getTransceivers().map((t) => t.mid).filter(Boolean);
        api(meetingId, 'close', { sessionId: pub.sessionId, token: pub.token, mids }).catch(() => {});
      }
      if (sub && pulled.size) api(meetingId, 'close', { sessionId: sub.sessionId, token: sub.token, mids: [...pulled.values()].map((v) => v.mid).filter(Boolean) }).catch(() => {});
      supabase.from('hc_meeting_participants').update({ left_at: new Date().toISOString() }).eq('meeting_id', meetingId).eq('presence_key', key).then(() => {});
      teardownMedia();
      screen?.getTracks().forEach((t) => t.stop());
      screen = null;
      local?.getTracks().forEach((t) => t.stop());
      local = null;
      audioCtx?.close?.().catch(() => {});
      audioCtx = null;
      peers.clear();
      emit();
    },
  };
  return call;
}
