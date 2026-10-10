// Obrolan koloni ("public mic"): ruang suara bebas di halaman koloni untuk staff yang login.
// Siapa pun yang online bisa gabung dan langsung ngobrol; tanda bicara muncul di atas avatarnya.
// Hemat kuota LiveKit: keluar otomatis kalau sendirian 5 menit atau saat meninggalkan halaman koloni.
import { create } from 'zustand';
import { createVoiceRoom, roomStatus } from '../hall/voice';
import { useAuth } from './auth';

const room = createVoiceRoom('plaza');
const ALONE_MS = 5 * 60 * 1000;
const POLL_MS = 20000;
let aloneTimer = null;
let pollTimer = null;

const myId = () => useAuth.getState().session?.user?.id;
// id pembicara LiveKit -> id walker di taman ("me" untuk saya, "u-<uid>" untuk staff lain)
export const walkerIdOf = (id) => (id === 'me' ? 'me' : `u-${id}`);

export const usePlaza = create((set, get) => ({
  state: 'off', // off | connecting | on | error
  error: '',
  notice: '',
  mic: true,
  peers: [], // peserta lain [{ id, name, muted }]
  talking: [], // id walker yang sedang bicara
  audioBlocked: false,
  waiting: [], // orang yang sedang ngobrol saat saya belum gabung

  join: async () => {
    if (!useAuth.getState().account || get().state === 'connecting' || get().state === 'on') return;
    set({ error: '', notice: '', mic: true });
    const ok = await room.connect({
      state: (state, error = '') => {
        set({ state, error, ...(state !== 'on' ? { talking: [] } : {}) });
        if (state === 'error') clearTimeout(aloneTimer);
      },
      speakers: (ids) => set({ talking: ids.map(walkerIdOf) }),
      peers: (list) => {
        set({ peers: list, waiting: [] });
        // sendirian terlalu lama -> keluar otomatis supaya tidak menghabiskan kuota
        clearTimeout(aloneTimer);
        if (list.length === 0) aloneTimer = setTimeout(() => get().leave('Keluar otomatis: 5 menit tidak ada yang ikut ngobrol.'), ALONE_MS);
      },
      audioBlocked: (audioBlocked) => set({ audioBlocked }),
    });
    if (!ok) return;
    try {
      await room.setMic(true);
    } catch {
      set({ mic: false, error: 'Izin mikrofon ditolak. Kamu tetap bisa mendengar; izinkan mikrofon lalu nyalakan mic.' });
    }
  },

  leave: (notice = '') => {
    clearTimeout(aloneTimer);
    room.disconnect();
    set({ state: 'off', peers: [], talking: [], audioBlocked: false, error: '', notice });
    if (pollTimer) poll();
  },

  toggleMic: async () => {
    const on = !get().mic;
    try {
      await room.setMic(on);
      set({ mic: on, error: '' });
    } catch {
      set({ mic: false, error: 'Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser.' });
    }
  },

  unlockAudio: () => room.startAudio()?.then(() => set({ audioBlocked: false })),
}));

// siapa yang sedang ngobrol (dicek berkala selama di halaman koloni dan belum gabung)
async function poll() {
  const st = usePlaza.getState();
  if (!useAuth.getState().account || st.state === 'on' || st.state === 'connecting' || document.hidden) return;
  const list = await roomStatus('plaza');
  if (!list) return;
  const me = myId();
  usePlaza.setState({ waiting: list.filter((p) => p.id !== me) });
}

export function startPlazaWatch() {
  stopPlazaWatch();
  poll();
  pollTimer = setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', poll);
}

export function stopPlazaWatch() {
  clearInterval(pollTimer);
  pollTimer = null;
  document.removeEventListener('visibilitychange', poll);
  if (usePlaza.getState().state !== 'off') usePlaza.getState().leave();
  usePlaza.setState({ waiting: [] });
}
