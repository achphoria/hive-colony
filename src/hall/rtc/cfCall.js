// Video call lewat Cloudflare Realtime SFU (tanpa server sendiri).
// Setiap peserta punya dua koneksi WebRTC ke SFU, mengikuti contoh video-room Cloudflare:
//   - publikasi (sendonly): mic + kamera saya
//   - penerima (recvonly): track peserta lain yang saya pull
// Semua panggilan API SFU lewat Edge Function "realtime-session" (kunci Cloudflare tidak ada di browser).
// Siapa sedang di room dan track apa yang ia publish dibagikan lewat Supabase Realtime Presence.
import { supabase } from '../../lib/supabase';

const ERR = {
  not_logged_in: 'Sesi login habis. Silakan login ulang.',
  not_hive_staff: 'Akun ini belum terdaftar sebagai staff Hive Colony.',
  viewer_cannot_join: 'Akun viewer tidak bisa ikut video call.',
  realtime_not_configured: 'Server video belum dikonfigurasi (secret Cloudflare Realtime belum diisi).',
  meeting_not_live: 'Rapat ini sudah selesai.',
  bad_meeting: 'Rapat tidak ditemukan.',
};

const CONNECT_TIMEOUT_MS = 15000;
const GATHER_TIMEOUT_MS = 2500;

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

// cb.change(snapshot) dipanggil setiap ada perubahan untuk ditampilkan UI.
export function createCfCall({ meetingId, me, onChange }) {
  const key = `${me.id}:${Math.random().toString(36).slice(2, 8)}`; // satu orang boleh dua tab
  let iceServers = null;
  let local = null; // MediaStream saya
  let pubPc = null;
  let pub = null; // { sessionId, token, sig, tracks: { mic, cam } }
  let subPc = null;
  let sub = null; // { sessionId, token }
  const subQueue = queue();
  const midToLoc = new Map(); // mid penerima -> "pubSession/trackName"
  const pulled = new Map(); // "pubSession/trackName" -> { mid, key }
  const peers = new Map(); // presenceKey -> { key, uid, name, mic, cam, pub, stream }
  let channel = null;
  let state = 'idle'; // idle | connecting | on | error | left
  let error = '';
  let micOn = true;
  let camOn = true;

  const snapshot = () => ({
    state,
    error,
    local,
    micOn,
    camOn,
    peers: [...peers.values()].map((p) => ({ key: p.key, uid: p.uid, name: p.name, mic: p.mic, cam: p.cam, stream: p.stream })),
  });
  const emit = () => onChange?.(snapshot());
  const fail = (e) => {
    if (state === 'left') return;
    state = 'error';
    error = e?.message || String(e);
    emit();
  };

  async function captureMedia() {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video });
    } catch (e) {
      // tanpa kamera (atau izin kamera ditolak): tetap ikut dengan suara saja
      if (e?.name === 'NotAllowedError' && !(await hasAudioPermission())) throw new Error('Izin mikrofon dan kamera ditolak. Izinkan di pengaturan browser lalu coba lagi.');
      const s = await navigator.mediaDevices.getUserMedia({ audio }).catch(() => null);
      if (!s) throw new Error('Mikrofon tidak bisa dipakai. Cek izin browser dan perangkat audio.');
      camOn = false;
      return s;
    }
  }
  async function hasAudioPermission() {
    try {
      return (await navigator.permissions.query({ name: 'microphone' })).state !== 'denied';
    } catch {
      return true;
    }
  }

  /* ---------- publikasi ---------- */
  async function publish() {
    pubPc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
    const want = [];
    const audio = local.getAudioTracks()[0];
    const video = local.getVideoTracks()[0];
    if (audio) want.push(['mic', pubPc.addTransceiver(audio, { direction: 'sendonly' })]);
    if (video) want.push(['cam', pubPc.addTransceiver(video, { direction: 'sendonly', sendEncodings: [{ maxBitrate: 900_000, maxFramerate: 24 }] })]);
    await pubPc.setLocalDescription(await pubPc.createOffer());
    await gathered(pubPc);
    const r = await api(meetingId, 'push', {
      offer: { type: 'offer', sdp: pubPc.localDescription.sdp },
      tracks: want.map(([trackName, tr]) => ({ mid: tr.mid, trackName })),
    });
    await pubPc.setRemoteDescription(r.answer);
    const ok = Object.fromEntries(r.tracks.filter((t) => !t.error).map((t) => [t.trackName, t.trackName]));
    pub = { sessionId: r.sessionId, token: r.token, sig: r.sig, tracks: ok };
    await connected(pubPc);
    pubPc.addEventListener('connectionstatechange', () => {
      if (pubPc?.connectionState === 'failed') fail(new Error('Koneksi video terputus. Keluar lalu masuk lagi.'));
    });
  }

  /* ---------- menerima track peserta lain ---------- */
  function ensureSubPc() {
    if (subPc) return;
    subPc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
    subPc.addEventListener('track', (e) => {
      const loc = midToLoc.get(e.transceiver.mid);
      const owner = loc && pulled.get(loc)?.key;
      const p = owner && peers.get(owner);
      if (!p) return;
      const stream = new MediaStream([...(p.stream?.getTracks() || []).filter((t) => t.kind !== e.track.kind), e.track]);
      p.stream = stream;
      emit();
    });
  }

  async function pullTracks(list) {
    ensureSubPc();
    const r = await api(meetingId, 'pull', {
      ...(sub ? { sessionId: sub.sessionId, token: sub.token } : {}),
      tracks: list.map((x) => ({ sessionId: x.sessionId, trackName: x.trackName, sig: x.sig })),
    });
    sub = { sessionId: r.sessionId, token: r.token };
    for (const t of r.tracks) {
      const loc = `${t.sessionId}/${t.trackName}`;
      const want = list.find((x) => `${x.sessionId}/${x.trackName}` === loc);
      if (t.error || !want) continue;
      midToLoc.set(t.mid, loc);
      pulled.set(loc, { mid: t.mid, key: want.key });
    }
    if (!r.offer) return;
    await subPc.setRemoteDescription(r.offer);
    await subPc.setLocalDescription(await subPc.createAnswer());
    await gathered(subPc);
    await api(meetingId, 'renegotiate', { sessionId: sub.sessionId, token: sub.token, answer: { type: 'answer', sdp: subPc.localDescription.sdp } });
  }

  async function closeTracks(locs) {
    const items = locs.map((loc) => [loc, pulled.get(loc)]).filter(([, v]) => v);
    for (const [loc] of items) pulled.delete(loc);
    const mids = items.map(([, v]) => v.mid);
    if (!mids.length || !sub || !subPc) return;
    for (const mid of mids) midToLoc.delete(mid);
    try {
      for (const tr of subPc.getTransceivers()) if (mids.includes(tr.mid)) tr.stop();
      await subPc.setLocalDescription(await subPc.createOffer());
      await gathered(subPc);
      const r = await api(meetingId, 'close', { sessionId: sub.sessionId, token: sub.token, mids, offer: { type: 'offer', sdp: subPc.localDescription.sdp } });
      if (r.answer) await subPc.setRemoteDescription(r.answer);
    } catch (e) {
      console.warn('tutup track gagal, dihentikan paksa', e);
      if (subPc.signalingState === 'have-local-offer') await subPc.setLocalDescription({ type: 'rollback' }).catch(() => {});
      await api(meetingId, 'close', { sessionId: sub.sessionId, token: sub.token, mids }).catch(() => {});
    }
  }

  // Samakan track yang saya pull dengan daftar publikasi di presence.
  function reconcile() {
    const want = new Map();
    for (const p of peers.values()) {
      if (!p.pub?.sessionId) continue;
      for (const trackName of Object.values(p.pub.tracks || {})) {
        want.set(`${p.pub.sessionId}/${trackName}`, { key: p.key, sessionId: p.pub.sessionId, trackName, sig: p.pub.sig });
      }
    }
    const add = [...want.entries()].filter(([loc]) => !pulled.has(loc)).map(([, v]) => v);
    const drop = [...pulled.keys()].filter((loc) => !want.has(loc));
    // tandai dulu supaya sync presence berikutnya tidak memesan ulang track yang sama
    for (const x of add) pulled.set(`${x.sessionId}/${x.trackName}`, { mid: null, key: x.key, pending: true });
    if (add.length)
      subQueue(() => (state === 'left' ? null : pullTracks(add))).catch((e) => {
        for (const x of add) if (pulled.get(`${x.sessionId}/${x.trackName}`)?.pending) pulled.delete(`${x.sessionId}/${x.trackName}`);
        fail(e);
      });
    if (drop.length) subQueue(() => (state === 'left' ? null : closeTracks(drop))).catch(() => {});
  }

  /* ---------- presence: siapa di room & track apa ---------- */
  const presenceMeta = () => ({ uid: me.id, name: me.name, mic: micOn, cam: camOn, pub: pub && { sessionId: pub.sessionId, sig: pub.sig, tracks: pub.tracks } });

  function joinPresence() {
    return new Promise((resolve, reject) => {
      channel = supabase.channel(`hc-call:${meetingId}`, { config: { presence: { key } } });
      channel.on('presence', { event: 'sync' }, () => {
        const st = channel.presenceState();
        const seen = new Set();
        for (const [k, metas] of Object.entries(st)) {
          if (k === key) continue;
          const m = metas[metas.length - 1];
          seen.add(k);
          const prev = peers.get(k);
          peers.set(k, { key: k, uid: m.uid, name: m.name || 'Staff', mic: m.mic !== false, cam: m.cam !== false, pub: m.pub, stream: prev?.stream || null });
        }
        for (const k of [...peers.keys()]) if (!seen.has(k)) peers.delete(k);
        reconcile();
        emit();
      });
      let first = true;
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track(presenceMeta());
          if (first) resolve();
          first = false;
        } else if (first && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          first = false;
          reject(new Error('Kanal rapat tidak tersambung. Coba lagi.'));
        }
      });
    });
  }

  /* ---------- API untuk UI ---------- */
  return {
    snapshot,
    // tampilkan kamera saya sebelum masuk (dipakai juga saat join)
    async preview() {
      if (!local) {
        local = await captureMedia();
        emit();
      }
      return local;
    },
    async join() {
      if (state === 'connecting' || state === 'on') return;
      state = 'connecting';
      error = '';
      emit();
      // percobaan ulang setelah gagal: buang koneksi lama
      pubPc?.close();
      pubPc = null;
      pub = null;
      if (channel) supabase.removeChannel(channel);
      channel = null;
      try {
        await this.preview();
        iceServers = (await api(meetingId, 'ice')).iceServers;
        await publish();
        if (state === 'left') return;
        await joinPresence();
        state = 'on';
        emit();
      } catch (e) {
        fail(e);
      }
    },
    setMic(on) {
      micOn = on;
      local?.getAudioTracks().forEach((t) => (t.enabled = on));
      if (channel) channel.track(presenceMeta());
      emit();
    },
    setCam(on) {
      // track tetap hidup (mengirim frame hitam) supaya publikasi tidak kedaluwarsa di SFU
      camOn = on && !!local?.getVideoTracks().length;
      local?.getVideoTracks().forEach((t) => (t.enabled = camOn));
      if (channel) channel.track(presenceMeta());
      emit();
    },
    async leave() {
      if (state === 'left') return;
      state = 'left';
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
      pubPc?.close();
      subPc?.close();
      pubPc = subPc = null;
      local?.getTracks().forEach((t) => t.stop());
      local = null;
      peers.clear();
      pulled.clear();
      midToLoc.clear();
      emit();
    },
  };
}
