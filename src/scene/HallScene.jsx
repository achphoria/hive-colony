// Hive Hall 3D: ruang rapat diorama dengan layar dinding live (panel DOM ditempel di dinding 3D
// supaya teksnya tajam), meja heksagon, Hive Worker AI, dan avatar staff manusia.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { M, std, Box, Cyl, Hex, Sph, Cone } from './materials';
import { marbleTexture, hexLineTexture, honeyGlassTexture } from './textures';
import { WarmEnvironment, LookFX } from './Look';
import { BeeFigure, SpeakRing, SoundBars } from './BeeFigure';
import { StaffAvatar } from './StaffAvatar';
import { DAY, cut } from '../ui/hallData';

const SEAT_R = 2.9;
const DEFAULT_VIEW = { target: [0, 2.4, -2.4], pos: [0, 5.0, 9.9] };
// HP (layar tegak): fokus ke meja dan Queen Bea; isi layar dinding dibaca lewat kartu geser
const DEFAULT_VIEW_MOBILE = { target: [0, 0.55, -0.9], pos: [0, 4.3, 8.6] };

function seat(deg) {
  const a = (deg * Math.PI) / 180;
  const x = SEAT_R * Math.sin(a);
  const z = -SEAT_R * Math.cos(a);
  return { pos: [x, 0, z], facing: Math.atan2(-x, -z) };
}

/* ---------- ruangan ---------- */

// material khusus Hive Hall: lantai marmer bergaris sarang menyala, kaca madu, panel amber
function useHallMaterials() {
  return useMemo(() => {
    const marble = marbleTexture().clone();
    marble.needsUpdate = true;
    marble.repeat.set(5, 3);
    const lines = hexLineTexture(1).clone();
    lines.needsUpdate = true;
    lines.repeat.set(7, 4);
    const comb = honeyGlassTexture().clone();
    comb.needsUpdate = true;
    return {
      floor: new THREE.MeshStandardMaterial({
        color: '#E9DAC0',
        map: marble,
        emissiveMap: lines,
        emissive: '#FFA820',
        emissiveIntensity: 1.6,
        roughness: 0.22,
        metalness: 0.08,
      }),
      cell: new THREE.MeshStandardMaterial({
        color: '#E9A23A',
        map: comb,
        emissiveMap: comb,
        emissive: '#FF8A10',
        emissiveIntensity: 0.42,
        roughness: 0.18,
        metalness: 0.15,
      }),
      wallBack: std('#5E3604', { roughness: 0.5, metalness: 0.35 }),
      panel: new THREE.MeshStandardMaterial({
        color: '#FFD98A',
        emissive: '#FFB020',
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.38,
        roughness: 0.1,
        metalness: 0.2,
      }),
      plaque: std('#4A2A08', { roughness: 0.35, metalness: 0.4 }),
    };
  }, []);
}

// Dinding sarang lebah: ratusan sel heksagon kaca madu dalam satu InstancedMesh
function CombWall({ width, height, position, rotation = [0, 0, 0], mat }) {
  const ref = useRef();
  const cells = useMemo(() => {
    const out = [];
    const rad = 0.6;
    const w = rad * 1.5;
    const h = rad * Math.sqrt(3);
    for (let c = 0; c * w <= width + w; c++) {
      for (let r = 0; r * h <= height + h; r++) {
        const x = -width / 2 + c * w;
        const y = r * h + (c % 2 ? h / 2 : 0);
        if (y > height + 0.2) continue;
        out.push([x, y, 0.06 + ((c * 7 + r * 3) % 5) * 0.035]);
      }
    }
    return out;
  }, [width, height]);
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.54, 0.54, 0.3, 6, 1, false, Math.PI / 2);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    cells.forEach(([x, y, z], i) => {
      m.makeTranslation(x, y, z);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [cells]);
  return (
    <group position={position} rotation={rotation}>
      <Box p={[0, height / 2, -0.12]} s={[width, height, 0.2]} m={mat.wallBack} />
      <instancedMesh ref={ref} args={[geo, mat.cell, cells.length]} />
    </group>
  );
}

// tetesan madu di bibir atas dinding
function HoneyDrips({ xs, y, z }) {
  return (
    <group>
      <Box p={[0, y + 0.05, z]} s={[20.6, 0.22, 0.5]} m={M.honey} shadow={false} />
      {xs.map(([x, len], i) => (
        <group key={i} position={[x, y, z + 0.18]}>
          <mesh position={[0, -len / 2, 0]} material={M.honey}>
            <capsuleGeometry args={[0.09, len, 4, 10]} />
          </mesh>
          <Sph p={[0, -len - 0.08, 0]} rad={0.13} m={M.honey} seg={[12, 10]} shadow={false} />
        </group>
      ))}
    </group>
  );
}

// lentera heksagon emas yang menyala
function Lantern({ p }) {
  return (
    <group position={p}>
      <Cyl p={[0, 0.75, 0]} a={[0.02, 0.02, 1.5, 4]} m={M.gold} shadow={false} />
      <Cyl p={[0, 0.02, 0]} a={[0.42, 0.34, 0.12, 6]} m={M.gold} />
      <mesh position={[0, -0.36, 0]} material={M.lantern}>
        <cylinderGeometry args={[0.32, 0.28, 0.62, 6]} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i * Math.PI) / 3;
        return <Cyl key={i} p={[0.33 * Math.cos(a), -0.36, 0.33 * Math.sin(a)]} a={[0.025, 0.025, 0.66, 4]} m={M.gold} shadow={false} />;
      })}
      <Cyl p={[0, -0.72, 0]} a={[0.3, 0.38, 0.1, 6]} m={M.gold} />
      <Cone p={[0, -0.88, 0]} a={[0.12, 0.2, 6]} m={M.gold} />
      <pointLight position={[0, -0.4, 0.3]} color="#FFB54A" intensity={10} distance={9} decay={2} />
    </group>
  );
}

// pot emas berisi tanaman & bunga putih
function GoldPlant({ p, s = 1 }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 0.45, 0]} a={[0.5, 0.36, 0.9, 16]} m={M.pot} />
      <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.gold}>
        <torusGeometry args={[0.5, 0.05, 8, 20]} />
      </mesh>
      <Sph p={[0, 1.35, 0]} rad={0.62} sc={[1.1, 0.95, 1]} m={M.leafDark} seg={[14, 10]} />
      <Sph p={[0.32, 1.65, 0.2]} rad={0.4} m={M.leaf} seg={[12, 10]} />
      <Sph p={[-0.35, 1.55, -0.1]} rad={0.38} m={M.leaf} seg={[12, 10]} />
      {[
        [0.15, 1.95, 0.32],
        [-0.3, 1.82, 0.35],
        [0.45, 1.7, -0.15],
      ].map((q, i) => (
        <group key={i} position={q}>
          <Sph rad={0.11} sc={[1, 0.5, 1]} m={M.white} seg={[10, 6]} shadow={false} />
          <Sph p={[0, 0.04, 0]} rad={0.045} m={M.nectar} seg={[6, 4]} shadow={false} />
        </group>
      ))}
    </group>
  );
}

function Room() {
  const mat = useHallMaterials();
  const drips = useMemo(
    () => [-9.2, -7.6, -5.9, -3.1, -1.4, 2.2, 3.9, 6.4, 8.1, 9.5].map((x, i) => [x, 0.25 + ((i * 37) % 10) / 14]),
    [],
  );
  return (
    <group>
      {/* lantai marmer dengan garis sarang yang menyala */}
      <mesh position={[0, -0.15, -1]} material={mat.floor} receiveShadow>
        <boxGeometry args={[20.4, 0.3, 11]} />
      </mesh>
      <Box p={[0, -0.32, -1]} s={[20.8, 0.1, 11.4]} m={M.royal} />
      {/* dinding sarang madu: belakang & samping */}
      <CombWall width={20.4} height={7} position={[0, 0, -6.3]} mat={mat} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <CombWall width={10.6} height={7} position={[sx * 10.3, 0, -1.2]} rotation={[0, (-sx * Math.PI) / 2, 0]} mat={mat} />
          <Box p={[sx * 10.15, 7.05, -1.2]} r={[0, Math.PI / 2, 0]} s={[10.6, 0.25, 0.6]} m={M.gold} />
          <GoldPlant p={[sx * 8.7, 0, 2.4]} />
        </group>
      ))}
      <Box p={[0, 7.05, -6.15]} s={[20.6, 0.25, 0.6]} m={M.gold} />
      <Box p={[0, 0.2, -5.95]} s={[20.4, 0.4, 0.2]} m={M.gold} />
      <HoneyDrips xs={drips} y={6.9} z={-5.95} />
      {/* panel kaca amber di belakang layar, berbingkai emas */}
      <group position={[0, 3.42, -6.0]}>
        <mesh material={mat.panel}>
          <boxGeometry args={[19.2, 4.9, 0.08]} />
        </mesh>
        {[
          [0, 2.5, 19.4, 0.14],
          [0, -2.5, 19.4, 0.14],
          [-9.65, 0, 0.14, 5.1],
          [9.65, 0, 0.14, 5.1],
        ].map(([x, y, w, h], i) => (
          <Box key={i} p={[x, y, 0.05]} s={[w, h, 0.14]} m={M.gold} shadow={false} />
        ))}
      </group>
      {/* lentera gantung */}
      {[-6.5, 6.5].map((x) => (
        <Lantern key={x} p={[x, 6.4, -2.4]} />
      ))}
      {/* papan nama emas */}
      <group position={[0, 6.55, -5.85]}>
        <Box s={[4.4, 0.8, 0.14]} m={M.gold} />
        <Box p={[0, 0, 0.06]} s={[4.15, 0.6, 0.06]} m={mat.plaque} shadow={false} />
        <Html transform distanceFactor={5} position={[0, 0, 0.1]} pointerEvents="none">
          <div className="wall-sign">HIVE HALL</div>
        </Html>
      </group>
    </group>
  );
}

// Meja jadi podium madu bercahaya bertingkat
function Table() {
  const holo = useRef();
  useFrame((st) => {
    if (holo.current) {
      holo.current.rotation.y = st.clock.elapsedTime * 0.4;
      holo.current.position.y = 1.35 + Math.sin(st.clock.elapsedTime * 1.4) * 0.05;
    }
  });
  return (
    <group>
      <Hex p={[0, 0.1, 0]} rad={2.35} h={0.2} m={M.gold} />
      <Hex p={[0, 0.38, 0]} rad={0.7} h={0.6} m={M.royal} />
      <Hex p={[0, 0.72, 0]} rad={2.05} h={0.08} m={M.gold} />
      <Hex p={[0, 0.82, 0]} rad={1.95} h={0.14} m={M.honey} />
      <Hex p={[0, 0.9, 0]} rad={1.3} h={0.04} m={M.led} shadow={false} />
      <Hex p={[0, 0.92, 0]} rad={0.75} h={0.04} m={M.honey} shadow={false} />
      <group ref={holo} position={[0, 1.35, 0]}>
        <mesh material={M.holo}>
          <cylinderGeometry args={[0.45, 0.45, 0.6, 6, 1, true, Math.PI / 2]} />
        </mesh>
        {[
          [0.18, 0.08],
          [-0.15, 0.14],
          [0, -0.12],
        ].map(([x, z], i) => (
          <Hex key={i} p={[x, -0.1 + i * 0.12, z]} rad={0.12} h={0.04} m={M.led} shadow={false} />
        ))}
      </group>
    </group>
  );
}


// ikon garis kecil untuk header layar dinding (gaya referensi)
const ICON_PATHS = {
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  check: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  bot: 'M12 8V4M8 4h8M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM9 13h.01M15 13h.01',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
};
export function WsIcon({ name }) {
  return (
    <svg className="ws-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/* ---------- layar dinding ---------- */

function Screen({ position, rotation = [0, 0, 0], frame = [4.45, 3.55], onFocus, children, className = 'main' }) {
  return (
    <group position={position} rotation={rotation}>
      <Box p={[0, 0, -0.08]} s={[frame[0], frame[1], 0.12]} m={M.royal} />
      <Html transform distanceFactor={5} position={[0, 0, 0.01]} zIndexRange={[5, 0]}>
        <div
          className={`wscreen ${className}`}
          onClick={onFocus}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onFocus?.()}
        >
          {children}
        </div>
      </Html>
    </group>
  );
}

function FeedScreen({ data, onFocus }) {
  return (
    <Screen position={[-4.5, 3.65, -5.95]} onFocus={onFocus}>
      <div className="ws-head gold">
        <WsIcon name="list" /> Aktivitas live <i className="live" />
      </div>
      <div className="ws-body">
        {data.feed.length === 0 && <div className="ws-empty">Menunggu aktivitas pertama…</div>}
        {data.feed.map((f) => (
          <div key={f.id} className="ws-row feed">
            <span className="t">{f.t}</span>
            <span className="x">{cut(f.text, 30)}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

function CalendarScreen({ data, onFocus }) {
  return (
    <Screen position={[0, 3.65, -5.95]} onFocus={onFocus}>
      <div className="ws-head gold">
        <WsIcon name="calendar" /> Kalender minggu ini
      </div>
      <div className="ws-body">
        <div className="ws-week">
          {data.week.map((d, i) => (
            <div key={i} className={i === data.dow ? 'today' : ''}>
              <small>{DAY[d.getUTCDay()]}</small>
              <b>{d.getUTCDate()}</b>
            </div>
          ))}
        </div>
        {data.events.length === 0 && <div className="ws-empty">Belum ada agenda minggu ini</div>}
        {data.events.slice(0, 4).map((e) => {
          const d = new Date(e.ts);
          return (
            <div key={e.title} className={`ws-row ev${e.big ? ' big' : ''}`} style={{ '--c': e.color }}>
              {DAY[d.getUTCDay()]} {d.getUTCDate()} · {e.title}
            </div>
          );
        })}
      </div>
    </Screen>
  );
}

function OpenScreen({ data, onFocus }) {
  return (
    <Screen position={[4.5, 3.65, -5.95]} onFocus={onFocus}>
      <div className="ws-head amber">
        <WsIcon name="check" /> Belum selesai · {data.open.length}
      </div>
      <div className="ws-body">
        {data.open.length === 0 && <div className="ws-empty ok">Semua beres</div>}
        {data.open.slice(0, 4).map((o, i) => (
          <div key={i} className="ws-row task" style={{ '--c': o.color }}>
            <b>{cut(o.title, 27)}</b>
            <small>{o.sub}</small>
          </div>
        ))}
      </div>
    </Screen>
  );
}

function Ticker({ data }) {
  return (
    <group position={[0, 1.6, -5.95]}>
      <Box p={[0, 0, -0.06]} s={[18, 0.5, 0.08]} m={M.nectar} />
      <Html transform distanceFactor={5} position={[0, 0, 0.01]} zIndexRange={[5, 0]} pointerEvents="none">
        <div className="wticker">
          <div className="wticker-track">
            {[0, 1].map((k) => (
              <span key={k}>
                {data.ticker.map((t) => (
                  <em key={t}>{t}</em>
                ))}
              </span>
            ))}
          </div>
        </div>
      </Html>
    </group>
  );
}

// Di HP isi layar dinding tampil sebagai kartu geser; dinding cukup diberi bingkai dekoratif
function MobileWallArt() {
  return (
    <group position={[0, 3.6, -5.95]}>
      {[-4.5, 0, 4.5].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Box p={[0, 0, -0.06]} s={[4.45, 3.55, 0.12]} m={M.royal} />
          <Box p={[0, 0, 0.01]} s={[4.25, 3.35, 0.02]} m={M.cream} shadow={false} />
          <Box p={[0, 1.45, 0.03]} s={[4.25, 0.45, 0.02]} m={x === 4.5 ? M.amber : M.gold} shadow={false} />
        </group>
      ))}
    </group>
  );
}

/* ---------- kamera ---------- */

function HallCamera({ view, mobile }) {
  const { camera, controls } = useThree();
  const anim = useRef(null);
  useEffect(() => {
    // layar tegak (HP) butuh kamera lebih mundur
    const fit = mobile ? 1 : Math.max(1, 0.85 / camera.aspect);
    const t = new THREE.Vector3(...view.target);
    const p = new THREE.Vector3(...view.pos).sub(t).multiplyScalar(fit).add(t);
    anim.current = { t, p, time: 0 };
  }, [view, camera, mobile]);
  useEffect(() => {
    if (!controls) return;
    const stop = () => (anim.current = null);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);
  useFrame((_, dt) => {
    if (!controls || !anim.current) return;
    const k = 1 - Math.exp(-dt * 3.5);
    controls.target.lerp(anim.current.t, k);
    camera.position.lerp(anim.current.p, k);
    anim.current.time += dt;
    if (anim.current.time > 2.5) anim.current = null;
    controls.update();
  });
  return null;
}

/* ---------- peserta ---------- */

function HumanSeat({ who, profile, deg, speaking, muted }) {
  const s = seat(deg);
  const walker = useMemo(
    () => ({
      id: `hall-${who}`,
      profile,
      pos: new THREE.Vector3(...s.pos),
      facing: s.facing,
      pose: 'idle',
      state: 'idle',
      t0: Math.random() * 10,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [who, JSON.stringify(profile)],
  );
  return (
    <group>
      <group position={s.pos}>
        <SpeakRing active={speaking} />
        <SoundBars active={speaking} position={[0.62, 1.55, 0]} />
        {muted && (
          <Html position={[0.45, 1.85, 0]} center pointerEvents="none">
            <div className="mute-badge">🔇</div>
          </Html>
        )}
      </group>
      <StaffAvatar walker={walker} />
    </group>
  );
}

function NameTag({ deg, label, kind, y = 2.45 }) {
  const s = seat(deg);
  return (
    <Html position={[s.pos[0], y, s.pos[2]]} center pointerEvents="none" zIndexRange={[8, 6]}>
      <div className={`seat-tag ${kind}`}>{label}</div>
    </Html>
  );
}

function Stool({ deg }) {
  const a = (deg * Math.PI) / 180;
  const r = SEAT_R + 0.55;
  return <Hex p={[r * Math.sin(a), 0.25, -r * Math.cos(a)]} rad={0.32} h={0.5} m={M.amber} />;
}

/* ---------- scene ---------- */

export function HallScene({ data, me, dina, mates = [], call, view, setView, mobile = false }) {
  const focus = (target, distance) => setView({ target, pos: [target[0], target[1] + 0.3, target[2] + distance], zoomed: true });
  const ceoSpeaking = call.speaker === 'ceo';
  const ceoThinking = call.speaker === 'thinking';
  const seats = [
    { deg: -80, kind: 'human' },
    { deg: -53, kind: 'human' },
    { deg: -26, kind: 'ai' },
    { deg: 0, kind: 'ai' },
    { deg: 26, kind: 'ai' },
    { deg: 53, kind: 'ai' },
    { deg: 80, kind: 'ai' },
  ];
  const bee = (deg) => seat(deg);

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: (mobile ? DEFAULT_VIEW_MOBILE : DEFAULT_VIEW).pos, fov: mobile ? 52 : 38, near: 0.1, far: 200 }}
    >
      <color attach="background" args={['#3A2206']} />
      <WarmEnvironment intensity={0.55} />
      <LookFX quality={mobile ? 'low' : 'high'} bloom={0.55} threshold={0.86} ao={false} />
      <hemisphereLight args={['#FFF1D6', '#B0680A', 0.35]} />
      <directionalLight
        position={[6, 12, 8]}
        intensity={1.6}
        color="#FFE6B0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0005}
      />
      <Room />
      <Table />
      {seats.map((s) => (
        <Stool key={s.deg} deg={s.deg} />
      ))}

      {!mobile && (
        <>
      <FeedScreen data={data} onFocus={() => focus([-4.5, 3.65, -5.9], 7.2)} />
      <CalendarScreen data={data} onFocus={() => focus([0, 3.65, -5.9], 7.2)} />
      <OpenScreen data={data} onFocus={() => focus([4.5, 3.65, -5.9], 7.2)} />
      <Ticker data={data} />

      <Screen position={[-7.9, 3.65, -5.95]} frame={[2.35, 3.55]} className="side" onFocus={() => focus([-7.9, 3.65, -5.9], 6.2)}>
        <div className="ws-head blue">
          <WsIcon name="users" /> Online · {data.online.length}
        </div>
        <div className="ws-body">
          {data.online.slice(0, 5).map((o) => (
            <div key={o.name} className="ws-row person">
              <i style={{ background: o.color }} />
              <span>{cut(o.name.replace(' (Anda)', ''), 10)}</span>
              <small className={o.here ? 'here' : ''}>{o.where === 'joget di taman' ? 'joget' : o.where}</small>
            </div>
          ))}
        </div>
      </Screen>
      {data.real ? (
      <Screen position={[7.9, 3.65, -5.95]} frame={[2.35, 3.55]} className="side" onFocus={() => focus([7.9, 3.65, -5.9], 6.2)}>
        <div className="ws-head green">
          <WsIcon name="bot" /> Agent AI · {data.aiOn}/21
        </div>
        <div className="ws-body">
          {data.aiAgents.map((a) => (
            <div key={a.id} className="ws-row person">
              <i style={{ background: a.on ? '#8DBF5A' : '#C0C5CE' }} />
              <span>{a.nick}</span>
              <small className={a.on ? 'here' : ''}>{a.status}</small>
            </div>
          ))}
          <div className="ws-trend">{data.aiNote}</div>
        </div>
      </Screen>
      ) : (
      <Screen position={[7.9, 3.65, -5.95]} frame={[2.35, 3.55]} className="side" onFocus={() => focus([7.9, 3.65, -5.9], 6.2)}>
        <div className="ws-head green">
          <WsIcon name="chart" /> Skor skill
        </div>
        <div className="ws-body">
          {data.skills.slice(0, 5).map((k) => (
            <div key={k.id} className="ws-row skill">
              <span>{k.nick}</span>
              <div className="sbar">
                <i style={{ width: `${k.score}%`, background: k.score >= 85 ? '#F5B700' : '#FF8C1A' }} />
              </div>
              <b>{k.score}</b>
            </div>
          ))}
          <div className="ws-trend">{data.mover && data.mover.done > 0 ? `▲ ${data.mover.nick} +${data.mover.done}` : 'Naik tiap misi beres'}</div>
        </div>
      </Screen>
      )}

        </>
      )}
      {mobile && <MobileWallArt />}

      {/* mode real: hanya Queen Bea (agent yang tersambung AI) + staff yang sedang di Hive Hall */}
      {data.real && (
        <>
          <HumanSeat who="me" profile={me} deg={-26} speaking={call.speaker === 'me'} muted={!call.mic} />
          <NameTag deg={-26} label={me.name || 'Anda'} kind="human me" />
          {mates.slice(0, 4).map((p, i) => {
            const deg = [26, -53, 53, -80][i];
            return (
              <group key={p.id}>
                <HumanSeat who={p.id} profile={p} deg={deg} />
                <NameTag deg={deg} label={p.name || 'Staff'} kind="human" />
              </group>
            );
          })}
          <BeeFigure position={bee(0).pos} facing={bee(0).facing} crown speaking={ceoSpeaking} thinking={ceoThinking} />
          <NameTag deg={0} label="Queen Bea" kind="ai ceo" y={2.95} />
        </>
      )}

      {/* mode demo: manusia di kiri, AI melingkar ke kanan, Queen Bea di tengah */}
      {!data.real && (
        <>
      {dina && <HumanSeat who={dina.name} profile={dina} deg={-80} />}
      <HumanSeat who="me" profile={me} deg={-53} speaking={call.speaker === 'me'} muted={!call.mic} />
      <BeeFigure position={bee(-26).pos} facing={bee(-26).facing} muted />
      <BeeFigure position={bee(0).pos} facing={bee(0).facing} crown speaking={ceoSpeaking} thinking={ceoThinking} />
      <BeeFigure position={bee(26).pos} facing={bee(26).facing} />
      <BeeFigure position={bee(53).pos} facing={bee(53).facing} />
      <BeeFigure position={bee(80).pos} facing={bee(80).facing} />
      {dina && <NameTag deg={-80} label={`${dina.name} · ✋`} kind="human" />}
      <NameTag deg={-53} label={me.name || 'Anda'} kind="human me" />
      <NameTag deg={-26} label="Sprint · Ops" kind="ai" />
      <NameTag deg={0} label="Queen Bea" kind="ai ceo" y={2.95} />
      <NameTag deg={26} label="Spark · Mkt" kind="ai" />
      <NameTag deg={53} label="Graph · Fin" kind="ai" />
      <NameTag deg={80} label="Bumble · CX" kind="ai" />
        </>
      )}

      <OrbitControls
        makeDefault
        target={(mobile ? DEFAULT_VIEW_MOBILE : DEFAULT_VIEW).target}
        enableDamping
        dampingFactor={0.08}
        minDistance={3.5}
        maxDistance={20}
        minPolarAngle={0.55}
        maxPolarAngle={1.32}
        minAzimuthAngle={-0.75}
        maxAzimuthAngle={0.75}
      />
      <HallCamera view={view} mobile={mobile} />
    </Canvas>
  );
}

export { DEFAULT_VIEW, DEFAULT_VIEW_MOBILE };
