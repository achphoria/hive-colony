// Satu server meeting untuk seluruh koloni.
// Login: status & peserta disinkronkan lewat Supabase Realtime Presence (channel "hc-meeting"),
// jadi siapa pun yang membuka Hive Hall tahu ada meeting atau tidak.
// Tanpa login: meeting contoh lokal (mode demo).
// Transkrip saat ini masih simulasi; speech-to-text sungguhan menyusul di fase berikutnya.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuth, toAvatarProfile } from '../sim/auth';
import { buildAnswer, speak } from './ai';

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

// Naskah transkrip simulasi (berputar)
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
  speaking: null,
  mic: true,
  hand: false,

  /* ---------- status (lobi) ---------- */
  watch: () => {
    if (!isLive()) {
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
    if (isLive() && channel) {
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
    set({ joined: true, hand: false });
    get().addLine('system', `${acc?.name || 'Anda'} bergabung ke meeting`);
    startScript();
  },

  leave: async () => {
    stopScript();
    if (isLive() && channel) await channel.untrack();
    set({ joined: false, speaking: null });
    if (!isLive() && get().people.length === 0) set({ active: false });
  },

  /* ---------- transkrip ---------- */
  addLine: (who, text) =>
    set((s) => ({ transcript: [...s.transcript, { id: `${Date.now()}-${Math.random()}`, who, text, t: nowLabel() }].slice(-60) })),

  say: (who, text, ms = 3500) => {
    get().addLine(who, text);
    set({ speaking: who });
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => set({ speaking: null }), ms);
  },

  askChief: (kind, voice) => {
    const r = buildAnswer(kind);
    if (get().mic) get().say('me', r.q, 2500);
    setTimeout(() => {
      get().say('ceo', r.a, 7000);
      if (r.note) set((s) => ({ notes: [...s.notes, { type: 'task', text: r.note }] }));
      if (voice) speak(r.a);
    }, 2200);
  },

  inviteAi: (id) => set((s) => ({ aiGuests: s.aiGuests.includes(id) ? s.aiGuests : [...s.aiGuests, id] })),
  toggleMic: () => set((s) => ({ mic: !s.mic })),
  toggleHand: () => set((s) => ({ hand: !s.hand })),
}));

function startScript() {
  stopScript();
  scriptTimer = setInterval(() => {
    const st = useMeeting.getState();
    // hanya peserta yang hadir yang "bicara": AI yang diundang, plus staff contoh di mode demo
    const allowed = new Set([...st.aiGuests, ...(st.live ? [] : DEMO_PEOPLE.map((p) => p.id))]);
    let line = null;
    for (let i = 0; i < SCRIPT.length && !line; i++) {
      const cand = SCRIPT[scriptIdx++ % SCRIPT.length];
      if (allowed.has(cand.who)) line = cand;
    }
    if (!line) return;
    st.say(line.who, line.text);
    if (line.task) useMeeting.setState((s) => ({ notes: [...s.notes, { type: 'task', text: line.task }].slice(-8) }));
    if (line.decision) useMeeting.setState((s) => ({ notes: [...s.notes, { type: 'decision', text: line.decision }].slice(-8) }));
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
