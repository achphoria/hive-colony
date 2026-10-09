import { create } from 'zustand';
import { TIER_GAP, ROOM_BY_ID } from '../data/hive';

const DEFAULT_FOCUS = { target: [0, 7, 0], dist: 68 };

export const useHive = create((set) => ({
  floor: 'all',
  speed: 1,
  paused: false,
  selectedAgent: null,
  selectedRoom: null,
  hoverRoom: null,
  missions: [],
  log: [],
  stats: { done: 0, honey: 0 },
  agentStates: {},
  focus: { ...DEFAULT_FOCUS, key: 0 },

  focusOn: (target, dist, dir = null) => set((s) => ({ focus: { target, dist, dir, key: s.focus.key + 1 } })),
  setFloor: (floor) =>
    set((s) => ({
      floor,
      selectedRoom: null,
      focus:
        floor === 'all'
          ? { ...DEFAULT_FOCUS, key: s.focus.key + 1 }
          : { target: [0, floor * TIER_GAP + 1.2, 0], dist: 46, key: s.focus.key + 1 },
    })),
  selectRoom: (id) =>
    set((s) => {
      const r = ROOM_BY_ID[id];
      return {
        selectedRoom: id,
        selectedAgent: null,
        floor: r.tier,
        focus: { target: [r.x, r.y + 1, r.z], dist: 32, key: s.focus.key + 1 },
      };
    }),
  selectAgent: (id) => set({ selectedAgent: id, selectedRoom: null }),
  clearSelection: () => set({ selectedAgent: null, selectedRoom: null }),
  setHoverRoom: (id) => set({ hoverRoom: id }),
  setSpeed: (speed) => set({ speed, paused: false }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  pushLog: (entry) => set((s) => ({ log: [entry, ...s.log].slice(0, 40) })),
  resetView: () =>
    set((s) => ({ floor: 'all', selectedRoom: null, selectedAgent: null, focus: { ...DEFAULT_FOCUS, key: s.focus.key + 1 } })),
}));
