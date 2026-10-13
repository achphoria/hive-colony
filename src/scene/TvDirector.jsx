// "Sutradara kamera" mode TV: bergantian orbit menara, tur per lantai, close-up agent, dan
// close-up staff di taman. Sebelum memilih sudut close-up, garis pandang kamera -> wajah dicek
// dengan raycast; kalau terhalang (perabot, ruangan lain, pohon), sudut lain dicoba.
// Lantai di atas target disembunyikan supaya tidak menutupi pandangan.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { AGENTS, DEPTS, TIERS, tierOf, tierY } from '../data/hive';
import { useHive } from '../sim/store';
import { world } from '../sim/engine';
import { outdoor } from '../sim/outdoor';
import { useTv } from '../sim/tv';
import { useAi } from '../hall/queenBea';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function weightedPick(items) {
  const total = items.reduce((s, it) => s + it.w, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// mesh yang menghalangi: terlihat, bukan dinding cutaway, dan tidak bening
// (layar hologram & sayap setengah transparan tetap dianggap menutupi wajah; kaca lift tidak)
function isSolid(o) {
  if (!o.isMesh) return false;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (m && m.transparent && m.opacity < 0.3) return false;
  for (let p = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p.userData?.cutaway) return false;
  }
  return true;
}

const setFloor = (floor) => {
  if (useHive.getState().floor !== floor) useHive.setState({ floor, selectedRoom: null });
};

export function TvDirector() {
  const { camera, scene, controls } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const shot = useRef(null);
  const recent = useRef([]);
  const skip = useTv((s) => s.skip);

  // penonton tidak mengendalikan kamera; kembalikan semuanya saat keluar mode TV
  useEffect(() => {
    if (controls) controls.enabled = false;
    return () => {
      if (controls) controls.enabled = true;
      useHive.setState({ floor: 'all' });
      useTv.setState({ caption: null });
    };
  }, [controls]);
  useEffect(() => {
    if (shot.current) shot.current.t = Infinity; // lompat ke shot berikutnya
  }, [skip]);

  const clearRay = (from, to) => {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    ray.set(from, dir.normalize());
    ray.near = 0.1;
    ray.far = Math.max(0.1, dist - 0.9); // abaikan tubuh target sendiri
    return !ray.intersectObjects(scene.children, true).some((h) => isSolid(h.object));
  };
  // seluruh wajah harus terlihat: tengah, kiri, kanan, atas, dan bawah kepala
  const clear = (from, to) => {
    const side = to.clone().sub(from).cross(V(0, 1, 0)).normalize().multiplyScalar(0.32);
    const pts = [to, to.clone().add(side), to.clone().sub(side), to.clone().add(V(0, 0.3, 0)), to.clone().add(V(0, -0.25, 0))];
    return pts.every((p) => clearRay(from, p));
  };

  // atDesk: agent menghadap layar meja, jadi sudut 3/4 dicoba lebih dulu daripada dari depan
  const findAngle = (target, facing, atDesk = false) => {
    const offsets = atDesk ? [0.75, -0.75, 1.2, -1.2, 0.4, -0.4, 1.8, -1.8, 0] : [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, Math.PI];
    for (const elev of atDesk ? [0.55, 0.85] : [0.42, 0.7]) {
      for (const dist of [5.2, 7]) {
        for (const off of offsets) {
          const az = facing + off;
          const dir = V(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
          if (clear(target.clone().addScaledVector(dir, dist), target)) return { dir, dist };
        }
      }
    }
    // cadangan: dari atas (lantai di atas sudah disembunyikan)
    return { dir: V(Math.sin(facing) * 0.3, 0.95, Math.cos(facing) * 0.3).normalize(), dist: 8 };
  };

  const remember = (id) => {
    recent.current = [id, ...recent.current].slice(0, 4);
  };

  function agentShot() {
    const ai = useAi.getState().status === 'on';
    const items = AGENTS.map((def) => {
      const a = world.byId[def.id];
      if (!a || a.state === 'fly' || recent.current.includes(def.id)) return null;
      let w = 1;
      if (a.missionId) w = 3;
      else if (a.state === 'meeting' || a.state === 'visit') w = 2;
      else if (a.state === 'break' || a.state === 'charge') w = 1.5;
      if (def.id === 'ceo') w += ai ? 4 : 2;
      return { def, w };
    }).filter(Boolean);
    if (!items.length) return null;
    const { def } = weightedPick(items);
    remember(def.id);
    const a = world.byId[def.id];
    const lift = def.id === 'ceo' ? 1.45 : 1.15;
    const targetOf = () => a.pos.clone().add(V(0, lift, 0));
    setFloor(tierOf(a.pos.y));
    const s = {
      type: 'agent',
      dur: rand(9, 12),
      t: 0,
      recheck: 0,
      drift: rand(-1, 1),
      angle: null,
      frame(sh, dt) {
        const target = targetOf();
        sh.recheck -= dt;
        // agent bisa berpindah: cek ulang sudut & lantai secara berkala
        if (!sh.angle || sh.recheck <= 0) {
          sh.recheck = 1.5;
          if (a.state !== 'fly') setFloor(tierOf(a.pos.y));
          const pos = sh.angle ? target.clone().addScaledVector(sh.angle.dir, sh.angle.dist) : null;
          if (!sh.angle || !clear(pos, target)) sh.angle = findAngle(target, a.targetFacing ?? 0, a.state === 'desk');
        }
        // geser pelan mengitari wajah
        const dir = sh.angle.dir.clone().applyAxisAngle(V(0, 1, 0), Math.sin(sh.t * 0.25) * 0.18 * sh.drift);
        return { pos: target.clone().addScaledVector(dir, sh.angle.dist), target };
      },
    };
    useTv.setState({ caption: { type: 'agent', id: def.id, kicker: DEPTS[def.dept]?.name || 'Agent AI', title: def.nick, sub: def.role, color: DEPTS[def.dept]?.color } });
    return s;
  }

  function staffShot() {
    const list = outdoor.walkers.filter((w) => !recent.current.includes(w.id));
    if (!list.length) return null;
    // utamakan staff sungguhan yang online
    const real = list.filter((w) => w.id === 'me' || w.id.startsWith('u-'));
    const w = pick(real.length ? real : list);
    remember(w.id);
    setFloor('all');
    const s = {
      type: 'staff',
      dur: rand(8, 11),
      t: 0,
      recheck: 0,
      angle: null,
      frame(sh, dt) {
        const target = w.pos.clone().add(V(0, 1.0, 0));
        sh.recheck -= dt;
        if (!sh.angle || sh.recheck <= 0) {
          sh.recheck = 1.5;
          const pos = sh.angle ? target.clone().addScaledVector(sh.angle.dir, sh.angle.dist) : null;
          if (!sh.angle || !clear(pos, target)) sh.angle = findAngle(target, w.facing ?? 0);
        }
        return { pos: target.clone().addScaledVector(sh.angle.dir, sh.angle.dist), target };
      },
    };
    const p = w.profile || {};
    useTv.setState({ caption: { type: 'staff', id: w.id, kicker: `Staff · ${DEPTS[p.dept]?.short || 'Koloni'}`, title: p.name || 'Staff', sub: '', color: p.outfitColor } });
    return s;
  }

  function floorShot() {
    const tier = pick(TIERS);
    setFloor(tier.id);
    // tiang lift ada di sisi +x: tur dimulai dari sisi seberangnya supaya tidak menghalangi
    const a0 = rand(0.7 * Math.PI, 1.15 * Math.PI);
    const y = tierY(tier.id);
    useTv.setState({ caption: { type: 'floor', kicker: 'Tur lantai', title: tier.name, sub: tier.sub } });
    return {
      type: 'floor',
      dur: rand(10, 13),
      t: 0,
      frame(sh) {
        const a = a0 + sh.t * 0.07;
        return { pos: V(Math.cos(a) * 30, y + 19, Math.sin(a) * 30), target: V(0, y + 1, 0) };
      },
    };
  }

  function orbitShot() {
    setFloor('all');
    const a0 = rand(0, Math.PI * 2);
    useTv.setState({ caption: { type: 'orbit', kicker: 'Hive Colony', title: 'Menara sarang', sub: 'Kantor virtual 21 agent AI' } });
    return {
      type: 'orbit',
      dur: rand(12, 15),
      t: 0,
      frame(sh) {
        const a = a0 + sh.t * 0.06;
        return { pos: V(Math.cos(a) * 60, 30 + Math.sin(sh.t * 0.2) * 4, Math.sin(a) * 60), target: V(0, 7, 0) };
      },
    };
  }

  // jenis shot bergantian; selain close-up agent, jenis yang sama tidak diulang berturut-turut
  function nextShot(prevType) {
    const options = [
      { kind: 'agent', make: agentShot, w: 5 },
      { kind: 'staff', make: staffShot, w: outdoor.walkers.length ? 2.5 : 0 },
      { kind: 'floor', make: floorShot, w: 1.5 },
      { kind: 'orbit', make: orbitShot, w: 1.2 },
    ].filter((o) => o.w > 0 && !(o.kind === prevType && o.kind !== 'agent'));
    for (let i = 0; i < 4; i++) {
      const s = weightedPick(options).make();
      if (s) return s;
    }
    return orbitShot();
  }

  useFrame((_, rawDt) => {
    if (!controls) return;
    // tab sempat tidak aktif -> dt bisa sangat besar; batasi supaya shot tidak terlewat
    const dt = Math.min(rawDt, 0.1);
    let s = shot.current;
    if (!s || s.t > s.dur) {
      s = shot.current = nextShot(s?.type);
    }
    s.t += dt;
    const { pos, target } = s.frame(s, dt);
    // awal shot: meluncur pelan; setelah itu mengikuti target dengan halus
    const k = 1 - Math.exp(-dt * (s.t < 2.2 ? 1.1 : 2.4));
    camera.position.lerp(pos, k);
    controls.target.lerp(target, k);
    controls.update();
  });

  return null;
}
