// Transkrip live + Queen Bea di ruang video Cloudflare (padanan meeting.js untuk rapat suara LiveKit).
// Tiap peserta mentranskrip suaranya sendiri (pengenal suara browser), menyimpan barisnya ke hc_meeting_lines,
// dan membagikannya ke peserta lain lewat broadcast kanal rapat. Notulen dibuat meeting-recap dari baris ini.
import { create } from 'zustand';
import { supabase } from '../../lib/supabase';
import { startTranscribe, stopTranscribe, canTranscribe } from '../voice';
import { askQueenBea } from '../queenBea';
import { speak } from '../ai';
import { queenCall } from '../queenWake';

export const useRoomAssist = create(() => ({
  lines: [], // { id, who: 'me' | 'ceo' | 'system' | uid, name, text, t, sources? }
  partials: {}, // { [uid | 'me']: { text, name, at } }
  queenBusy: false,
  caption: null, // jawaban Queen Bea yang sedang tampil sebagai teks di layar
  txOn: false,
  aiVoice: true, // jawaban Queen Bea dibacakan di perangkat ini
}));

export { canTranscribe };

let call = null;
let meetingId = null;
let me = null;
let micWanted = false;
let wakeAt = 0;
let partialTimer = null;
let lastPartialAt = 0;
let captionTimer = null;
let busyTimer = null;
let speakSeq = 0;

const wibLabel = (ms) => {
  const d = new Date(ms + 7 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const set = useRoomAssist.setState;
const get = useRoomAssist.getState;

function addLine(line) {
  set((s) => ({ lines: [...s.lines, { id: `${Date.now()}-${Math.random()}`, t: wibLabel(Date.now()), ...line }].slice(-150) }));
}
function setPartial(id, text, name) {
  set((s) => {
    const partials = { ...s.partials };
    if (text) partials[id] = { text, name, at: Date.now() };
    else delete partials[id];
    return { partials };
  });
}
function showCaption(text, sources) {
  clearTimeout(captionTimer);
  set({ caption: { text, sources } });
  captionTimer = setTimeout(() => set({ caption: null }), Math.min(20000, 4000 + text.length * 55));
}

async function saveLine(kind, text, speakerName) {
  if (!meetingId) return;
  const { error } = await supabase.from('hc_meeting_lines').insert({ meeting_id: meetingId, speaker_name: (speakerName || me?.name || 'Staff').slice(0, 60), kind, text: text.slice(0, 2000) });
  if (error) console.warn('transkrip gagal disimpan', error.message);
}

// transkrip yang sudah ada (peserta yang datang terlambat)
async function loadLines() {
  const { data } = await supabase
    .from('hc_meeting_lines')
    .select('id, speaker_id, speaker_name, kind, text, created_at')
    .eq('meeting_id', meetingId)
    .neq('kind', 'chat')
    .order('created_at')
    .limit(300);
  return (data || []).map((r) => ({
    id: `db-${r.id}`,
    who: r.kind === 'join' || r.kind === 'leave' ? 'system' : r.kind === 'ai' ? 'ceo' : r.speaker_id === me.id ? 'me' : r.speaker_id,
    name: r.speaker_name,
    text: r.text,
    t: wibLabel(new Date(r.created_at).getTime()),
  }));
}

/* ---------- mic & pengenal suara ---------- */
function startTx() {
  if (!canTranscribe) return;
  const ok = startTranscribe(
    (text) => {
      clearTimeout(partialTimer);
      setPartial('me', '');
      addLine({ who: 'me', name: me.name, text });
      call?.broadcast({ t: 'tx', text: text.slice(0, 500) });
      saveLine('speech', text);
      listenForQueen(text);
    },
    () => set({ txOn: false }),
    (text) => {
      setPartial('me', text, me.name);
      // teks sementara paling sering ~3x per detik
      clearTimeout(partialTimer);
      const send = () => {
        lastPartialAt = Date.now();
        call?.broadcast({ t: 'part', text: text.slice(-200) });
      };
      const wait = 330 - (Date.now() - lastPartialAt);
      if (wait <= 0) send();
      else partialTimer = setTimeout(send, wait);
    },
  );
  set({ txOn: ok });
}

// dipanggil ruang video setiap status mic saya berubah
export function micChanged(on) {
  micWanted = on;
  if (on && !get().txOn) startTx();
  if (!on) {
    stopTranscribe();
    setPartial('me', '');
    set({ txOn: false });
  }
}

/* ---------- Queen Bea ---------- */
function listenForQueen(text) {
  const c = queenCall(text);
  if (c) {
    if (c.wakeOnly) {
      wakeAt = Date.now();
      return;
    }
    wakeAt = 0;
    ask(text, true);
    return;
  }
  if (wakeAt && Date.now() - wakeAt < 12000) {
    wakeAt = 0;
    ask(text, true);
  }
}

// Saat Queen Bea bicara dari speaker, mic & transkrip saya dijeda supaya suaranya tidak tertangkap ulang.
function speakAi(text) {
  if (!get().aiVoice) return;
  const seq = ++speakSeq;
  if (micWanted) {
    stopTranscribe();
    call?.setMic(false);
  }
  // nyalakan lagi hanya kalau pengguna tidak mematikan mic-nya sendiri selama Queen bicara
  const restore = () => {
    if (seq !== speakSeq || !micWanted || !call) return;
    call.setMic(true);
    startTx();
  };
  if (!speak(text, restore)) restore();
}

export async function ask(question, spoken = false) {
  if (get().queenBusy || !call) return;
  const q = String(question || '').trim() || 'Tolong ringkas rapat sejauh ini dan apa langkah berikutnya.';
  const transcript = get()
    .lines.filter((l) => l.who !== 'system')
    .map((l) => ({ who: l.who === 'ceo' ? 'Queen Bea' : l.who === 'me' ? me.name : l.name || 'Peserta', text: l.text }));
  if (!spoken) {
    addLine({ who: 'me', name: me.name, text: `👑 ${q}` });
    call.broadcast({ t: 'tx', text: `👑 ${q}` });
    saveLine('speech', `(bertanya ke Queen Bea) ${q}`);
  }
  set({ queenBusy: true });
  call.broadcast({ t: 'qb', busy: true });
  try {
    const { reply, sources } = await askQueenBea({ mode: 'meeting', messages: [{ role: 'user', content: q }], transcript });
    if (!call) return;
    addLine({ who: 'ceo', name: 'Queen Bea', text: reply, sources });
    showCaption(reply, sources);
    call.broadcast({ t: 'ai', text: reply.slice(0, 1500), sources: (sources || []).slice(0, 5) });
    const cite = sources?.length ? `\nSumber: ${sources.map((s) => `${s.title} (${s.url})`).join('; ')}` : '';
    saveLine('ai', `${reply}${cite}`, 'Queen Bea');
    speakAi(reply);
  } catch (e) {
    addLine({ who: 'system', text: e.message });
  } finally {
    set({ queenBusy: false });
    call?.broadcast({ t: 'qb', busy: false });
  }
}

// pesan dari peserta lain (diteruskan cfCall sebagai { t: 'data' })
export function onData(msg, from) {
  const id = from.uid || from.key;
  if (msg.t === 'part') setPartial(id, String(msg.text || '').slice(-200), from.name);
  else if (msg.t === 'tx' && msg.text) {
    setPartial(id, '');
    addLine({ who: id, name: from.name, text: String(msg.text).slice(0, 500) });
  } else if (msg.t === 'ai' && msg.text) {
    const text = String(msg.text).slice(0, 1500);
    const sources = Array.isArray(msg.sources)
      ? msg.sources.filter((x) => typeof x?.url === 'string' && /^https?:\/\//.test(x.url)).slice(0, 5).map((x) => ({ title: String(x.title || x.url).slice(0, 120), url: x.url }))
      : [];
    addLine({ who: 'ceo', name: 'Queen Bea', text, sources });
    showCaption(text, sources);
    // semua peserta mendengar jawaban Queen Bea dari perangkatnya sendiri
    speakAi(text);
  } else if (msg.t === 'qb') {
    set({ queenBusy: !!msg.busy });
    clearTimeout(busyTimer);
    if (msg.busy) busyTimer = setTimeout(() => set({ queenBusy: false }), 60000);
  }
}

/* ---------- pasang / lepas ---------- */
export async function attach(c, { meetingId: id, me: who }) {
  call = c;
  meetingId = id;
  me = who;
  set({ lines: [], partials: {}, queenBusy: false, caption: null, txOn: false });
  const earlier = await loadLines();
  if (call !== c) return;
  set((s) => ({ lines: [...earlier, ...s.lines].slice(-150) }));
  saveLine('join', `${me.name} bergabung`);
}

export function detach({ silent = false } = {}) {
  if (!call) return;
  if (!silent) saveLine('leave', `${me.name} keluar`);
  stopTranscribe();
  speakSeq++;
  window.speechSynthesis?.cancel();
  clearTimeout(partialTimer);
  clearTimeout(captionTimer);
  call = null;
  micWanted = false;
  set({ txOn: false, partials: {}, caption: null, queenBusy: false });
}

export const setAiVoice = (on) => {
  set({ aiVoice: on });
  if (!on) window.speechSynthesis?.cancel();
};
