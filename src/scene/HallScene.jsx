// Hive Hall 3D: ruang rapat diorama dengan layar dinding live (panel DOM ditempel di dinding 3D
// supaya teksnya tajam), meja heksagon, Hive Worker AI, dan avatar staff manusia.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { M, Box, Cyl, Hex, Sph } from './materials';
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

function Room() {
  return (
    <group>
      {/* lantai */}
      <Box p={[0, -0.15, -1]} s={[20.4, 0.3, 11]} m={M.creamDark} />
      <Box p={[0, -0.32, -1]} s={[20.8, 0.1, 11.4]} m={M.royal} />
      <Hex p={[0, 0.015, 0]} rad={4.2} h={0.03} m={M.nectar} shadow={false} />
      <Hex p={[0, 0.03, 0]} rad={3.7} h={0.03} m={M.cream} shadow={false} />
      {/* dinding */}
      <Box p={[0, 3.5, -6.2]} s={[20.4, 7, 0.4]} m={M.cream} />
      <Box p={[0, 7.05, -6.15]} s={[20.6, 0.2, 0.55]} m={M.gold} />
      <Box p={[0, 0.25, -5.95]} s={[20.4, 0.5, 0.15]} m={M.gold} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Box p={[sx * 10.2, 3.5, -1.2]} r={[0, Math.PI / 2, 0]} s={[10.4, 7, 0.4]} m={M.creamDark} />
          <Box p={[sx * 10.15, 7.05, -1.2]} r={[0, Math.PI / 2, 0]} s={[10.6, 0.2, 0.55]} m={M.gold} />
          {/* jendela sarang */}
          {[
            [0, 4.2, -2.6],
            [0, 4.2, -1.3],
            [0, 3.1, -1.95],
            [0, 5.3, -1.95],
          ].map(([, y, z], i) => (
            <group key={i} position={[sx * 9.98, y, z]} rotation={[0, 0, Math.PI / 2]}>
              <Hex rad={0.62} h={0.06} m={M.gold} shadow={false} />
              <Hex p={[-sx * 0.02, 0, 0]} rad={0.5} h={0.08} m={M.sky} shadow={false} />
            </group>
          ))}
          {/* tanaman */}
          <group position={[sx * 9, 0, 2.6]}>
            <Cyl p={[0, 0.35, 0]} a={[0.38, 0.3, 0.7, 6]} m={M.amber} />
            <Sph p={[0, 1.15, 0]} rad={0.6} m={M.leaf} seg={[7, 5]} />
            <Sph p={[0.25, 1.6, 0.1]} rad={0.38} m={M.leafDark} seg={[6, 4]} />
          </group>
        </group>
      ))}
      {/* lampu gantung */}
      {[-4.5, 4.5].map((x) => (
        <group key={x} position={[x, 6.1, -1.5]}>
          <Cyl p={[0, 0.5, 0]} a={[0.015, 0.015, 1, 4]} m={M.graphite} shadow={false} />
          <Hex rad={0.45} h={0.35} m={M.gold} />
          <Hex p={[0, -0.2, 0]} rad={0.35} h={0.06} m={M.led} shadow={false} />
          <pointLight position={[0, -0.6, 0]} color="#FFC266" intensity={14} distance={9} decay={2} />
        </group>
      ))}
      {/* papan nama */}
      <group position={[0, 6.55, -5.95]}>
        <Box s={[3.4, 0.55, 0.1]} m={M.royal} />
        <Html transform distanceFactor={5} position={[0, 0, 0.07]} pointerEvents="none">
          <div className="wall-sign">HIVE HALL</div>
        </Html>
      </group>
    </group>
  );
}

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
      <Hex p={[0, 0.38, 0]} rad={0.55} h={0.76} m={M.royal} />
      <Hex p={[0, 0.8, 0]} rad={1.95} h={0.14} m={M.gold} />
      <Hex p={[0, 0.72, 0]} rad={2.0} h={0.06} m={M.royal} />
      <Hex p={[0, 0.89, 0]} rad={0.7} h={0.03} m={M.nectar} shadow={false} />
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
        <i className="live" /> Aktivitas live
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
      <div className="ws-head gold">Kalender minggu ini</div>
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
      <div className="ws-head amber">Belum selesai · {data.open.length}</div>
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

function NameTag({ deg, label, kind }) {
  const s = seat(deg);
  return (
    <Html position={[s.pos[0], 2.45, s.pos[2]]} center pointerEvents="none" zIndexRange={[8, 6]}>
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
      dpr={[1, 2]}
      camera={{ position: (mobile ? DEFAULT_VIEW_MOBILE : DEFAULT_VIEW).pos, fov: mobile ? 52 : 38, near: 0.1, far: 200 }}
    >
      <color attach="background" args={['#FFF3D6']} />
      <hemisphereLight args={['#FFF8E7', '#C98A00', 0.85]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[6, 12, 8]}
        intensity={1.5}
        color="#FFE6B0"
        castShadow
        shadow-mapSize={[2048, 2048]}
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
        <div className="ws-head blue">Online · {data.online.length}</div>
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
        <div className="ws-head green">Agent AI · {data.aiOn}/21</div>
        <div className="ws-body">
          {data.aiAgents.map((a) => (
            <div key={a.id} className="ws-row person">
              <i style={{ background: a.on ? '#8DBF5A' : '#C0C5CE' }} />
              <span>{a.nick}</span>
              <small className={a.on ? 'here' : ''}>{a.on ? 'online' : 'off'}</small>
            </div>
          ))}
          <div className="ws-trend">{data.aiAgents[0].model}</div>
          <div className="ws-empty">20 agent lain belum tersambung</div>
        </div>
      </Screen>
      ) : (
      <Screen position={[7.9, 3.65, -5.95]} frame={[2.35, 3.55]} className="side" onFocus={() => focus([7.9, 3.65, -5.9], 6.2)}>
        <div className="ws-head green">Skor skill</div>
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
          <NameTag deg={0} label="Queen Bea" kind="ai ceo" />
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
      <NameTag deg={0} label="Queen Bea" kind="ai ceo" />
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
