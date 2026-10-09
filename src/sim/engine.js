// Mesin simulasi: jam siang-malam, pergerakan agent, istirahat, tidur, rapat, tamu lobby, dan alur misi.
// State per-frame disimpan di objek `world` (mutable) supaya React tidak re-render tiap frame;
// ringkasan untuk UI dikirim ke store beberapa kali per detik.
import * as THREE from 'three';
import {
  AGENTS,
  SEATS,
  ROOM_BY_ID,
  MISSIONS,
  DEPTS,
  AGENT_BY_ID,
  LIFT_X,
  DAY_LEN,
  NIGHT_SHIFT,
  GUESTS,
  LOBBY_DOOR,
  tierY,
  tierOf,
  roomSpots,
  isNightHour,
} from '../data/hive';
import { useHive } from './store';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CRUISE = 3.5;
const SPEED = 4.4;
const WALK = 2.3;
const MAX_ACTIVE = 5;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

// Jam Jakarta (WIB = UTC+7, tanpa daylight saving) dalam bentuk desimal 0-24
export function wibHour() {
  return (Date.now() / 3600000 + 7) % 24;
}

export const world = {
  agents: [],
  guests: [],
  byId: {},
  missions: [],
  effects: [],
  events: [],
  glow: {},
  occupancy: {},
  time: 0,
  clock: wibHour(), // jam dalam game (0-24)
  clockMode: 'wib', // 'wib' = ikut jam Jakarta realtime, 'sim' = jam simulasi cepat
  night: false,
  nightFactor: 0, // 0 siang, 1 malam (diisi oleh DayNight untuk visual)
  door: 0,
  doorOpen: false,
  nextMission: 2.5,
  nextMeeting: 28,
  nextGuest: 10,
  uiTimer: 0,
  seq: 1,
  honey: 0,
  done: 0,
};

for (const def of AGENTS) {
  const s = SEATS[def.id];
  const a = {
    id: def.id,
    def,
    seat: s,
    pos: V(...s.seat),
    targetFacing: s.facing,
    state: 'desk',
    arriveState: null,
    roomId: s.roomId,
    path: null,
    pathIdx: 0,
    speed: SPEED,
    dest: null,
    timer: 0,
    missionId: null,
    spot: null,
    cheer: 0,
    lane: world.agents.length * 2.4,
  };
  world.agents.push(a);
  world.byId[a.id] = a;
}

for (const def of GUESTS) {
  const g = {
    id: def.id,
    def,
    guest: true,
    active: false,
    pos: V(...def.path[0]),
    targetFacing: Math.PI,
    state: 'hidden',
    arriveState: null,
    roomId: null,
    path: null,
    pathIdx: 0,
    speed: WALK,
    dest: null,
    timer: 0,
    missionId: null,
    cheer: 0,
  };
  world.guests.push(g);
  world.byId[g.id] = g;
}

const emit = (type) => world.events.push(type);
const log = (kind, text, dept) =>
  useHive.getState().pushLog({ id: `${kind}-${world.seq++}`, kind, dept, text, time: world.time });

function seatDest(a) {
  return { pos: V(...a.seat.seat), tier: ROOM_BY_ID[a.seat.roomId].tier, facing: a.seat.facing, roomId: a.seat.roomId };
}

function makePath(from, fromTier, to, toTier, lane = 0) {
  const cf = tierY(fromTier) + CRUISE;
  const ct = tierY(toTier) + CRUISE;
  const pts = [from.clone(), V(from.x, cf, from.z)];
  if (fromTier !== toTier) {
    // tiap agent punya jalur sendiri di dalam tabung lift supaya tidak menumpuk
    const lx = LIFT_X + Math.cos(lane) * 0.65;
    const lz = Math.sin(lane) * 0.65;
    pts.push(V(lx, cf, lz), V(lx, ct, lz));
  }
  pts.push(V(to.x, ct, to.z), to.clone());
  return pts;
}

function sendTo(a, dest, arriveState, duration = 0) {
  if (a.spot) {
    world.occupancy[a.spot] = false;
    a.spot = null;
  }
  if (dest.spotKey) {
    world.occupancy[dest.spotKey] = true;
    a.spot = dest.spotKey;
  }
  a.dest = dest;
  a.arriveState = arriveState;
  a.timer = duration;
  if (a.pos.distanceTo(dest.pos) < 0.05) {
    arrive(a);
    return;
  }
  a.path = makePath(a.pos, tierOf(a.pos.y), dest.pos, dest.tier, a.lane);
  a.pathIdx = 1;
  a.speed = SPEED;
  a.state = 'fly';
  a.roomId = null;
}

function arrive(a) {
  a.path = null;
  a.pos.copy(a.dest.pos);
  a.targetFacing = a.dest.facing;
  a.state = a.arriveState;
  a.roomId = a.dest.roomId;
}

function goHome(a) {
  sendTo(a, seatDest(a), 'desk');
}

function claimSpot(roomId) {
  const room = ROOM_BY_ID[roomId];
  const spots = roomSpots(roomId);
  const free = spots.map((s, i) => i).filter((i) => !world.occupancy[`${roomId}:${i}`]);
  if (!free.length) return null;
  const i = pick(free);
  const s = spots[i];
  return {
    pos: V(room.x + s.local[0], room.y, room.z + s.local[2]),
    tier: room.tier,
    facing: s.facing,
    roomId,
    spotKey: `${roomId}:${i}`,
  };
}

function stepAgent(a, dt) {
  a.cheer = Math.max(0, a.cheer - dt * 1.6);
  if (a.path) {
    let remain = a.speed * dt;
    const before = a.pos.clone();
    while (remain > 0 && a.pathIdx < a.path.length) {
      const target = a.path[a.pathIdx];
      const d = target.distanceTo(a.pos);
      if (d <= remain) {
        a.pos.copy(target);
        remain -= d;
        a.pathIdx++;
      } else {
        a.pos.addScaledVector(target.clone().sub(a.pos).normalize(), remain);
        remain = 0;
      }
    }
    const dx = a.pos.x - before.x;
    const dz = a.pos.z - before.z;
    if (dx * dx + dz * dz > 1e-6) a.targetFacing = Math.atan2(dx, dz);
    if (a.pathIdx >= a.path.length) arrive(a);
    return;
  }
  if (!a.missionId && (a.state === 'break' || a.state === 'charge' || a.state === 'meeting')) {
    a.timer -= dt;
    if (a.timer <= 0) goHome(a);
  }
}

function isAway(a) {
  if (a.state === 'fly') return a.arriveState !== 'desk';
  return a.state === 'break' || a.state === 'charge' || a.state === 'meeting';
}

function goBreak(a) {
  const roll = Math.random();
  const roomId = roll < 0.34 ? 'lounge' : roll < 0.58 ? 'gym' : roll < 0.78 ? 'pods' : 'garden';
  const dest = claimSpot(roomId);
  if (!dest) return;
  sendTo(a, dest, roomId === 'pods' ? 'charge' : 'break', rand(9, 16));
}

const sleeping = (a) => a.state === 'sleep' || (a.state === 'fly' && a.arriveState === 'sleep');

function goSleep(a) {
  if (a.id === 'ceo') {
    sendTo(a, seatDest(a), 'sleep');
    return;
  }
  for (const roomId of ['pods', 'lounge', 'garden']) {
    const dest = claimSpot(roomId);
    if (dest) {
      sendTo(a, dest, 'sleep');
      return;
    }
  }
  sendTo(a, seatDest(a), 'sleep');
}

function behaviours(dt) {
  // malam: agent Hybrid tidur, agent Full AI / Full Tech tetap jaga malam
  for (const a of world.agents) {
    if (a.missionId) continue;
    if (world.night && !NIGHT_SHIFT.has(a.id)) {
      if (!sleeping(a) && ['desk', 'break', 'charge'].includes(a.state) && Math.random() < dt / 2.5) goSleep(a);
    } else if (a.state === 'sleep' && Math.random() < dt / 2.5) {
      goHome(a);
    }
  }

  let away = world.agents.filter(isAway).length;
  for (const a of world.agents) {
    if (a.state !== 'desk' || a.missionId) continue;
    if (world.night && !NIGHT_SHIFT.has(a.id)) continue;
    if (a.id === 'ceo') {
      if (Math.random() < dt / 55) {
        const dest = claimSpot('mission');
        if (dest) sendTo(a, dest, 'break', rand(8, 12));
      }
      continue;
    }
    if (away < 7 && Math.random() < dt / 38) {
      goBreak(a);
      away++;
    }
  }

  world.nextMeeting -= dt;
  if (world.nextMeeting <= 0 && !world.night) {
    world.nextMeeting = rand(40, 60);
    const free = shuffle(world.agents.filter((a) => a.state === 'desk' && !a.missionId && a.id !== 'ceo'));
    const seen = new Set();
    const team = [];
    for (const a of free) {
      if (seen.has(a.def.dept)) continue;
      seen.add(a.def.dept);
      team.push(a);
      if (team.length >= 4) break;
    }
    if (team.length >= 3) {
      for (const a of team) {
        const dest = claimSpot('hall');
        if (dest) sendTo(a, dest, 'meeting', rand(13, 17));
      }
      log('meeting', `Rapat di Comb Hall: ${team.map((a) => a.def.nick).join(', ')}`);
    }
  }
}

function visitDest(lead) {
  const s = lead.seat;
  const a = s.angle;
  const tx = -Math.sin(a);
  const tz = Math.cos(a);
  const pos = V(s.seat[0] + tx * 0.95, s.seat[1], s.seat[2] + tz * 0.95);
  const facing = Math.atan2(s.deskWorld[0] - pos.x, s.deskWorld[2] - pos.z);
  return { pos, tier: ROOM_BY_ID[s.roomId].tier, facing, roomId: s.roomId };
}

function canTake(a) {
  if (!a || a.missionId || a.state === 'meeting' || a.state === 'sleep') return false;
  if (a.state === 'fly' && (a.arriveState === 'meeting' || a.arriveState === 'sleep')) return false;
  return !world.night || NIGHT_SHIFT.has(a.id);
}

function spawnMission(template) {
  let t = template;
  if (!t) {
    const options = MISSIONS.filter((m) => canTake(world.byId[m.lead]));
    if (!options.length) return;
    t = pick(options);
  }
  const lead = world.byId[t.lead];
  if (!canTake(lead)) return;
  const collab = t.with && canTake(world.byId[t.with]) ? world.byId[t.with] : null;
  const m = {
    id: world.seq++,
    title: t.title,
    dept: lead.def.dept,
    leadId: lead.id,
    collabId: collab ? collab.id : null,
    roomId: lead.seat.roomId,
    phase: 'dispatch',
    t: 0,
    progress: 0,
    duration: rand(14, 24),
    reward: Math.round(rand(8, 20)),
  };
  lead.missionId = m.id;
  if (collab) collab.missionId = m.id;
  if (lead.state !== 'desk') goHome(lead);

  const ceo = world.byId.ceo;
  const from = world.night ? ROOM_BY_ID.mission : null;
  if (!world.night) ceo.cheer = 1;
  const room = ROOM_BY_ID[m.roomId];
  world.effects.push({
    type: 'drop',
    from: from ? V(from.x, from.y + 3, from.z) : V(ceo.pos.x, ceo.pos.y + 2.4, ceo.pos.z),
    to: V(room.x, room.y + 3.4, room.z),
    t: 0,
    dur: 2.2,
  });
  world.missions.push(m);
  emit('dispatch');
  const sender = world.night ? 'Mission Control (jaga malam)' : 'Queen Bea';
  log('dispatch', `${sender} mengirim misi ke ${DEPTS[m.dept].short}: ${m.title}`, m.dept);
}

function completeMission(m) {
  m.phase = 'done';
  const lead = world.byId[m.leadId];
  lead.missionId = null;
  lead.cheer = 1;
  if (m.collabId) {
    const c = world.byId[m.collabId];
    c.missionId = null;
    goHome(c);
  }
  world.done++;
  world.honey += m.reward;
  world.glow[m.roomId] = 1;
  const room = ROOM_BY_ID[m.roomId];
  world.effects.push({
    type: 'burst',
    at: V(room.x, room.y + 1.6, room.z),
    dirs: Array.from({ length: 14 }, () => V(rand(-1, 1), rand(0.6, 1.6), rand(-1, 1))),
    t: 0,
    dur: 1.4,
  });
  emit('complete');
  log('done', `${AGENT_BY_ID[m.leadId].nick} menyelesaikan "${m.title}" (+${m.reward} madu)`, m.dept);
}

function missions(dt) {
  world.nextMission -= dt;
  const active = world.missions.filter((m) => m.phase !== 'done');
  if (world.nextMission <= 0) {
    world.nextMission = world.night ? rand(11, 17) : rand(6, 11);
    if (active.length < MAX_ACTIVE) spawnMission();
  }
  for (const m of active) {
    m.t += dt;
    const lead = world.byId[m.leadId];
    const collab = m.collabId ? world.byId[m.collabId] : null;
    if (m.phase === 'dispatch' && m.t >= 2.2) {
      m.phase = 'gather';
      if (collab) sendTo(collab, visitDest(lead), 'visit');
    }
    const ready = lead.state === 'desk' && (!collab || collab.state === 'visit');
    if (m.phase === 'gather' && ready) m.phase = 'work';
    if (m.phase === 'work' && ready) {
      m.progress = Math.min(1, m.progress + dt / m.duration);
      if (m.progress >= 1) completeMission(m);
    }
  }
  world.missions = world.missions.filter((m) => m.phase !== 'done');
}

/* ---------- tamu lobby ---------- */

function walkPath(g, points, arriveState, facing) {
  g.path = points.map((p) => V(...p));
  g.pathIdx = 1;
  g.speed = WALK;
  g.pos.copy(g.path[0]);
  g.state = 'walk';
  g.dest = { pos: g.path[g.path.length - 1], facing, roomId: arriveState === 'idle' ? 'lobby' : null };
  g.arriveState = arriveState;
}

function guests(dt) {
  world.nextGuest -= dt;
  if (world.nextGuest <= 0) {
    world.nextGuest = rand(28, 45);
    const g = world.guests.find((x) => !x.active);
    if (g && !world.night) {
      g.active = true;
      walkPath(g, g.def.path, 'idle', Math.PI);
    }
  }
  for (const g of world.guests) {
    if (!g.active) continue;
    stepAgent(g, dt);
    if (g.state === 'idle' && g.timer === 0) {
      g.timer = rand(7, 10);
      emit('bell');
      log('guest', 'Tamu datang ke Hive Lobby, Bumble menyambut lewat layar resepsionis');
      const concierge = world.byId.concierge;
      if (canTake(concierge) && world.missions.length < MAX_ACTIVE) {
        spawnMission({ lead: 'concierge', title: 'Sambut tamu baru di Hive Lobby' });
      }
    } else if (g.state === 'idle') {
      g.timer -= dt;
      if (g.timer <= 0) walkPath(g, [...g.def.path].reverse(), 'gone', 0);
    } else if (g.state === 'gone') {
      g.active = false;
      g.state = 'hidden';
      g.timer = 0;
    }
  }
  const near = world.guests.some(
    (g) => g.active && Math.hypot(g.pos.x - LOBBY_DOOR[0], g.pos.z - LOBBY_DOOR[2]) < 3 && g.pos.y > -0.6,
  );
  if (near && !world.doorOpen) emit('door');
  world.doorOpen = near;
}

function effects(dt) {
  for (const e of world.effects) e.t += dt;
  world.effects = world.effects.filter((e) => e.t < e.dur);
  for (const k of Object.keys(world.glow)) world.glow[k] = Math.max(0, world.glow[k] - dt * 0.7);
}

function syncUI() {
  useHive.setState({
    missions: world.missions.map((m) => ({
      id: m.id,
      title: m.title,
      dept: m.dept,
      leadId: m.leadId,
      collabId: m.collabId,
      roomId: m.roomId,
      phase: m.phase,
      progress: m.progress,
    })),
    agentStates: Object.fromEntries(
      world.agents.map((a) => [
        a.id,
        { state: a.state, missionId: a.missionId, roomId: a.roomId, destRoom: a.dest ? a.dest.roomId : null },
      ]),
    ),
    stats: { done: world.done, honey: world.honey, clock: world.clock, clockMode: world.clockMode },
  });
}

export function update(rawDt) {
  const { speed, paused } = useHive.getState();
  world.uiTimer -= rawDt;
  if (world.uiTimer <= 0) {
    world.uiTimer = 0.25;
    syncUI();
  }
  if (world.clockMode === 'wib') world.clock = wibHour();
  if (paused) return;
  const dt = Math.min(rawDt, 0.1) * speed;
  world.time += dt;
  if (world.clockMode === 'sim') world.clock = (world.clock + (dt * 24) / DAY_LEN) % 24;
  const night = isNightHour(world.clock);
  if (night !== world.night) {
    world.night = night;
    log('clock', night ? 'Malam tiba. Agent Hybrid tidur, agent Full AI jaga malam.' : 'Pagi! Koloni bangun dan kembali bekerja.');
  }
  for (const a of world.agents) stepAgent(a, dt);
  behaviours(dt);
  missions(dt);
  guests(dt);
  effects(dt);
}

// Lompat waktu: beralih ke jam simulasi (berjalan cepat) mulai dari jam tertentu
export function jumpTo(hour) {
  world.clockMode = 'sim';
  world.clock = hour;
  syncUI();
}

export function focusAgent(id, changeFloor = true) {
  const a = world.byId[id];
  const st = useHive.getState();
  const tier = tierOf(a.pos.y);
  useHive.setState({
    selectedAgent: id,
    selectedRoom: null,
    floor: changeFloor ? tier : st.floor,
  });
  // kamera di depan wajah agent, sedikit dari atas
  const f = a.targetFacing;
  st.focusOn([a.pos.x, a.pos.y + 1, a.pos.z], 13, [Math.sin(f), 1.4, Math.cos(f)]);
}

if (import.meta.env.DEV) window.__hive = { world, jumpTo, update, useHive };
