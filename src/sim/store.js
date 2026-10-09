import { create } from 'zustand';
import { TIER_GAP, ROOM_BY_ID } from '../data/hive';
import { loadProfile } from '../data/staff';

const DEFAULT_FOCUS = { target: [0, 7, 0], dist: 68 };

// Isi awal Hive Hall (mode demo): tugas rencana HYROX Simulation Race dan antrean persetujuan.
const PLAN_TASKS = [
  { id: 't1', title: 'Rute dan 8 stasiun race', who: 'Sprint', kind: 'ai', col: 'doing' },
  { id: 't2', title: 'Pinjam 2 sled, servis rower', who: 'Dina', kind: 'human', col: 'todo' },
  { id: 't3', title: 'Landing page + iklan IG', who: 'Spark', kind: 'ai', col: 'doing' },
  { id: 't4', title: 'Hitung budget dan sponsor', who: 'Graph', kind: 'ai', col: 'todo' },
  { id: 't5', title: 'Sewa sound system dan MC', who: 'Rudi', kind: 'human', col: 'todo' },
  { id: 't6', title: 'Tetapkan tanggal race', who: 'Anda', kind: 'human', col: 'done' },
];
const APPROVALS = [
  { id: 'a1', title: 'Iklan IG "Road to HYROX"', by: 'Spark', dept: 'mkt', detail: 'Budget Rp1,5 juta, 7 hari, target radius 10 km dari gym.', status: 'pending' },
  { id: 'a2', title: 'Menu smoothie race day', by: 'Maple', dept: 'ops', detail: '3 menu baru, harga Rp28–35 ribu, bahan dari vendor lama.', status: 'pending' },
  { id: 'a3', title: 'Refund paket member (Rp850 ribu)', by: 'Penny', dept: 'hr', detail: 'Member pindah kota, sesuai syarat refund pasal 4.', status: 'pending' },
];

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
  profile: loadProfile(),
  outdoorVersion: 0,
  planTasks: PLAN_TASKS,
  approvals: APPROVALS,

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

  setProfile: (profile) => set((s) => ({ profile, outdoorVersion: s.outdoorVersion + 1 })),
  bumpOutdoor: () => set((s) => ({ outdoorVersion: s.outdoorVersion + 1 })),
  advanceTask: (id) =>
    set((s) => ({
      planTasks: s.planTasks.map((t) =>
        t.id === id ? { ...t, col: t.col === 'todo' ? 'doing' : t.col === 'doing' ? 'done' : 'todo' } : t,
      ),
    })),
  decideApproval: (id, status) =>
    set((s) => ({ approvals: s.approvals.map((a) => (a.id === id ? { ...a, status } : a)) })),
}));
