// Data untuk layar dinding Hive Hall, dibaca live dari simulasi koloni.
import { useEffect, useState } from 'react';
import { AGENTS, AGENT_BY_ID, DEPTS } from '../data/hive';
import { DEMO_STAFF } from '../data/staff';
import { useHive } from '../sim/store';
import { world } from '../sim/engine';
import { outdoor } from '../sim/outdoor';
import { useAuth } from '../sim/auth';
import { useAi, modelLabel } from '../hall/queenBea';

// jam WIB (desimal) dari timestamp database
const wibHourOf = (iso) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

export const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const hhmm = (h) => {
  if (h === undefined) return '--:--';
  const m = Math.floor((h % 1) * 60);
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
export const DAY = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const MONTH = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const wibNow = () => new Date(Date.now() + 7 * 3600e3); // dibaca dengan getter UTC
export const dayStart = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function demoEvents() {
  const base = dayStart(wibNow());
  const mk = (off, title, color, big) => ({ ts: base + off * 864e5, title, color, big });
  return [
    mk(-2, 'Evaluasi skill agent', '#7F77DD'),
    mk(1, 'Kelas HYROX 06.00', '#4A6FA5'),
    mk(2, 'Rapat budget', '#C98A00'),
    mk(4, 'Cek alat race', '#8DBF5A'),
    mk(5, 'Simulation Race', '#FF8C1A', true),
    mk(9, 'Proses payroll', '#D99A2B'),
    mk(12, 'Onboarding coach baru', '#4A6FA5'),
  ];
}

// Teks ringkas untuk layar dinding (lebar terbatas)
export function feedText(e) {
  const after = e.text.includes(': ') ? e.text.split(': ').slice(1).join(': ') : e.text;
  switch (e.kind) {
    case 'dispatch':
      return `Misi ${DEPTS[e.dept]?.short || ''}: ${after}`;
    case 'done':
      return e.text.startsWith('Owner') ? e.text : `${e.text.split(' ')[0]} selesai misi`;
    case 'meeting':
      return 'Rapat di Comb Hall';
    case 'guest':
      return 'Tamu masuk Hive Lobby';
    case 'clock':
      return e.text.startsWith('Malam') ? 'Malam: jaga malam aktif' : 'Pagi: koloni bangun';
    default:
      return e.text;
  }
}

export function useTick(ms) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function skillScores() {
  return AGENTS.filter((a) => a.id !== 'ceo')
    .map((a) => {
      const base = 70 + ((a.id.length * 7 + a.id.charCodeAt(0)) % 15);
      const done = world.doneBy[a.id] || 0;
      return { id: a.id, nick: a.nick, done, score: Math.min(99, base + done * 3) };
    })
    .sort((x, y) => y.score - x.score);
}

export function useHallData(me) {
  useTick(1000);
  const log = useHive((s) => s.log);
  const missions = useHive((s) => s.missions);
  const stats = useHive((s) => s.stats);
  const approvals = useHive((s) => s.approvals);
  const agentStates = useHive((s) => s.agentStates);
  const onlineStaff = useHive((s) => s.onlineStaff);
  const dbActivity = useHive((s) => s.dbActivity);
  const planTasks = useHive((s) => s.planTasks);
  const account = useAuth((s) => s.account);
  const ai = useAi();
  const real = !!account; // mode real: hanya data sungguhan dari database

  // mode real: aktivitas sungguhan saja (database, terbaru di atas)
  // mode demo: aktivitas agent simulasi + aktivitas manusia
  const human = dbActivity.map((a) => ({ id: `db-${a.id}`, at: new Date(a.created_at).getTime(), clock: wibHourOf(a.created_at), text: a.text, kind: 'human' }));
  const merged = real ? human : [...log.map((e) => ({ ...e, text: feedText(e) })), ...human].sort((a, b) => (b.clock ?? 0) - (a.clock ?? 0));
  const feed = merged.slice(0, 6).map((e) => ({ id: e.id, t: hhmm(e.clock), text: e.text, kind: e.kind }));

  const pending = approvals.filter((a) => a.status === 'pending');
  const openTasks = planTasks.filter((t) => t.col !== 'done');
  const open = [
    ...pending.map((a) => ({ title: a.title, sub: `${a.by} · tunggu Anda`, color: '#E24B4A' })),
    ...(real ? openTasks.map((t) => ({ title: t.title, sub: `${t.who} · ${t.col === 'doing' ? 'jalan' : 'belum'}`, color: t.col === 'doing' ? '#F5B700' : '#C0C5CE' })) : []),
    ...[...(real ? [] : missions)]
      .sort((a, b) => a.progress - b.progress)
      .map((m) => ({
        title: m.title,
        sub: `${AGENT_BY_ID[m.leadId].nick} · ${Math.round(m.progress * 100)}%`,
        color: m.progress < 0.3 ? '#F5B700' : '#C0C5CE',
      })),
  ];

  const now = wibNow();
  const dow = (now.getUTCDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + (i - dow) * 864e5));
  const wStart = dayStart(week[0]);
  const events = real ? [] : demoEvents().filter((e) => e.ts >= wStart && e.ts < wStart + 7 * 864e5);

  const awake = Object.values(agentStates).filter((a) => a.state !== 'sleep').length;
  const aiOn = ai.status === 'on' ? 1 : 0;
  const ticker = real
    ? [
        `${hhmm(stats.clock)} WIB`,
        `Staff online ${onlineStaff.length + 1}`,
        `Agent tersambung AI ${aiOn}/21`,
        `Persetujuan menunggu ${pending.length}`,
        `Tugas terbuka ${openTasks.length}`,
        dbActivity.length ? `Aktivitas terakhir ${hhmm(wibHourOf(dbActivity[0].created_at))}` : 'Belum ada aktivitas',
      ]
    : [
    `${hhmm(stats.clock)} WIB`,
    `Madu ${stats.honey}`,
    `Misi selesai ${stats.done}`,
    `Misi berjalan ${missions.length}`,
    `Agent aktif ${awake}/21`,
    `Persetujuan menunggu ${pending.length}`,
      ];

  const online = account
    ? [
        { name: `${me.name || 'Anda'} (Anda)`, color: me.outfitColor, where: 'rapat', here: true },
        ...onlineStaff.map((o) => ({
          name: o.name || 'Staff',
          color: o.outfitColor,
          here: o.page === '/hall',
          where: o.page === '/hall' ? 'rapat' : o.dancing ? 'joget di taman' : 'di koloni',
        })),
      ]
    : [
        { name: `${me.name || 'Anda'} (Anda)`, color: me.outfitColor, where: 'rapat', here: true },
        ...DEMO_STAFF.map((s, i) => {
          const w = outdoor.byId[s.id];
          return { name: s.name, color: s.outfitColor, here: i === 0, where: i === 0 ? 'rapat' : w?.state === 'dance' ? 'joget di taman' : s.spot };
        }),
      ];

  const skills = skillScores();
  const mover = [...skills].sort((a, b) => b.done - a.done)[0];
  // mode real: panel "Agent AI" menggantikan skor skill simulasi
  const aiAgents = [
    { id: 'ceo', nick: 'Queen Bea', on: ai.status === 'on', model: ai.status === 'on' ? modelLabel(ai.model) : ai.status === 'unknown' ? 'memeriksa…' : 'belum tersambung' },
  ];

  return { real, feed, open, week, dow, events, ticker, online, skills: skills.slice(0, 5), mover, aiAgents, aiOn, pending: pending.length };
}
