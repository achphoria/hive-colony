// Mesin simulasi: pergerakan agent, istirahat, rapat, dan alur misi.
// State per-frame disimpan di objek `world` (mutable) supaya React tidak re-render tiap frame;
// ringkasan untuk UI dikirim ke store beberapa kali per detik.
import * as THREE from 'three';
import { AGENTS, SEATS, ROOM_BY_ID, MISSIONS, DEPTS, AGENT_BY_ID, LIFT_X, tierY, tierOf, roomSpots } from '../data/hive';
import { useHive } from './store';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CRUISE = 3.5;
const SPEED = 4.4;
const MAX_ACTIVE = 5;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

export const world = {
  agents: [],
  byId: {},
  missions: [],
  effects: [],
  glow: {},
  occupancy: {},
  time: 0,
  nextMission: 2.5,
  nextMeeting: 28,
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
  if (a.state === 'fly' && a.path) {
    let remain = SPEED * dt;
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

function behaviours(dt) {
  let away = world.agents.filter(isAway).length;
  for (const a of world.agents) {
    if (a.state !== 'desk' || a.missionId) continue;
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
  if (world.nextMeeting <= 0) {
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
      useHive.getState().pushLog({
        id: `meet-${world.seq++}`,
        kind: 'meeting',
        text: `Rapat di Comb Hall: ${team.map((a) => a.def.nick).join(', ')}`,
        time: world.time,
      });
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
  return a && !a.missionId && a.state !== 'meeting' && !(a.state === 'fly' && a.arriveState === 'meeting');
}

function spawnMission() {
  const options = MISSIONS.filter((t) => canTake(world.byId[t.lead]));
  if (!options.length) return;
  const t = pick(options);
  const lead = world.byId[t.lead];
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
  ceo.cheer = 1;
  const room = ROOM_BY_ID[m.roomId];
  world.effects.push({
    type: 'drop',
    from: V(ceo.pos.x, ceo.pos.y + 2.4, ceo.pos.z),
    to: V(room.x, room.y + 3.4, room.z),
    t: 0,
    dur: 2.2,
  });
  world.missions.push(m);
  useHive.getState().pushLog({
    id: `m-${m.id}`,
    kind: 'dispatch',
    dept: m.dept,
    text: `Queen Bea mengirim misi ke ${DEPTS[m.dept].short}: ${m.title}`,
    time: world.time,
  });
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
  useHive.getState().pushLog({
    id: `d-${m.id}`,
    kind: 'done',
    dept: m.dept,
    text: `${AGENT_BY_ID[m.leadId].nick} menyelesaikan "${m.title}" (+${m.reward} madu)`,
    time: world.time,
  });
}

function missions(dt) {
  world.nextMission -= dt;
  const active = world.missions.filter((m) => m.phase !== 'done');
  if (world.nextMission <= 0) {
    world.nextMission = rand(6, 11);
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
    stats: { done: world.done, honey: world.honey },
  });
}

export function update(rawDt) {
  const { speed, paused } = useHive.getState();
  world.uiTimer -= rawDt;
  if (world.uiTimer <= 0) {
    world.uiTimer = 0.25;
    syncUI();
  }
  if (paused) return;
  const dt = Math.min(rawDt, 0.1) * speed;
  world.time += dt;
  for (const a of world.agents) stepAgent(a, dt);
  behaviours(dt);
  missions(dt);
  effects(dt);
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
