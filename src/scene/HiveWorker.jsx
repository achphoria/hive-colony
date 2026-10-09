// Karakter "Hive Worker": chibi berhoodie lebah, aksesori berbeda per divisi.
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Billboard } from '@react-three/drei';
import { DEPTS, SKINS, HAIRS, tierOf, statusText } from '../data/hive';
import { useHive } from '../sim/store';
import { world, focusAgent } from '../sim/engine';
import { M, std, Box, Cyl, Sph, Cone } from './materials';

const BUBBLE = { mission: '#FF8C1A', break: '#9BD36A', charge: '#9EC9FF', meeting: '#FFF8E7' };

function Accessory({ type }) {
  switch (type) {
    case 'crown':
      return (
        <group position={[0, 0.42, 0]}>
          <Cyl p={[0, 0, 0]} a={[0.2, 0.23, 0.12, 6]} m={M.led} />
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return <Cone key={i} p={[0.18 * Math.cos(a), 0.12, 0.18 * Math.sin(a)]} a={[0.05, 0.14, 4]} m={M.gold} />;
          })}
        </group>
      );
    case 'headset':
      return (
        <group>
          <mesh material={M.graphite}>
            <torusGeometry args={[0.45, 0.035, 6, 16, Math.PI]} />
          </mesh>
          <Cyl p={[0.45, 0, 0]} r={[0, 0, Math.PI / 2]} a={[0.11, 0.11, 0.09, 10]} m={M.graphite} />
          <Cyl p={[-0.45, 0, 0]} r={[0, 0, Math.PI / 2]} a={[0.11, 0.11, 0.09, 10]} m={M.graphite} />
          <Box p={[0.38, -0.14, 0.2]} r={[0, -0.9, 0]} s={[0.03, 0.03, 0.3]} m={M.graphite} />
          <Sph p={[0.27, -0.16, 0.33]} rad={0.045} m={M.amber} />
        </group>
      );
    case 'hardhat':
      return (
        <group position={[0, 0.12, 0]}>
          <mesh material={M.amber} castShadow>
            <sphereGeometry args={[0.46, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <Cyl p={[0, 0.01, 0.06]} a={[0.52, 0.52, 0.04, 16]} m={M.amber} />
          <Box p={[0, 0.3, 0]} s={[0.08, 0.2, 0.7]} m={M.gold} />
        </group>
      );
    case 'glasses':
      return (
        <group position={[0, -0.02, 0.45]}>
          {[-0.13, 0.13].map((x) => (
            <mesh key={x} position={[x, 0, 0]} material={M.graphite}>
              <torusGeometry args={[0.085, 0.017, 6, 14]} />
            </mesh>
          ))}
          <Box p={[0, 0.01, 0]} s={[0.1, 0.02, 0.02]} m={M.graphite} />
        </group>
      );
    case 'beret':
      return (
        <group position={[0.07, 0.4, -0.02]} rotation={[0, 0, -0.3]}>
          <Cyl a={[0.33, 0.37, 0.1, 14]} m={M.graphite} />
          <Cyl p={[0, 0.08, 0]} a={[0.025, 0.025, 0.08, 6]} m={M.graphite} />
        </group>
      );
    case 'goggles':
      return (
        <group position={[0, 0.17, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={M.brown}>
            <torusGeometry args={[0.445, 0.03, 6, 20]} />
          </mesh>
          {[-0.14, 0.14].map((x) => (
            <Cyl key={x} p={[x, 0.02, 0.41]} r={[Math.PI / 2 - 0.3, 0, 0]} a={[0.09, 0.09, 0.07, 10]} m={M.honey} />
          ))}
        </group>
      );
    default:
      return null;
  }
}

function BodyAccessory({ type }) {
  if (type === 'bowtie')
    return (
      <group position={[0, 0.7, 0.3]}>
        <Cone p={[-0.08, 0, 0]} r={[0, 0, Math.PI / 2]} a={[0.06, 0.13, 4]} m={M.graphite} />
        <Cone p={[0.08, 0, 0]} r={[0, 0, -Math.PI / 2]} a={[0.06, 0.13, 4]} m={M.graphite} />
        <Sph rad={0.035} m={M.gold} />
      </group>
    );
  if (type === 'scarf')
    return (
      <group position={[0, 0.72, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={M.cream} castShadow>
          <torusGeometry args={[0.28, 0.07, 8, 16]} />
        </mesh>
        <Box p={[0.12, -0.18, 0.27]} r={[0.15, 0, 0.1]} s={[0.12, 0.3, 0.05]} m={M.cream} />
      </group>
    );
  return null;
}

function AgentTag({ def }) {
  const st = useHive((s) => s.agentStates[def.id]);
  return (
    <div className="agent-tag">
      <strong>{def.nick}</strong>
      <span>{statusText(st)}</span>
    </div>
  );
}

export function HiveWorker({ def }) {
  const g = useRef();
  const inner = useRef();
  const head = useRef();
  const wl = useRef();
  const wr = useRef();
  const al = useRef();
  const ar = useRef();
  const eyes = useRef();
  const bubble = useRef();
  const bubbleMat = useMemo(() => std('#FF8C1A', { emissive: '#FF8C1A', emissiveIntensity: 0.5 }), []);
  const ring = useRef();
  const [hover, setHover] = useState(false);
  const selected = useHive((s) => s.selectedAgent === def.id);
  const off = useMemo(() => Math.random() * 10, []);
  const blink = useRef(2 + Math.random() * 4);
  const mats = useMemo(() => ({ skin: std(SKINS[def.skin]), hair: std(HAIRS[def.skin]) }), [def.skin]);
  const acc = DEPTS[def.dept].acc;

  useFrame((st, dt) => {
    const a = world.byId[def.id];
    if (!a || !g.current) return;
    const floor = useHive.getState().floor;
    const visible = floor === 'all' || tierOf(a.pos.y) <= floor;
    g.current.visible = visible;
    if (!visible) return;
    g.current.position.copy(a.pos);
    let d = a.targetFacing - g.current.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.current.rotation.y += d * Math.min(1, dt * 8);

    const t = st.clock.elapsedTime + off;
    const s = a.state;
    const gym = s === 'break' && a.roomId === 'gym';
    let bob = 0;
    let tilt = 0;
    let flap = Math.sin(t * 5) * 0.12;
    let armL = 0;
    let armR = 0;
    let turn = 0;
    if (s === 'fly') {
      bob = 0.2 + Math.sin(t * 7) * 0.08;
      tilt = 0.28;
      flap = Math.sin(t * 40) * 0.7;
      armL = armR = -0.5;
    } else if (s === 'desk') {
      bob = Math.abs(Math.sin(t * 2)) * 0.02;
      armL = Math.sin(t * 16) * 0.15 - 0.9;
      armR = Math.sin(t * 16 + 1.6) * 0.15 - 0.9;
      turn = Math.sin(t * 0.6) * 0.15;
    } else if (s === 'meeting' || s === 'visit') {
      turn = Math.sin(t * 0.9) * 0.35;
      armL = Math.sin(t * 3) * 0.4 - 0.3;
      armR = -0.2;
    } else if (gym) {
      bob = Math.abs(Math.sin(t * 4)) * 0.35;
      armL = Math.sin(t * 8) * 1.2;
      armR = -armL;
    } else if (s === 'break') {
      bob = Math.sin(t * 1.5) * 0.04;
      turn = Math.sin(t * 0.7) * 0.3;
      armR = -1.2;
    } else if (s === 'charge') {
      bob = Math.sin(t) * 0.03;
      flap = 0;
    }
    if (a.cheer > 0) {
      bob += Math.sin(a.cheer * Math.PI) * 0.5;
      armL = armR = -2.6;
    }
    inner.current.position.y = bob;
    inner.current.rotation.x = tilt;
    head.current.rotation.y = turn;
    wl.current.rotation.z = -(0.45 + flap);
    wr.current.rotation.z = 0.45 + flap;
    al.current.rotation.x = armL;
    ar.current.rotation.x = armR;

    blink.current -= dt;
    let ey = 1;
    if (s === 'charge') ey = 0.12;
    else if (blink.current < 0) {
      ey = 0.12;
      if (blink.current < -0.13) blink.current = 2 + Math.random() * 4;
    }
    eyes.current.scale.y = ey;

    const key = a.missionId ? 'mission' : s;
    const col = BUBBLE[key];
    bubble.current.visible = !!col && s !== 'fly';
    if (col) {
      bubbleMat.color.set(col);
      bubbleMat.emissive.set(col);
      bubble.current.position.y = 2.15 + Math.sin(t * 3) * 0.06;
    }
    ring.current.visible = selected || hover;
    if (ring.current.visible) ring.current.rotation.z = t;
  });

  const onClick = (e) => {
    e.stopPropagation();
    if (!g.current?.visible) return;
    focusAgent(def.id, false);
  };

  return (
    <group
      ref={g}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.led} visible={false}>
        <torusGeometry args={[0.6, 0.045, 6, 6]} />
      </mesh>
      <group ref={inner}>
        {/* kaki */}
        {[-0.12, 0.12].map((x) => (
          <group key={x}>
            <Cyl p={[x, 0.1, 0]} a={[0.07, 0.07, 0.2, 6]} m={M.brown} />
            <Sph p={[x, 0.04, 0.05]} rad={0.09} sc={[1, 0.6, 1.3]} m={M.brown} seg={[8, 6]} />
          </group>
        ))}
        {/* badan hoodie */}
        <mesh position={[0, 0.55, 0]} material={M.hoodie} castShadow>
          <capsuleGeometry args={[0.3, 0.32, 4, 12]} />
        </mesh>
        <Cyl p={[0, 0.4, 0]} a={[0.305, 0.305, 0.07, 14]} m={M.brown} />
        <Cyl p={[0, 0.54, 0]} a={[0.31, 0.31, 0.07, 14]} m={M.brown} />
        <Box p={[0, 0.3, 0.27]} s={[0.26, 0.12, 0.04]} m={M.gold} />
        <BodyAccessory type={acc} />
        {/* tangan */}
        <group ref={al} position={[-0.33, 0.72, 0]}>
          <mesh position={[0, -0.16, 0]} material={M.hoodie} castShadow>
            <capsuleGeometry args={[0.08, 0.18, 3, 8]} />
          </mesh>
          <Sph p={[0, -0.33, 0]} rad={0.08} m={mats.skin} seg={[8, 6]} />
        </group>
        <group ref={ar} position={[0.33, 0.72, 0]}>
          <mesh position={[0, -0.16, 0]} material={M.hoodie} castShadow>
            <capsuleGeometry args={[0.08, 0.18, 3, 8]} />
          </mesh>
          <Sph p={[0, -0.33, 0]} rad={0.08} m={mats.skin} seg={[8, 6]} />
        </group>
        {/* sayap */}
        <group ref={wl} position={[-0.15, 0.82, -0.28]} rotation={[0, 0.35, 0]}>
          <mesh position={[-0.3, 0.08, 0]} scale={[0.36, 0.05, 0.2]} material={M.wing}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        </group>
        <group ref={wr} position={[0.15, 0.82, -0.28]} rotation={[0, -0.35, 0]}>
          <mesh position={[0.3, 0.08, 0]} scale={[0.36, 0.05, 0.2]} material={M.wing}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        </group>
        {/* kepala */}
        <group ref={head} position={[0, 1.1, 0]}>
          <Sph rad={0.44} m={M.gold} seg={[16, 12]} />
          <Sph p={[0, -0.02, 0.12]} rad={0.35} m={mats.skin} seg={[16, 12]} />
          <Sph p={[0, 0.17, 0.13]} rad={0.36} sc={[1, 0.5, 1]} m={mats.hair} seg={[14, 8]} />
          <group ref={eyes} position={[0, -0.02, 0]}>
            {[-0.12, 0.12].map((x) => (
              <group key={x}>
                <Sph p={[x, 0, 0.43]} rad={0.05} m={M.graphite} seg={[8, 6]} shadow={false} />
                <Sph p={[x + 0.017, 0.022, 0.475]} rad={0.016} m={M.white} seg={[6, 4]} shadow={false} />
              </group>
            ))}
          </group>
          {[-0.21, 0.21].map((x) => (
            <Sph key={x} p={[x, -0.11, 0.38]} rad={0.055} sc={[1, 0.6, 0.5]} m={M.pink} seg={[8, 6]} shadow={false} />
          ))}
          <mesh position={[0, -0.14, 0.44]} rotation={[0, 0, Math.PI]} material={M.brown}>
            <torusGeometry args={[0.045, 0.013, 6, 12, Math.PI]} />
          </mesh>
          {/* antena */}
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * 0.15, 0.36, 0]} rotation={[0, 0, -sx * 0.4]}>
              <Cyl p={[0, 0.16, 0]} a={[0.02, 0.02, 0.32, 5]} m={M.brown} />
              <Sph p={[0, 0.34, 0]} rad={0.065} m={M.amber} seg={[8, 6]} />
            </group>
          ))}
          <Accessory type={acc} />
        </group>
      </group>
      <Billboard ref={bubble} position={[0, 2.15, 0]} visible={false}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={bubbleMat}>
          <cylinderGeometry args={[0.13, 0.13, 0.04, 6]} />
        </mesh>
      </Billboard>
      {(hover || selected) && (
        <Html position={[0, 2.55, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <AgentTag def={def} />
        </Html>
      )}
    </group>
  );
}
