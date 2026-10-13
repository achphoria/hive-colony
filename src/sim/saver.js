// Mode hemat: tanpa efek pascaproses (bloom/vignette), tanpa bayangan, resolusi render maks. 1x.
// Untuk laptop/TV dengan GPU bawaan. Pilihan disimpan per browser.
import { create } from 'zustand';

const KEY = 'hive.saver';
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const useSaver = create((set, get) => ({
  on: read(),
  toggle: () => {
    const on = !get().on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* hanya untuk sesi ini */
    }
    set({ on });
  },
}));
