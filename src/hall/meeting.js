// Satu server meeting untuk seluruh koloni.
// Login: status & peserta disinkronkan lewat Supabase Realtime Presence (channel "hc-meeting"),
// jadi siapa pun yang membuka Hive Hall tahu ada meeting atau tidak. Suara antar-peserta lewat
// LiveKit (lihat voice.js); transkrip dari pengenal suara browser masing-masing, dibagikan ke semua.
// Tanpa login: meeting contoh lokal (mode demo) dengan transkrip simulasi.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuth, toAvatarProfile } from '../sim/auth';
import { buildAnswer, speak } from './ai';
import { connectVoice, disconnectVoice, setMic, startAudio, publish, startTranscribe, stopTranscribe, canTranscribe } from './voice';

export const AI_GUESTS = [
  { id: 'ceo', name: 'Queen Bea', role: 'Chief Executive', color: '#F5B700', crown: true },
  { id: 'sprint', name: 'Sprint', role: 'Operations', color: '#FF8C1A' },
  { id: 'spark', name: 'Spark', role: 'Marketing', color: '#E2701B' },
  { id: 'graph', name: 'Graph', role: 'Finance', color: '#B8860B' },
  { id: 'bumble', name: 'Bumble', role: 'Customer XP', color: '#F5B700' },
  { id: 'hello', name: 'Hello', role: 'HR & GA', color: '#D99A2B' },
];

const DEMO_PEOPLE = [
  { id: 'dina', name: 'Dina', color: '#8DBF5A', role: 'Ops' },
  { id: 'rudi', name: 'Rudi', color: '#D85A30', role: 'Ops' },
];

// Naskah transkrip simulasi (berputar, hanya mode demo)
const SCRIPT = [
  { who: 'dina', text: 'Sled tambahan sudah dapat pinjaman dari gym rekanan, tinggal diambil Kamis.' },
  { who: 'ceo', text: 'Bagus. Saya catat: Dina ambil 2 sled hari Kamis.', task: 'Ambil 2 sled pinjaman · Dina · Kamis' },
  { who: 'spark', text: 'Iklan "Road to HYROX" siap tayang setelah disetujui. Targetnya 80 peserta.' },
  { who: 'rudi', text: 'Sound system sudah booking, MC masih cari dua kandidat.' },
  { who: 'ceo', text: 'Keputusan: kita pakai MC internal kalau sampai Jumat belum ada kandidat.', decision: 'MC internal jika sampai Jumat belum ada kandidat' },
  { who: 'graph', text: 'Sisa budget Rp600 ribu. Sponsor minuman bisa menutup biaya medali.' },
  { who: 'ceo', text: 'Spark, tolong siapkan proposal sponsor minuman.', task: 'Proposal sponsor minuman · Spark · 2 hari' },
];

let channel = null;
let scriptTimer = null;
let scriptIdx = 0;
let speakTimer = null;

const isLive = () => !!useAuth.getState().account;
const nowLabel = () => {
  const d = new Date(Date.now() + 7 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const pushNote = (note) => useMeeting.setState((s) => ({ notes: [...s.notes, note].slice(-8) }));

const VOICE_RESET = { voice: 'off', voiceError: '', micError: '', talking: [], peerMuted: [], hands: [], audioBlocked: false, txOn: false };

export const useMeeting = create((set, get) => ({
  live: false, // tersambung ke presence Supabase
  active: true, // ada meeting berlangsung
  title: 'Rapat HYROX Simulation Race',
  startedAt: Date.now() - 12 * 60 * 1000,
  people: DEMO_PEOPLE, // peserta manusia lain
  joined: false,
  aiGuests: ['ceo', 'spark'],
  transcript: [],
  notes: [],
  speaking: null, // pembicara simulasi / AI
  mic: true,
  hand: false,
  // suara sungguhan (mode login)
  ...VOICE_RESET, // voice: off | connecting | on | error; talking: id yang sedang bicara (dari LiveKit)

  /* ---------- status (lobi) ---------- */
  watch: () => {
    if (!isLive()) {
      if (get().joined && get().live) get().leave();
      if (channel) unwatch();
      set({ live: false });
      return;
    }
    if (channel) return;
    const me = useAuth.getState().session.user.id;
    channel = supabase.channel('hc-meeting', { config: { presence: { key: me } } });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const all = Object.entries(state).map(([key, metas]) => ({ key, ...metas[metas.length - 1] }));
      const host = [...all].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))[0];
      set({
        live: true,
        active: all.length > 0,
        title: host?.title || 'Rapat koloni',
        startedAt: host?.startedAt || null,
        people: all.filter((p) => p.key !== me).map((p) => ({ id: p.key, name: p.name, color: p.color, role: p.role })),
      });
    });
    channel.subscribe();
    set({ live: true, active: false, people: [], title: '', startedAt: null });
  },

  /* ---------- masuk / keluar ---------- */
  start: async (title) => {
    const t = title.trim() || 'Rapat koloni';
    set({ title: t, startedAt: Date.now(), active: true, transcript: [], notes: [] });
    if (!isLive()) set({ people: [] });
    await get().join(true);
  },

  join: async (asHost = false) => {
    if (get().joined) return; // cegah gabung ganda (mis. efek React dipanggil dua kali)
    set({ joined: true });
    const acc = useAuth.getState().account;
    const live = isLive() && channel;
    if (live) {
      const prof = toAvatarProfile(acc);
      await channel.track({
        name: acc.name,
        color: prof.outfitColor,
        role: acc.role,
        title: get().title,
        startedAt: asHost ? get().startedAt : get().startedAt || Date.now(),
        joinedAt: Date.now(),
      });
    }
    set({ joined: true, hand: false, ...(live ? { aiGuests: ['ceo'], speaking: null } : {}) });
    get().addLine('system', `${acc?.name || 'Anda'} bergabung ke meeting`);
    if (live) joinVoice();
    else startScript();
  },

  leave: async () => {
    stopScript();
    stopTranscribe();
    disconnectVoice();
    if (isLive() && channel) await channel.untrack();
    set({ joined: false, speaking: null, ...VOICE_RESET });
    if (!isLive() && get().people.length === 0) set({ active: false });
  },

  retryVoice: () => joinVoice(),
  unlockAudio: () => startAudio()?.then(() => set({ audioBlocked: false })),

  /* ---------- transkrip ---------- */
  addLine: (who, text, name) =>
    set((s) => ({ transcript: [...s.transcript, { id: `${Date.now()}-${Math.random()}`, who, name, text, t: nowLabel() }].slice(-80) })),

  say: (who, text, ms = 3500) => {
    get().addLine(who, text);
    set({ speaking: who });
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => set({ speaking: null }), ms);
  },

  askChief: (kind, voice) => {
    const r = buildAnswer(kind);
    const shared = get().voice === 'on';
    get().say('me', r.q, 2500);
    if (shared) publish({ t: 'tx', text: r.q });
    setTimeout(() => {
      get().say('ceo', r.a, 7000);
      if (r.note) pushNote({ type: 'task', text: r.note });
      if (shared) publish({ t: 'ai', who: 'ceo', text: r.a, note: r.note || null });
      if (voice) speak(r.a);
    }, 2200);
  },

  inviteAi: (id) => set((s) => ({ aiGuests: s.aiGuests.includes(id) ? s.aiGuests : [...s.aiGuests, id] })),

  toggleMic: () => {
    const on = !get().mic;
    set({ mic: on, micError: '' });
    if (get().voice === 'on') applyMic(on);
  },

  toggleHand: () => {
    const on = !get().hand;
    set({ hand: on });
    if (get().voice === 'on') publish({ t: 'hand', on });
  },
}));

/* ---------- suara sungguhan (LiveKit) ---------- */

async function joinVoice() {
  const ok = await connectVoice({
    state: (voice, voiceError = '') => {
      if (!useMeeting.getState().joined) return; // sudah keluar
      useMeeting.setState({ voice, voiceError, ...(voice !== 'on' ? { txOn: false, talking: [] } : {}) });
      if (voice !== 'on') stopTranscribe();
    },
    speakers: (talking) => useMeeting.setState({ talking }),
    peers: (list) => useMeeting.setState({ peerMuted: list.filter((p) => p.muted).map((p) => p.id) }),
    audioBlocked: (audioBlocked) => useMeeting.setState({ audioBlocked }),
    data: onData,
  });
  if (!ok || !useMeeting.getState().joined) return;
  // beri tahu peserta lain status tangan saya
  if (useMeeting.getState().hand) publish({ t: 'hand', on: true });
  applyMic(useMeeting.getState().mic);
}

async function applyMic(on) {
  try {
    await setMic(on);
  } catch {
    useMeeting.setState({ mic: false, micError: 'Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser, lalu nyalakan mic lagi.' });
    stopTranscribe();
    return;
  }
  if (!on) {
    stopTranscribe();
    useMeeting.setState({ txOn: false });
    return;
  }
  const started = startTranscribe(
    (text) => {
      useMeeting.getState().addLine('me', text);
      publish({ t: 'tx', text });
    },
    () => useMeeting.setState({ txOn: false }),
  );
  useMeeting.setState({ txOn: started && canTranscribe });
}

function onData(msg, id, name) {
  const st = useMeeting.getState();
  if (msg.t === 'tx' && msg.text) st.addLine(id, String(msg.text).slice(0, 500), name);
  else if (msg.t === 'ai' && msg.text) {
    const who = AI_GUESTS.some((a) => a.id === msg.who) ? msg.who : 'ceo';
    st.say(who, String(msg.text).slice(0, 800), 7000);
    if (msg.note) pushNote({ type: 'task', text: String(msg.note).slice(0, 200) });
  } else if (msg.t === 'hand') {
    useMeeting.setState((s) => ({ hands: msg.on ? [...new Set([...s.hands, id])] : s.hands.filter((h) => h !== id) }));
  }
}

/* ---------- transkrip simulasi (mode demo) ---------- */

function startScript() {
  stopScript();
  scriptTimer = setInterval(() => {
    const st = useMeeting.getState();
    // hanya peserta yang hadir yang "bicara": AI yang diundang, plus staff contoh di mode demo
    const allowed = new Set([...st.aiGuests, ...DEMO_PEOPLE.map((p) => p.id)]);
    let line = null;
    for (let i = 0; i < SCRIPT.length && !line; i++) {
      const cand = SCRIPT[scriptIdx++ % SCRIPT.length];
      if (allowed.has(cand.who)) line = cand;
    }
    if (!line) return;
    st.say(line.who, line.text);
    if (line.task) pushNote({ type: 'task', text: line.task });
    if (line.decision) pushNote({ type: 'decision', text: line.decision });
  }, 6000);
}

function stopScript() {
  clearInterval(scriptTimer);
  scriptTimer = null;
}

export function unwatch() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
}
