// Staff manusia yang berjalan-jalan di taman pulau (outdoor), sesekali berjoget.
import * as THREE from 'three';

const GROUND_Y = -2.2;
const R_MIN = 16.5;
const R_MAX = 22.5;
const WALK = 1.7;

export const outdoor = { walkers: [], byId: {} };

function pointNear(angle) {
  // titik baru tidak jauh dari posisi sekarang supaya jalurnya tidak memotong menara
  const a = angle + (Math.random() - 0.5) * (Math.PI / 2.2);
  const r = R_MIN + Math.random() * (R_MAX - R_MIN);
  let x = r * Math.cos(a);
  const z = r * Math.sin(a);
  if (Math.abs(x) < 3.2 && z > 12) x = x < 0 ? -3.8 : 3.8; // jangan berdiri di tangga lobby
  return new THREE.Vector3(x, GROUND_Y, z);
}

export function upsertWalker(profile) {
  const existing = outdoor.byId[profile.id];
  if (existing) {
    existing.profile = profile;
    return existing;
  }
  const a = Math.random() * Math.PI * 2;
  const w = {
    id: profile.id,
    profile,
    pos: pointNear(a),
    target: null,
    state: 'idle',
    pose: 'idle',
    timer: 1 + Math.random() * 3,
    facing: Math.random() * Math.PI * 2,
    t0: Math.random() * 10,
  };
  outdoor.walkers.push(w);
  outdoor.byId[w.id] = w;
  return w;
}

export function danceNow(id, pose) {
  const w = outdoor.byId[id];
  if (!w) return;
  w.state = 'dance';
  w.pose = pose;
  w.timer = 7;
  w.target = null;
}

export function updateOutdoor(dt) {
  for (const w of outdoor.walkers) {
    w.timer -= dt;
    if (w.state === 'walk' && w.target) {
      const d = w.target.clone().sub(w.pos);
      const len = d.length();
      if (len < 0.15) {
        w.state = 'idle';
        w.pose = 'idle';
        w.timer = 2 + Math.random() * 4;
      } else {
        w.pos.addScaledVector(d.normalize(), Math.min(len, WALK * dt));
        w.facing = Math.atan2(d.x, d.z);
      }
      continue;
    }
    if (w.timer > 0) continue;
    if (w.state === 'idle' && Math.random() < 0.35) {
      w.state = 'dance';
      w.pose = w.profile.pose === 'idle' ? 'pargoy' : w.profile.pose;
      w.timer = 5 + Math.random() * 3;
    } else {
      w.state = 'walk';
      w.pose = 'walk';
      w.target = pointNear(Math.atan2(w.pos.z, w.pos.x));
    }
  }
}

export function removeWalker(id) {
  const i = outdoor.walkers.findIndex((w) => w.id === id);
  if (i >= 0) outdoor.walkers.splice(i, 1);
  delete outdoor.byId[id];
}
