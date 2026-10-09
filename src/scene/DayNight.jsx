// Siklus siang-malam: warna langit, matahari/bulan, lampu ruangan, bintang, kunang-kunang,
// dan jembatan ke modul audio (event + dengung lebah).
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { ROOM_LIST, sunElevation, tierOf } from '../data/hive';
import { world } from '../sim/engine';
import { useHive } from '../sim/store';
import { sound } from '../audio/sound';
import { M } from './materials';

const C = (hex) => new THREE.Color(hex);
const SKY = { day: C('#FFF1D0'), dusk: C('#FFB27A'), night: C('#1B2040') };
const SUN = { day: C('#FFE6B0'), dusk: C('#FF9A4A'), night: C('#9FB4FF') };
const HEMI_SKY = { day: C('#FFF8E7'), night: C('#5D6AAE') };
const HEMI_GROUND = { day: C('#C98A00'), night: C('#2A2440') };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function DayNight() {
  const { scene } = useThree();
  const sun = useRef();
  const hemi = useRef();
  const amb = useRef();
  const moon = useRef();
  const starMat = useRef();
  const dust = useRef();
  const flies = useRef();
  const lights = useRef([]);
  const lampLight = useRef();
  const tmp = useMemo(() => new THREE.Color(), []);

  const starGeo = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 500; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.45 * Math.PI;
      const r = 170;
      pts.push(r * Math.cos(u) * Math.cos(v), 15 + r * Math.sin(v), r * Math.sin(u) * Math.cos(v));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  useEffect(() => {
    scene.background = SKY.day.clone();
  }, [scene]);

  useFrame(() => {
    const h = world.clock;
    const e = sunElevation(h);
    const n = clamp((0.05 - e) / 0.4, 0, 1);
    const d = 1 - n;
    const dusk = clamp(1 - Math.abs(e) / 0.3, 0, 1);
    world.nightFactor = n;

    // siang -> jingga senja -> biru malam (tanpa lewat abu-abu)
    if (e > 0) tmp.copy(SKY.day).lerp(SKY.dusk, 1 - clamp(e / 0.35, 0, 1));
    else tmp.copy(SKY.dusk).lerp(SKY.night, clamp(-e / 0.3, 0, 1));
    scene.background.copy(tmp);
    if (scene.fog) scene.fog.color.copy(tmp);

    // matahari siang, bulan malam (cahaya utama tetap dari atas supaya bayangan rapi)
    const phi = ((h - 6) / 12) * Math.PI + (n > 0.5 ? Math.PI : 0);
    sun.current.position.set(42 * Math.cos(phi), 28 + 22 * Math.max(0.3, Math.abs(Math.sin(phi))), 22);
    sun.current.intensity = 0.35 + 1.4 * d;
    if (e > 0) sun.current.color.copy(SUN.day).lerp(SUN.dusk, dusk * 0.8);
    else sun.current.color.copy(SUN.dusk).lerp(SUN.night, clamp(-e / 0.3, 0, 1));
    hemi.current.intensity = 0.35 + 0.6 * d;
    hemi.current.color.copy(HEMI_SKY.day).lerp(HEMI_SKY.night, n);
    hemi.current.groundColor.copy(HEMI_GROUND.day).lerp(HEMI_GROUND.night, n);
    amb.current.intensity = 0.18 + 0.12 * n;

    // material yang menyala lebih terang saat malam
    M.led.emissiveIntensity = 1.4 + 2.2 * n;
    M.ledGreen.emissiveIntensity = 1.2 + 1.6 * n;
    M.screen.emissiveIntensity = 0.6 + 1.0 * n;
    M.honey.emissiveIntensity = 0.45 + 0.8 * n;
    M.window.emissiveIntensity = 0.1 + 1.8 * n;
    M.holo.emissiveIntensity = 0.7 + 0.9 * n;

    const floor = useHive.getState().floor;
    lights.current.forEach((l, i) => {
      if (!l) return;
      const r = ROOM_LIST[i];
      const shown = floor === 'all' || r.tier <= floor;
      l.intensity = shown ? n * 14 + (world.glow[r.id] || 0) * 10 : 0;
    });
    if (lampLight.current) lampLight.current.intensity = n * 30;

    starMat.current.opacity = n;
    moon.current.visible = n > 0.05;
    moon.current.position.set(-60 * Math.cos(phi), 55 + 20 * Math.abs(Math.sin(phi)), -90);
    dust.current.visible = n < 0.5;
    flies.current.visible = n >= 0.5;

    // audio: event simulasi + dengung lebah
    sound.setNight(n);
    while (world.events.length) sound.play(world.events.shift());
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#FFF8E7', '#C98A00', 0.9]} />
      <ambientLight ref={amb} intensity={0.2} />
      <directionalLight
        ref={sun}
        position={[28, 48, 22]}
        intensity={1.7}
        color="#FFE6B0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0006}
      />
      {/* lampu tiap ruangan, selalu terpasang supaya shader tidak dikompilasi ulang */}
      {ROOM_LIST.map((r, i) => (
        <pointLight
          key={r.id}
          ref={(el) => (lights.current[i] = el)}
          position={[r.x, r.y + 1.7, r.z]}
          color="#FFC266"
          intensity={0}
          distance={9}
          decay={2}
        />
      ))}
      <pointLight ref={lampLight} position={[0, 0.5, 18]} color="#FFC266" intensity={0} distance={14} decay={2} />
      <points geometry={starGeo}>
        <pointsMaterial ref={starMat} color="#FFF8E7" size={1.4} sizeAttenuation transparent opacity={0} depthWrite={false} fog={false} />
      </points>
      <mesh ref={moon} visible={false}>
        <sphereGeometry args={[5, 20, 14]} />
        <meshBasicMaterial color="#FFF3C4" fog={false} />
      </mesh>
      <group ref={dust}>
        <Sparkles count={70} scale={[54, 28, 54]} position={[0, 9, 0]} size={5} color="#FFC93C" speed={0.35} opacity={0.8} />
      </group>
      <group ref={flies} visible={false}>
        <Sparkles count={90} scale={[60, 16, 60]} position={[0, 2, 0]} size={7} color="#E8FF8A" speed={0.5} />
      </group>
    </>
  );
}

// Dengung lebah: makin keras kalau banyak agent terbang dekat kamera.
export function BuzzBridge() {
  const { camera } = useThree();
  useFrame(() => {
    if (!sound.enabled) return;
    const floor = useHive.getState().floor;
    let count = 0;
    let nearest = Infinity;
    for (const a of world.agents) {
      if (a.state !== 'fly') continue;
      if (floor !== 'all' && tierOf(a.pos.y) > floor) continue;
      count++;
      nearest = Math.min(nearest, camera.position.distanceTo(a.pos));
    }
    const proximity = clamp(1 - (nearest - 8) / 60, 0, 1);
    sound.setBuzz(Math.min(1, count / 3) * proximity * 0.05);
  });
  return null;
}
