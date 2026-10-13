// Mode TV (spectator): status shot kamera yang sedang tayang, dibaca overlay layar besar.
import { create } from 'zustand';

export const useTv = create((set) => ({
  // caption: { type: 'agent' | 'staff' | 'floor' | 'orbit', id?, kicker, title, sub }
  caption: null,
  skip: 0, // dinaikkan untuk lompat ke shot berikutnya
  next: () => set((s) => ({ skip: s.skip + 1 })),
}));
