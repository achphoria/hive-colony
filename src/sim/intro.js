// Mode Intro (#/intro): video perkenalan ±80 detik yang diputar dari scene 3D asli.
// Waktu diputar oleh IntroDirector (di dalam kanvas) dan dibaca teks di atasnya (IntroOverlay).
import { create } from 'zustand';

export const INTRO_LEN = 82; // detik

// status: ready (layar mulai) | playing | done
export const useIntro = create((set, get) => ({
  status: 'ready',
  t: 0,
  clock: 6,
  run: 0, // naik setiap kali diputar (ulang), supaya sutradara mulai dari awal
  from: 0, // detik awal pemutaran (#/intro?t=30 untuk merekam ulang satu bagian)
  start: (from = 0) => set({ status: 'playing', t: from, from, run: get().run + 1 }),
  finish: () => set({ status: 'done' }),
  reset: () => set({ status: 'ready', t: 0 }),
}));
