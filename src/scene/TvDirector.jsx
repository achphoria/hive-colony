// "Sutradara kamera" mode TV: kamera hanya berkeliling koloni (tidak mengikuti karakter), seperti Kyumen.
// Bergantian: orbit seluruh menara, tur per lantai, dan geser pelan menyusuri depan menara
// (tangga lobby, taman, kolam madu). Tenang, ringan, enak diputar seharian di layar besar.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { TIERS, tierY } from '../data/hive';
import { useHive } from '../sim/store';
import { useTv } from '../sim/tv';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const setFloor = (floor) => {
  if (useHive.getState().floor !== floor) useHive.setState({ floor, selectedRoom: null });
};

function orbitShot() {
  setFloor('all');
  const a0 = rand(0, Math.PI * 2);
  const dir = Math.random() < 0.5 ? 1 : -1;
  useTv.setState({ caption: { type: 'orbit', kicker: 'Hive Colony', title: 'Menara sarang', sub: 'Kantor virtual 21 agent AI' } });
  return {
    type: 'orbit',
    dur: rand(16, 20),
    t: 0,
    frame(sh) {
      const a = a0 + sh.t * 0.05 * dir;
      return { pos: V(Math.cos(a) * 60, 30 + Math.sin(sh.t * 0.2) * 4, Math.sin(a) * 60), target: V(0, 7, 0) };
    },
  };
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
    dur: rand(12, 15),
    t: 0,
    frame(sh) {
      const a = a0 + sh.t * 0.05;
      return { pos: V(Math.cos(a) * 32, y + 19, Math.sin(a) * 32), target: V(0, y + 1, 0) };
    },
  };
}

// menyusuri depan menara: tangga lobby di tengah, kolam madu & kotak lebah di kiri, taman di kanan
function sweepShot() {
  setFloor('all');
  const dir = Math.random() < 0.5 ? 1 : -1;
  useTv.setState({ caption: { type: 'orbit', kicker: 'Gerbang lobby', title: 'Hive Colony', sub: 'Tangga lobby, taman & kolam madu' } });
  return {
    type: 'sweep',
    dur: rand(12, 15),
    t: 0,
    frame(sh) {
      const x = -dir * 28 + dir * sh.t * 4;
      return { pos: V(x, 11, 46), target: V(x * 0.55, 3, 6) };
    },
  };
}

// jenis shot bergantian, tidak mengulang jenis yang sama berturut-turut
function nextShot(prevType) {
  const options = [
    { kind: 'orbit', make: orbitShot },
    { kind: 'floor', make: floorShot },
    { kind: 'sweep', make: sweepShot },
  ].filter((o) => o.kind !== prevType);
  return pick(options).make();
}

export function TvDirector() {
  const { camera, controls } = useThree();
  const shot = useRef(null);
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

  useFrame((_, rawDt) => {
    if (!controls) return;
    // tab sempat tidak aktif -> dt bisa sangat besar; batasi supaya shot tidak terlewat
    const dt = Math.min(rawDt, 0.1);
    let s = shot.current;
    if (!s || s.t > s.dur) s = shot.current = nextShot(s?.type);
    s.t += dt;
    const { pos, target } = s.frame(s);
    // awal shot: meluncur pelan; setelah itu bergerak halus
    const k = 1 - Math.exp(-dt * (s.t < 2.5 ? 1.0 : 2.0));
    camera.position.lerp(pos, k);
    controls.target.lerp(target, k);
    controls.update();
  });

  return null;
}
