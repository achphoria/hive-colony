// Suara meeting Hive Hall lewat LiveKit Cloud (khusus staff yang login).
// Tiket masuk dibuat Edge Function "livekit-token"; rahasia LiveKit tetap tersimpan di Supabase.
// Transkrip: tiap peserta menyalakan pengenal suara browser untuk suaranya sendiri,
// lalu barisnya dibagikan ke peserta lain lewat kanal data LiveKit.
import { supabase } from '../lib/supabase';

const ERR = {
  not_logged_in: 'Sesi login habis. Silakan login ulang.',
  not_hive_staff: 'Akun ini belum terdaftar sebagai staff Hive Colony.',
  viewer_cannot_join: 'Akun viewer tidak bisa ikut meeting suara.',
  livekit_not_configured: 'Server suara belum dikonfigurasi.',
};

let room = null;
let audioBox = null;
const enc = new TextEncoder();
const dec = new TextDecoder();

function box() {
  if (!audioBox) {
    audioBox = document.createElement('div');
    audioBox.hidden = true;
    document.body.appendChild(audioBox);
  }
  return audioBox;
}

async function fetchTicket() {
  const { data, error } = await supabase.functions.invoke('livekit-token', { body: {} });
  if (error) {
    let code = '';
    try {
      code = (await error.context.json()).error;
    } catch {
      /* bukan JSON */
    }
    throw new Error(ERR[code] || 'Gagal menyambung ke server suara. Coba lagi.');
  }
  return data;
}

// cb: { state(voice, err), speakers(ids), peers(list), audioBlocked(bool), data(msg, id, name) }
export async function connectVoice(cb) {
  disconnectVoice();
  cb.state('connecting');
  let r = null;
  try {
    const [{ token, url }, lk] = await Promise.all([fetchTicket(), import('livekit-client')]);
    r = new lk.Room({ adaptiveStream: true, dynacast: true });
    room = r;
    const E = lk.RoomEvent;
    const peers = () => {
      if (room !== r) return;
      cb.peers([...r.remoteParticipants.values()].map((p) => ({ id: p.identity, name: p.name, muted: !p.isMicrophoneEnabled })));
    };
    r.on(E.TrackSubscribed, (track) => {
      if (track.kind === 'audio') box().appendChild(track.attach());
    })
      .on(E.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()))
      .on(E.ActiveSpeakersChanged, (list) => cb.speakers(list.map((p) => (p.identity === r.localParticipant.identity ? 'me' : p.identity))))
      .on(E.ParticipantConnected, peers)
      .on(E.ParticipantDisconnected, peers)
      .on(E.TrackPublished, peers)
      .on(E.TrackMuted, peers)
      .on(E.TrackUnmuted, peers)
      .on(E.DataReceived, (payload, p) => {
        if (!p) return;
        try {
          cb.data(JSON.parse(dec.decode(payload)), p.identity, p.name);
        } catch {
          /* pesan rusak diabaikan */
        }
      })
      .on(E.AudioPlaybackStatusChanged, () => cb.audioBlocked(!r.canPlaybackAudio))
      .on(E.Disconnected, () => {
        if (room !== r) return; // keluar sendiri
        room = null;
        cb.state('error', 'Suara terputus.');
      });
    await r.connect(url, token);
    if (room !== r) {
      r.disconnect(); // sudah keluar sebelum tersambung
      return false;
    }
    peers();
    cb.audioBlocked(!r.canPlaybackAudio);
    cb.state('on');
    return true;
  } catch (e) {
    if (r && room === r) {
      room = null;
      r.disconnect();
    }
    cb.state('error', e.message || 'Gagal menyambung ke server suara.');
    return false;
  }
}

export function disconnectVoice() {
  const r = room;
  room = null;
  r?.disconnect();
  if (audioBox) audioBox.innerHTML = '';
}

export const setMic = (on) => room?.localParticipant.setMicrophoneEnabled(on);
export const startAudio = () => room?.startAudio();
export function publish(msg) {
  room?.localParticipant.publishData(enc.encode(JSON.stringify(msg)), { reliable: true }).catch(() => {});
}

/* ---------- transkrip dari pengenal suara browser ---------- */

const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const canTranscribe = !!SpeechRec;
let rec = null;
let recOn = false;

export function startTranscribe(onFinal, onDenied) {
  if (!SpeechRec) return false;
  stopTranscribe();
  recOn = true;
  const run = () => {
    if (!recOn) return;
    const r = new SpeechRec();
    r.lang = 'id-ID';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const t = e.results[k].isFinal && e.results[k][0].transcript.trim();
        if (t) onFinal(t[0].toUpperCase() + t.slice(1));
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        recOn = false;
        onDenied?.();
      }
    };
    // pengenal suara berhenti sendiri setelah hening; nyalakan lagi selama mic aktif
    r.onend = () => {
      if (recOn && rec === r) setTimeout(run, 250);
    };
    rec = r;
    try {
      r.start();
    } catch {
      /* sudah berjalan */
    }
  };
  run();
  return true;
}

export function stopTranscribe() {
  recOn = false;
  const r = rec;
  rec = null;
  try {
    r?.abort();
  } catch {
    /* abaikan */
  }
}
