// Satu server meeting untuk seluruh koloni.
// Login: status & peserta disinkronkan lewat Supabase Realtime Presence (channel "hc-meeting"),
// jadi siapa pun yang membuka Hive Hall tahu ada meeting atau tidak. Suara antar-peserta lewat
// LiveKit (lihat voice.js); transkrip dari pengenal suara browser masing-masing, dibagikan ke semua.
// Rapat tercatat di database (hc_meetings + hc_meeting_lines): hanya owner yang bisa membuka rapat,
// tiap peserta menyimpan transkrip suaranya sendiri, dan saat rapat selesai Queen Bea wajib membuat
// notulen + laporan (Edge Function meeting-recap). Hasilnya tersimpan di Arsip rapat.
// Tanpa login: meeting contoh lokal (mode demo) dengan transkrip simulasi.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuth, toAvatarProfile } from '../sim/auth';
import { buildAnswer, speak } from './ai';
import { askQueenBea } from './queenBea';
import { connectVoice, disconnectVoice, setMic, startAudio, publish, startTranscribe, stopTranscribe, canTranscribe, roomStatus } from './voice';

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
let channelReady = false;
let myMeta = null; // status "saya di meeting"; didaftarkan ulang setiap kanal tersambung kembali
// Dua sumber status meeting: kehadiran di kanal realtime (judul, warna, peran) dan
// daftar peserta di ruang suara LiveKit (tetap benar walau kanal realtime HP sempat putus).
let presAll = []; // [{ key, name, color, role, title, startedAt, joinedAt }] termasuk saya
let roomAll = []; // [{ id, name, joinedAt }] termasuk saya
let pollTimer = null;
let dbLive = null; // baris hc_meetings yang sedang berjalan { id, title, started_at, created_by }
let dbChannel = null;
let staleCount = 0;
let hiddenAt = 0;
let lastPartialAt = 0;
let partialTimer = null;
let scriptTimer = null;
let scriptIdx = 0;
let speakTimer = null;

const isLive = () => !!useAuth.getState().account;
const nowLabel = () => {
  const d = new Date(Date.now() + 7 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const pushNote = (note) => useMeeting.setState((s) => ({ notes: [...s.notes, note].slice(-8) }));

const VOICE_RESET = { meetingId: null, chiefBusy: false, voice: 'off', voiceError: '', micError: '', talking: [], peerMuted: [], hands: [], audioBlocked: false, txOn: false, partials: {} };
const myId = () => useAuth.getState().session?.user?.id;
const inHall = () => window.location.hash.startsWith('#/hall');

// gabungkan kedua sumber menjadi status lobi
function derive() {
  const me = myId();
  const host = [...presAll].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))[0];
  const known = new Set(presAll.map((p) => p.key));
  const people = [
    ...presAll.filter((p) => p.key !== me).map((p) => ({ id: p.key, name: p.name, color: p.color, role: p.role })),
    ...roomAll.filter((p) => p.id !== me && !known.has(p.id)).map((p) => ({ id: p.id, name: p.name, color: null, role: null })),
  ];
  const active = !!dbLive || presAll.length > 0 || roomAll.length > 0 || useMeeting.getState().joined;
  const firstRoom = roomAll.length ? Math.min(...roomAll.map((p) => p.joinedAt || Date.now())) : null;
  useMeeting.setState((s) => ({
    active,
    people,
    title: dbLive?.title || host?.title || (s.joined && s.title) || (active ? 'Rapat koloni' : ''),
    startedAt: (dbLive && new Date(dbLive.started_at).getTime()) || host?.startedAt || (s.joined && s.startedAt) || firstRoom,
  }));
}

async function pollRoom() {
  if (!channel || document.hidden || !inHall()) return;
  if (useMeeting.getState().joined) return; // saat di meeting, daftar peserta datang langsung dari LiveKit
  const list = await roomStatus();
  if (!list || !channel) return;
  roomAll = list;
  derive();
  // rapat yang ditinggal semua orang (tab ditutup tanpa keluar) tetap harus ditutup & dinotulenkan
  const old = dbLive && Date.now() - new Date(dbLive.started_at).getTime() > 2 * 60 * 1000;
  if (old && roomAll.length === 0 && presAll.length === 0) {
    staleCount++;
    if (staleCount >= 2) {
      staleCount = 0;
      requestRecap(dbLive.id);
    }
  } else staleCount = 0;
}

/* ---------- rapat di database ---------- */

async function loadLive() {
  const { data } = await supabase
    .from('hc_meetings')
    .select('id, title, started_at, created_by, status')
    .eq('status', 'live')
    .order('started_at', { ascending: false })
    .limit(1);
  dbLive = data?.[0] || null;
  const st = useMeeting.getState();
  // rapat yang sedang saya ikuti sudah ditutup (owner mengakhiri / ditutup otomatis)
  if (st.joined && st.meetingId && dbLive?.id !== st.meetingId) {
    await st.leave({ silent: true });
    useMeeting.setState({ notice: 'Rapat sudah diakhiri. Queen Bea sedang menyusun notulen; lihat di tab Arsip rapat.' });
  }
  derive();
}

function watchDb() {
  if (dbChannel) return;
  dbChannel = supabase
    .channel('hc-meetings-db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hc_meetings' }, () => loadLive())
    .subscribe();
  loadLive();
}

async function saveLine(kind, text, speakerName) {
  const st = useMeeting.getState();
  if (!st.meetingId) return;
  const name = speakerName || useAuth.getState().account?.name || 'Staff';
  const { error } = await supabase.from('hc_meeting_lines').insert({ meeting_id: st.meetingId, speaker_name: name.slice(0, 60), kind, text: text.slice(0, 2000) });
  if (error) console.warn('transkrip gagal disimpan', error.message);
}

const wibLabel = (iso) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

// transkrip yang sudah ada (untuk peserta yang datang terlambat)
async function loadLines(meetingId) {
  const { data } = await supabase
    .from('hc_meeting_lines')
    .select('id, speaker_id, speaker_name, kind, text, created_at')
    .eq('meeting_id', meetingId)
    .order('created_at')
    .limit(300);
  const me = myId();
  return (data || []).map((r) => ({
    id: `db-${r.id}`,
    who: r.kind === 'join' || r.kind === 'leave' ? 'system' : r.kind === 'ai' ? 'ceo' : r.speaker_id === me ? 'me' : r.speaker_id,
    name: r.kind === 'speech' && r.speaker_id !== me ? r.speaker_name : undefined,
    text: r.text,
    t: wibLabel(r.created_at),
  }));
}

export async function requestRecap(meetingId, retry = false) {
  const { data, error } = await supabase.functions.invoke('meeting-recap', { body: { meeting_id: meetingId, retry } });
  if (error) return null;
  return data?.status || null;
}

// HP mematikan koneksi saat layar mati / pindah app. Begitu kembali, sambung ulang kanal
// dan cek ruang suara saat itu juga, tanpa menunggu koneksi lama pulih sendiri.
function onWake() {
  if (!channel) return;
  if (document.hidden) {
    hiddenAt = Date.now();
    return;
  }
  const slept = hiddenAt && Date.now() - hiddenAt > 5000;
  hiddenAt = 0;
  if (slept || !channelReady) subscribeChannel();
  pollRoom();
}

// jaringan baru tersambung (ganti Wi-Fi/data): kanal lama pasti mati, sambung ulang
function onOnline() {
  if (!channel) return;
  subscribeChannel();
  pollRoom();
}

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
  aiVoice: true, // jawaban Queen Bea dibacakan di perangkat ini
  setAiVoice: (on) => set({ aiVoice: on }),
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
    presAll = [];
    roomAll = [];
    set({ live: true, active: false, people: [], title: '', startedAt: null });
    subscribeChannel();
    watchDb();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onOnline);
    clearInterval(pollTimer);
    pollTimer = setInterval(pollRoom, 15000);
    pollRoom();
  },

  /* ---------- masuk / keluar ---------- */
  notice: '',
  clearNotice: () => set({ notice: '' }),

  start: async (title) => {
    const t = (title.trim() || 'Rapat koloni').slice(0, 80);
    if (isLive()) {
      // hanya owner yang boleh membuka rapat (dijaga juga oleh RLS database)
      if (useAuth.getState().account?.role !== 'owner') {
        set({ notice: 'Hanya owner yang bisa memulai meeting.' });
        return false;
      }
      const { data, error } = await supabase.from('hc_meetings').insert({ title: t }).select('id, title, started_at, created_by, status').single();
      if (error && error.code !== '23505') {
        set({ notice: `Gagal membuka rapat: ${error.message}` });
        return false;
      }
      if (data) dbLive = data;
      else await loadLive(); // sudah ada rapat berjalan: gabung ke rapat itu
      set({ transcript: [], notes: [], notice: '' });
      derive();
      await get().join(true);
      if (data) {
        // Queen Bea wajib hadir di setiap rapat dan membuka dengan salam
        const hello = 'Halo semua, saya Queen Bea. Saya ikut mencatat rapat ini dan akan membuat notulen serta laporan begitu rapat selesai.';
        get().say('ceo', hello, 6000);
        saveLine('ai', hello, 'Queen Bea');
      }
      return true;
    }
    set({ title: t, startedAt: Date.now(), active: true, transcript: [], notes: [] });
    set({ people: [] });
    await get().join(true);
    return true;
  },

  join: async (asHost = false) => {
    if (get().joined) return; // cegah gabung ganda (mis. efek React dipanggil dua kali)
    set({ joined: true });
    const acc = useAuth.getState().account;
    const live = isLive() && channel;
    if (live) {
      if (!dbLive) await loadLive();
      if (dbLive) {
        set({ meetingId: dbLive.id, title: dbLive.title, startedAt: new Date(dbLive.started_at).getTime(), notice: '' });
        const earlier = await loadLines(dbLive.id);
        set({ transcript: earlier.slice(-80) });
      }
      const prof = toAvatarProfile(acc);
      myMeta = {
        name: acc.name,
        color: prof.outfitColor,
        role: acc.role,
        title: get().title,
        startedAt: asHost ? get().startedAt : get().startedAt || Date.now(),
        joinedAt: Date.now(),
      };
      if (channelReady) await channel.track(myMeta); // kalau belum siap, dikirim saat tersambung
    }
    set({ joined: true, hand: false, ...(live ? { aiGuests: ['ceo'], speaking: null } : {}) });
    get().addLine('system', `${acc?.name || 'Anda'} bergabung ke meeting`);
    if (live) saveLine('join', `${acc.name} bergabung`);
    if (live) joinVoice();
    else startScript();
  },

  leave: async ({ silent = false } = {}) => {
    const meetingId = get().meetingId;
    const me = myId();
    // peserta terakhir yang keluar menutup rapat -> Queen Bea membuat notulen
    const othersLeft = roomAll.some((p) => p.id !== me) || presAll.some((p) => p.key !== me);
    if (meetingId && !silent) await saveLine('leave', `${useAuth.getState().account?.name || 'Staff'} keluar`);
    stopScript();
    stopTranscribe();
    disconnectVoice();
    myMeta = null;
    roomAll = roomAll.filter((p) => p.id !== me);
    set({ joined: false, speaking: null, ...VOICE_RESET });
    if (isLive() && channel) {
      if (channelReady) await channel.untrack();
      derive();
    }
    if (meetingId && !silent && !othersLeft) {
      const status = await requestRecap(meetingId);
      if (status) set({ notice: 'Rapat selesai. Queen Bea sedang menyusun notulen dan laporan; lihat di tab Arsip rapat.' });
    }
    if (isLive() && channel) pollRoom();
    if (!isLive() && get().people.length === 0) set({ active: false });
  },

  // owner: akhiri rapat untuk semua peserta
  endForAll: async () => {
    const meetingId = get().meetingId;
    if (!meetingId || useAuth.getState().account?.role !== 'owner') return;
    publish({ t: 'end' });
    await saveLine('leave', `${useAuth.getState().account.name} mengakhiri rapat`);
    await get().leave({ silent: true });
    const status = await requestRecap(meetingId);
    set({ notice: status ? 'Rapat diakhiri. Queen Bea sedang menyusun notulen dan laporan; lihat di tab Arsip rapat.' : 'Rapat diakhiri, tapi notulen gagal dipicu. Coba dari tab Arsip rapat.' });
  },

  retryVoice: () => joinVoice(),
  unlockAudio: () => startAudio()?.then(() => set({ audioBlocked: false })),

  /* ---------- transkrip ---------- */
  addLine: (who, text, name, extra = {}) =>
    set((s) => ({ transcript: [...s.transcript, { id: `${Date.now()}-${Math.random()}`, who, name, text, t: nowLabel(), ...extra }].slice(-80) })),

  say: (who, text, ms = 3500, extra) => {
    get().addLine(who, text, undefined, extra);
    set({ speaking: who });
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => set({ speaking: null }), ms);
  },

  chiefBusy: false,

  // mode login: pertanyaan bebas ke Queen Bea (Claude) dengan transkrip rapat sebagai konteks.
  // mode demo: jawaban contoh bergilir.
  askChief: (kind, voice, question = '') => {
    if (get().live) {
      askChiefLive(question, voice);
      return;
    }
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

/* ---------- kanal realtime status meeting ---------- */

function subscribeChannel() {
  const me = myId();
  if (!me) return;
  if (channel) supabase.removeChannel(channel);
  channelReady = false;
  const ch = supabase.channel('hc-meeting', { config: { presence: { key: me } } });
  channel = ch;
  ch.on('presence', { event: 'sync' }, () => {
    if (channel !== ch) return;
    presAll = Object.entries(ch.presenceState()).map(([key, metas]) => ({ key, ...metas[metas.length - 1] }));
    derive();
  });
  // Setiap kali kanal (kembali) tersambung, daftarkan ulang kehadiran saya di meeting.
  ch.subscribe((status) => {
    if (channel !== ch) return;
    channelReady = status === 'SUBSCRIBED';
    if (channelReady && myMeta) ch.track(myMeta);
  });
}

/* ---------- Queen Bea (Claude) di meeting ---------- */

// Saat Queen Bea bicara dari speaker, mic saya dijeda supaya suaranya tidak tertangkap ulang
// (terdengar dobel oleh peserta lain dan ikut tertulis sebagai ucapan saya).
let speakSeq = 0;
function speakAi(text) {
  const seq = ++speakSeq;
  const st = useMeeting.getState();
  const resume = st.voice === 'on' && st.mic;
  if (resume) {
    stopTranscribe();
    Promise.resolve(setMic(false)).catch(() => {});
  }
  const restore = () => {
    const s = useMeeting.getState();
    if (seq === speakSeq && resume && s.joined && s.mic && s.voice === 'on') applyMic(true);
  };
  if (!speak(text, restore)) restore();
}

// Queen Bea standby: setiap kalimat saya yang menyebut namanya dianggap panggilan.
// Pengenal suara sering menulis "Queen" sebagai "kuin"/"quin"/"kwin", jadi semuanya diterima.
const WAKE = /\b(queen|kuin|quin|quinn|kwin)\b/i;
let wakeAt = 0;
let qbBusyTimer = null;
function listenForQueen(text) {
  const st = useMeeting.getState();
  if (!st.live || !st.joined) return;
  let m = text.match(WAKE);
  // "Queen Bea ..." di mana saja, atau "Queen, ..." di awal kalimat (bukan "queen size bed")
  if (m) {
    const named = /^[\s,.:!?-]*(bea|bee|bi|b)\b/i.test(text.slice(m.index + m[0].length));
    const atStart = text.slice(0, m.index).trim().split(/\s+/).filter(Boolean).length <= 1;
    if (!named && !atStart) m = null;
  }
  if (m) {
    const rest = text
      .slice(m.index + m[0].length)
      .replace(/^[\s,.:!?-]*(bea|bee|bi|b)?\b[\s,.:!?-]*/i, '')
      .trim();
    // hanya memanggil nama ("Queen Bea?") -> tunggu kalimat berikutnya sebagai pertanyaan
    if (rest.split(/\s+/).filter(Boolean).length < 3) {
      wakeAt = Date.now();
      return;
    }
    wakeAt = 0;
    askChiefLive(text, st.aiVoice, true);
    return;
  }
  if (wakeAt && Date.now() - wakeAt < 12000) {
    wakeAt = 0;
    askChiefLive(text, st.aiVoice, true);
  }
}

async function askChiefLive(question, voice, spoken = false) {
  const st = useMeeting.getState();
  if (st.chiefBusy) return;
  const q = question.trim() || 'Tolong ringkas rapat sejauh ini dan apa langkah berikutnya.';
  const myName = useAuth.getState().account?.name || 'Saya';
  const nameOf = (l) =>
    l.name || (l.who === 'me' ? myName : l.who === 'ceo' ? 'Queen Bea' : st.people.find((p) => p.id === l.who)?.name || 'Peserta');
  const transcript = st.transcript.filter((l) => l.who !== 'system').map((l) => ({ who: nameOf(l), text: l.text }));
  if (!spoken) {
    // pertanyaan diketik: tampilkan & simpan; pertanyaan lisan sudah masuk transkrip
    st.addLine('me', `👑 ${q}`);
    if (st.voice === 'on') publish({ t: 'tx', text: `👑 ${q}` });
    saveLine('speech', `(bertanya ke Queen Bea) ${q}`);
  }
  if (st.voice === 'on') publish({ t: 'qb', busy: true });
  useMeeting.setState({ chiefBusy: true });
  try {
    const { reply, sources } = await askQueenBea({ mode: 'meeting', messages: [{ role: 'user', content: q }], transcript });
    if (!useMeeting.getState().joined) return;
    useMeeting.getState().say('ceo', reply, Math.min(16000, 2500 + reply.length * 60), { sources });
    if (useMeeting.getState().voice === 'on') publish({ t: 'ai', who: 'ceo', text: reply, sources });
    const cite = sources.length ? `\nSumber: ${sources.map((s) => `${s.title} (${s.url})`).join('; ')}` : '';
    saveLine('ai', `${reply}${cite}`, 'Queen Bea');
    if (voice) speakAi(reply);
  } catch (e) {
    useMeeting.getState().addLine('system', e.message);
  } finally {
    useMeeting.setState({ chiefBusy: false });
    if (useMeeting.getState().voice === 'on') publish({ t: 'qb', busy: false });
  }
}

/* ---------- suara sungguhan (LiveKit) ---------- */

async function joinVoice() {
  const ok = await connectVoice({
    state: (voice, voiceError = '') => {
      if (!useMeeting.getState().joined) return; // sudah keluar
      useMeeting.setState({ voice, voiceError, ...(voice !== 'on' ? { txOn: false, talking: [] } : {}) });
      if (voice !== 'on') stopTranscribe();
    },
    speakers: (talking) => useMeeting.setState({ talking }),
    peers: (list) => {
      useMeeting.setState({ peerMuted: list.filter((p) => p.muted).map((p) => p.id) });
      roomAll = [{ id: myId(), name: '', joinedAt: Date.now() }, ...list.map((p) => ({ id: p.id, name: p.name || 'Staff', joinedAt: Date.now() }))];
      derive();
    },
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
      clearTimeout(partialTimer);
      setPartial('me', '');
      useMeeting.getState().addLine('me', text);
      publish({ t: 'tx', text });
      saveLine('speech', text);
      listenForQueen(text);
    },
    () => useMeeting.setState({ txOn: false }),
    (text) => {
      setPartial('me', text);
      // kirim teks sementara paling sering ~3x per detik (kanal cepat, boleh hilang)
      clearTimeout(partialTimer);
      const send = () => {
        lastPartialAt = Date.now();
        publish({ t: 'part', text: text.slice(-200) }, false);
      };
      const wait = 330 - (Date.now() - lastPartialAt);
      if (wait <= 0) send();
      else partialTimer = setTimeout(send, wait);
    },
  );
  useMeeting.setState({ txOn: started && canTranscribe });
}

function setPartial(id, text, name) {
  useMeeting.setState((s) => {
    const partials = { ...s.partials };
    if (text) partials[id] = { text, name, at: Date.now() };
    else delete partials[id];
    return { partials };
  });
}

function onData(msg, id, name) {
  const st = useMeeting.getState();
  if (msg.t === 'part') setPartial(id, String(msg.text || '').slice(-200), name);
  else if (msg.t === 'tx' && msg.text) {
    setPartial(id, '');
    st.addLine(id, String(msg.text).slice(0, 500), name);
  } else if (msg.t === 'ai' && msg.text) {
    const who = AI_GUESTS.some((a) => a.id === msg.who) ? msg.who : 'ceo';
    const text = String(msg.text).slice(0, 1500);
    const sources = Array.isArray(msg.sources)
      ? msg.sources.filter((x) => typeof x?.url === 'string' && /^https?:\/\//.test(x.url)).slice(0, 5).map((x) => ({ title: String(x.title || x.url).slice(0, 120), url: x.url }))
      : [];
    st.say(who, text, Math.min(16000, 2500 + text.length * 60), { sources });
    if (msg.note) pushNote({ type: 'task', text: String(msg.note).slice(0, 200) });
    // semua peserta mendengar jawaban Queen Bea dari perangkatnya sendiri
    if (st.aiVoice) speakAi(text);
  } else if (msg.t === 'qb') {
    // peserta lain sedang bertanya ke Queen Bea; pengaman kalau pesan "selesai" tidak sampai
    useMeeting.setState({ chiefBusy: !!msg.busy });
    clearTimeout(qbBusyTimer);
    if (msg.busy) qbBusyTimer = setTimeout(() => useMeeting.setState({ chiefBusy: false }), 60000);
  } else if (msg.t === 'end') {
    st.leave({ silent: true }).then(() =>
      useMeeting.setState({ notice: 'Owner mengakhiri rapat. Queen Bea sedang menyusun notulen; lihat di tab Arsip rapat.' }),
    );
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
  channelReady = false;
  myMeta = null;
  presAll = [];
  roomAll = [];
  dbLive = null;
  if (dbChannel) supabase.removeChannel(dbChannel);
  dbChannel = null;
  clearInterval(pollTimer);
  pollTimer = null;
  document.removeEventListener('visibilitychange', onWake);
  window.removeEventListener('online', onOnline);
}
