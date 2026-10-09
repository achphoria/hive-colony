// Furnitur low-poly. Untuk meja: sumbu +z lokal mengarah ke posisi agent berdiri.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { M, Box, Cyl, Hex, Sph, Cone } from './materials';
import { roomSpots } from '../data/hive';

const HALF = Math.PI / 2;

function Monitor({ p = [0, 0.88, -0.15], w = 0.62, h = 0.38 }) {
  return (
    <group position={p}>
      <Box p={[0, 0, 0]} s={[w, h, 0.05]} m={M.graphite} />
      <Box p={[0, 0, 0.03]} s={[w - 0.08, h - 0.08, 0.01]} m={M.screen} shadow={false} />
      <Cyl p={[0, -h / 2 - 0.06, 0]} a={[0.03, 0.03, 0.14, 6]} m={M.silver} />
    </group>
  );
}

export function PodDesk() {
  return (
    <group>
      <Box p={[0, 0.55, 0]} s={[1.4, 0.08, 0.72]} m={M.royal} />
      <Box p={[0, 0.27, -0.3]} s={[1.3, 0.5, 0.06]} m={M.gold} />
      {[-0.4, 0, 0.4].map((x) => (
        <Hex key={x} p={[x, 0.28, -0.335]} r={[HALF, 0, 0]} rad={0.09} h={0.02} m={M.cream} shadow={false} />
      ))}
      <Box p={[-0.65, 0.27, 0]} s={[0.06, 0.5, 0.62]} m={M.gold} />
      <Box p={[0.65, 0.27, 0]} s={[0.06, 0.5, 0.62]} m={M.gold} />
      <Monitor />
      <Box p={[0, 0.6, 0.13]} s={[0.42, 0.02, 0.14]} m={M.cream} />
      <Cyl p={[0.52, 0.66, 0.05]} a={[0.06, 0.06, 0.13, 8]} m={M.amber} />
    </group>
  );
}

export function StandingDesk() {
  return (
    <group>
      <Hex p={[0, 0.03, -0.05]} rad={0.4} h={0.06} m={M.graphite} />
      <Cyl p={[0, 0.44, -0.05]} a={[0.12, 0.26, 0.8, 8]} m={M.royal} />
      <Hex p={[0, 0.86, -0.05]} rad={0.62} h={0.07} m={M.gold} />
      <mesh position={[0, 1.42, -0.32]} material={M.holo}>
        <planeGeometry args={[0.95, 0.56]} />
      </mesh>
      <Box p={[-0.15, 1.52, -0.31]} s={[0.5, 0.05, 0.01]} m={M.amber} shadow={false} />
      <Box p={[0, 1.4, -0.31]} s={[0.75, 0.05, 0.01]} m={M.amber} shadow={false} />
      <Box p={[-0.2, 1.28, -0.31]} s={[0.4, 0.05, 0.01]} m={M.amber} shadow={false} />
      <Hex p={[0.55, 1.75, -0.3]} r={[HALF, 0, 0]} rad={0.07} h={0.02} m={M.led} shadow={false} />
      <Box p={[0, 0.91, 0.12]} s={[0.38, 0.02, 0.12]} m={M.cream} />
    </group>
  );
}

export function BoothDesk() {
  return (
    <group>
      <PodDesk />
      <Box p={[0, 1, 1.55]} s={[1.79, 2, 0.12]} m={M.cream} />
      <Box p={[1.342, 1, 0.775]} r={[0, Math.PI / 3, 0]} s={[1.79, 2, 0.12]} m={M.cream} />
      <Box p={[-1.342, 1, 0.775]} r={[0, -Math.PI / 3, 0]} s={[1.79, 2, 0.12]} m={M.cream} />
      <Box p={[0, 2.03, 1.55]} s={[1.85, 0.08, 0.18]} m={M.gold} />
      <Box p={[1.342, 2.03, 0.775]} r={[0, Math.PI / 3, 0]} s={[1.85, 0.08, 0.18]} m={M.gold} />
      <Box p={[-1.342, 2.03, 0.775]} r={[0, -Math.PI / 3, 0]} s={[1.85, 0.08, 0.18]} m={M.gold} />
      {[-0.45, 0, 0.45].map((x) => (
        <Hex key={x} p={[x, 1.45, 1.48]} r={[HALF, 0, 0]} rad={0.16} h={0.03} m={M.nectar} shadow={false} />
      ))}
      <Cyl p={[0, 1.95, 1.0]} a={[0.01, 0.01, 0.25, 4]} m={M.silver} />
      <Sph p={[0, 1.78, 1.0]} rad={0.09} m={M.led} shadow={false} />
    </group>
  );
}

export function ThroneDesk() {
  return (
    <group>
      <Box p={[0, 0.6, 0]} s={[2, 0.1, 0.9]} m={M.royal} />
      <Box p={[0, 0.3, -0.4]} s={[1.9, 0.55, 0.08]} m={M.gold} />
      <Hex p={[0, 0.3, -0.45]} r={[HALF, 0, 0]} rad={0.18} h={0.03} m={M.led} shadow={false} />
      <Box p={[-0.9, 0.3, 0]} s={[0.08, 0.55, 0.8]} m={M.gold} />
      <Box p={[0.9, 0.3, 0]} s={[0.08, 0.55, 0.8]} m={M.gold} />
      <Monitor p={[0, 1.02, -0.22]} w={1.3} h={0.62} />
      <Cyl p={[0.75, 0.72, 0.1]} a={[0.07, 0.06, 0.14, 8]} m={M.amber} />
      {/* singgasana di belakang agent */}
      <Box p={[0, 0.3, 1.2]} s={[1.1, 0.25, 0.8]} m={M.amber} />
      <Box p={[0, 1.15, 1.6]} s={[1.2, 1.9, 0.16]} m={M.royal} />
      <Box p={[-0.6, 0.6, 1.25]} s={[0.12, 0.35, 0.75]} m={M.gold} />
      <Box p={[0.6, 0.6, 1.25]} s={[0.12, 0.35, 0.75]} m={M.gold} />
      <Hex p={[0, 1.4, 1.5]} r={[HALF, 0, 0]} rad={0.3} h={0.04} m={M.nectar} />
      {[-0.4, 0, 0.4].map((x, i) => (
        <Cone key={x} p={[x, i === 1 ? 2.3 : 2.22, 1.6]} a={[0.12, i === 1 ? 0.36 : 0.22, 5]} m={M.gold} />
      ))}
    </group>
  );
}

export const DESKS = { pod: PodDesk, standing: StandingDesk, booth: BoothDesk, throne: ThroneDesk };

function Plant({ p, s = 1 }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 0.2, 0]} a={[0.2, 0.15, 0.4, 6]} m={M.amber} />
      <Sph p={[0, 0.62, 0]} rad={0.32} m={M.leaf} seg={[7, 5]} />
      <Sph p={[0.12, 0.85, 0.05]} rad={0.2} m={M.leafDark} seg={[6, 4]} />
    </group>
  );
}

function Rug({ m, rad = 1.3 }) {
  return <Hex p={[0, 0.012, 0]} rad={rad} h={0.02} m={m} shadow={false} />;
}

/* ---------- prop divisi (di tengah ruangan) ---------- */

function SpinBubble() {
  const ref = useRef();
  useFrame((st) => {
    if (!ref.current) return;
    ref.current.rotation.y = st.clock.elapsedTime * 0.8;
    ref.current.position.y = 1.35 + Math.sin(st.clock.elapsedTime * 1.6) * 0.08;
  });
  return (
    <group ref={ref} position={[0, 1.35, 0]}>
      <Sph rad={0.32} sc={[1.3, 1, 0.6]} m={M.cream} />
      <Cone p={[-0.18, -0.3, 0]} a={[0.1, 0.22, 4]} r={[0, 0, 0.5]} m={M.cream} />
      {[-0.15, 0, 0.15].map((x) => (
        <Sph key={x} p={[x, 0, 0.2]} rad={0.05} m={M.amber} shadow={false} />
      ))}
    </group>
  );
}

export function DeptProp({ dept }) {
  switch (dept) {
    case 'cx':
      return (
        <group>
          <Rug m={M.nectar} />
          <Cyl p={[0, 0.45, 0]} a={[0.18, 0.3, 0.9, 6]} m={M.gold} />
          <SpinBubble />
          <Plant p={[0.9, 0, 0.9]} s={0.8} />
        </group>
      );
    case 'ops':
      return (
        <group>
          <Rug m={M.creamDark} />
          {/* treadmill mini */}
          <Box p={[0, 0.12, 0.2]} s={[0.7, 0.2, 1.5]} m={M.graphite} />
          <Box p={[0, 0.23, 0.2]} s={[0.55, 0.03, 1.3]} m={M.brown} />
          <Box p={[-0.3, 0.65, -0.45]} s={[0.05, 0.9, 0.05]} m={M.silver} />
          <Box p={[0.3, 0.65, -0.45]} s={[0.05, 0.9, 0.05]} m={M.silver} />
          <Box p={[0, 1.08, -0.45]} s={[0.7, 0.18, 0.12]} m={M.amber} />
          {[-0.9, -0.6].map((x) => (
            <group key={x} position={[x, 0, -0.7]}>
              <Sph p={[0, 0.17, 0]} rad={0.17} m={M.graphite} seg={[8, 6]} />
              <mesh position={[0, 0.36, 0]} material={M.graphite}>
                <torusGeometry args={[0.08, 0.025, 5, 10]} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case 'it':
      return (
        <group>
          <Rug m={M.silver} />
          <Box p={[0, 0.7, 0]} s={[0.6, 1.4, 0.6]} m={M.graphite} />
          {[0.3, 0.6, 0.9, 1.2].map((y) => (
            <Box key={y} p={[0, y, 0.31]} s={[0.45, 0.05, 0.01]} m={y === 0.9 ? M.ledGreen : M.led} shadow={false} />
          ))}
          <Cyl p={[0.6, 0.04, 0.4]} a={[0.03, 0.03, 0.9, 4]} r={[0, 0, HALF]} m={M.amber} />
        </group>
      );
    case 'mkt':
      return (
        <group>
          <Rug m={M.nectar} />
          {/* easel */}
          <Box p={[-0.25, 0.7, 0]} r={[0, 0, 0.12]} s={[0.05, 1.4, 0.05]} m={M.wood} />
          <Box p={[0.25, 0.7, 0]} r={[0, 0, -0.12]} s={[0.05, 1.4, 0.05]} m={M.wood} />
          <Box p={[0, 0.65, -0.18]} r={[-0.25, 0, 0]} s={[0.05, 1.3, 0.05]} m={M.wood} />
          <Box p={[0, 1.0, 0.04]} s={[0.8, 0.6, 0.04]} m={M.cream} />
          <Hex p={[-0.1, 1.02, 0.07]} r={[HALF, 0, 0]} rad={0.16} h={0.02} m={M.amber} shadow={false} />
          <Sph p={[0.18, 0.92, 0.07]} rad={0.08} m={M.gold} shadow={false} />
          {/* kamera di tripod */}
          <group position={[0.95, 0, 0.6]}>
            <Cyl p={[0, 0.5, 0]} a={[0.025, 0.025, 1, 4]} m={M.graphite} />
            <Box p={[0, 1.05, 0]} s={[0.3, 0.2, 0.2]} m={M.graphite} />
            <Cyl p={[0, 1.05, 0.14]} a={[0.07, 0.07, 0.1, 8]} r={[HALF, 0, 0]} m={M.silver} />
          </group>
        </group>
      );
    case 'fin':
      return (
        <group>
          <Rug m={M.creamDark} />
          {[0.3, 0.55, 0.85, 1.15].map((h, i) => (
            <Box key={i} p={[-0.45 + i * 0.3, h / 2, -0.2]} s={[0.22, h, 0.22]} m={i % 2 ? M.amber : M.gold} />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <Cyl key={i} p={[0.75, 0.04 + i * 0.07, 0.55]} a={[0.15, 0.15, 0.06, 10]} m={M.gold} />
          ))}
          {[0, 1, 2].map((i) => (
            <Cyl key={i} p={[0.45, 0.04 + i * 0.07, 0.8]} a={[0.15, 0.15, 0.06, 10]} m={M.nectar} />
          ))}
        </group>
      );
    case 'prod':
      return (
        <group>
          <Rug m={M.nectar} />
          {/* printer 3D */}
          <Box p={[0, 0.06, 0]} s={[0.9, 0.12, 0.9]} m={M.graphite} />
          <Box p={[-0.42, 0.6, 0]} s={[0.06, 1.1, 0.06]} m={M.silver} />
          <Box p={[0.42, 0.6, 0]} s={[0.06, 1.1, 0.06]} m={M.silver} />
          <Box p={[0, 1.15, 0]} s={[0.9, 0.06, 0.1]} m={M.silver} />
          <Box p={[0, 1.05, 0]} s={[0.15, 0.15, 0.15]} m={M.amber} />
          <mesh position={[0, 0.3, 0]} rotation={[HALF, 0, 0]} material={M.gold} castShadow>
            <torusGeometry args={[0.18, 0.07, 6, 6]} />
          </mesh>
          <Plant p={[-0.9, 0, 0.8]} s={0.7} />
        </group>
      );
    case 'hr':
      return (
        <group>
          <Rug m={M.creamDark} />
          <Plant p={[0, 0, 0]} s={1.35} />
          <group position={[0.9, 0, 0.5]}>
            <Box p={[0, 0.5, 0]} s={[0.5, 1, 0.5]} m={M.silver} />
            {[0.25, 0.55, 0.85].map((y) => (
              <Box key={y} p={[0, y, 0.26]} s={[0.3, 0.04, 0.02]} m={M.graphite} shadow={false} />
            ))}
          </group>
        </group>
      );
    default:
      return null;
  }
}

/* ---------- ruang bersama ---------- */

function atSpots(roomId, r, render) {
  return roomSpots(roomId).map((s, i) => {
    const c = Math.cos(s.angle);
    const sn = Math.sin(s.angle);
    return (
      <group key={i} position={[r * c, 0, r * sn]} rotation={[0, Math.atan2(-c, -sn), 0]}>
        {render(i)}
      </group>
    );
  });
}

export function LobbySet() {
  return (
    <group>
      <Rug m={M.gold} rad={1.6} />
      {/* emblem sarang */}
      <group position={[0, 0, -0.2]}>
        <Cyl p={[0, 0.5, 0]} a={[0.12, 0.2, 1, 6]} m={M.royal} />
        <mesh position={[0, 1.55, 0]} rotation={[0, 0, Math.PI / 6]} material={M.gold} castShadow>
          <torusGeometry args={[0.6, 0.1, 6, 6]} />
        </mesh>
        <Box p={[0, 1.65, 0]} s={[0.7, 0.1, 0.06]} m={M.brown} />
        <Box p={[0, 1.42, 0]} s={[0.7, 0.1, 0.06]} m={M.brown} />
      </group>
      {/* meja resepsionis */}
      <group position={[0, 0, -3.1]}>
        <Box p={[0, 0.45, 0]} s={[2.4, 0.9, 0.6]} m={M.gold} />
        <Box p={[0, 0.93, 0]} s={[2.5, 0.07, 0.7]} m={M.royal} />
        <Monitor p={[0.6, 1.2, -0.05]} w={0.5} h={0.32} />
      </group>
      <Plant p={[-3.2, 0, 0]} s={1.1} />
      <Plant p={[3.2, 0, 0]} s={1.1} />
      <Box p={[-2.2, 0.25, 2.2]} r={[0, -0.5, 0]} s={[1.4, 0.18, 0.5]} m={M.amber} />
    </group>
  );
}

export function LoungeSet() {
  return (
    <group>
      <Rug m={M.nectar} rad={1.4} />
      {/* dispenser madu */}
      <Hex p={[0, 0.45, 0]} rad={0.75} h={0.9} m={M.royal} />
      <Hex p={[0, 0.93, 0]} rad={0.85} h={0.07} m={M.gold} />
      <Cyl p={[0, 1.35, 0]} a={[0.28, 0.28, 0.75, 10]} m={M.glass} shadow={false} />
      <Cyl p={[0, 1.22, 0]} a={[0.25, 0.25, 0.48, 10]} m={M.honey} />
      <Cyl p={[0, 1.78, 0]} a={[0.3, 0.3, 0.1, 10]} m={M.silver} />
      {[0, 2, 4].map((i) => (
        <Cyl key={i} p={[0.6 * Math.cos(i), 1.02, 0.6 * Math.sin(i)]} a={[0.07, 0.06, 0.13, 8]} m={M.cream} />
      ))}
      {/* sofa bulat di belakang titik duduk */}
      {atSpots('lounge', 3.35, (i) =>
        i % 2 === 0 ? (
          <group>
            <Box p={[0, 0.22, 0]} s={[1.2, 0.35, 0.6]} m={M.amber} />
            <Box p={[0, 0.55, 0.25]} s={[1.2, 0.5, 0.15]} m={M.amber} />
            <Sph p={[0.35, 0.48, 0.05]} rad={0.13} sc={[1, 1, 0.5]} m={M.cream} />
          </group>
        ) : (
          <Plant p={[0, 0, 0.2]} s={0.9} />
        ),
      )}
    </group>
  );
}

export function GymSet() {
  return (
    <group>
      <Hex p={[0, 0.012, 0]} rad={3.6} h={0.02} m={M.graphite} shadow={false} />
      <Hex p={[0, 0.02, 0]} rad={1.3} h={0.02} m={M.amber} shadow={false} />
      {/* rig / rack di tengah */}
      {[-0.6, 0.6].map((x) => (
        <Box key={x} p={[x, 0.9, 0]} s={[0.1, 1.8, 0.1]} m={M.silver} />
      ))}
      <Box p={[0, 1.78, 0]} s={[1.3, 0.08, 0.08]} m={M.silver} />
      <Box p={[0, 1.4, 0]} s={[0.5, 0.5, 0.06]} m={M.gold} />
      <Hex p={[0, 1.4, 0.04]} r={[HALF, 0, 0]} rad={0.15} h={0.02} m={M.brown} shadow={false} />
      {atSpots('gym', 3.35, (i) => {
        if (i % 3 === 0)
          return (
            <group>
              {/* sled */}
              <Box p={[0, 0.25, 0]} s={[0.7, 0.3, 0.6]} m={M.amber} />
              <Box p={[0, 0.06, 0]} s={[0.8, 0.06, 0.7]} m={M.silver} />
              <Box p={[0.25, 0.65, -0.25]} r={[0.4, 0, 0]} s={[0.05, 0.6, 0.05]} m={M.silver} />
              <Box p={[-0.25, 0.65, -0.25]} r={[0.4, 0, 0]} s={[0.05, 0.6, 0.05]} m={M.silver} />
            </group>
          );
        if (i % 3 === 1)
          return (
            <group>
              {/* rower */}
              <Box p={[0, 0.12, 0]} r={[0, HALF, 0]} s={[1.5, 0.08, 0.2]} m={M.silver} />
              <Cyl p={[0, 0.3, 0.6]} a={[0.25, 0.25, 0.15, 10]} r={[0, 0, HALF]} m={M.graphite} />
              <Box p={[0, 0.22, -0.1]} s={[0.3, 0.08, 0.3]} m={M.amber} />
            </group>
          );
        return (
          <group>
            <Sph p={[-0.25, 0.2, 0]} rad={0.2} m={M.gold} seg={[8, 6]} />
            <Sph p={[0.25, 0.2, 0.1]} rad={0.2} m={M.amber} seg={[8, 6]} />
          </group>
        );
      })}
    </group>
  );
}

export function HallSet() {
  return (
    <group>
      <Hex p={[0, 0.65, 0]} rad={1.25} h={0.1} m={M.royal} />
      <Hex p={[0, 0.33, 0]} rad={0.35} h={0.6} m={M.gold} />
      <Hex p={[0, 0.72, 0]} rad={0.55} h={0.04} m={M.nectar} shadow={false} />
      <mesh position={[0, 1.4, 0]} material={M.holo}>
        <cylinderGeometry args={[0.45, 0.45, 0.5, 6, 1, true, Math.PI / 2]} />
      </mesh>
      {atSpots('hall', 2.6, () => (
        <Cyl p={[0, 0.22, 0]} a={[0.25, 0.22, 0.44, 6]} m={M.amber} />
      ))}
      <Box p={[0, 1.4, -3.6]} s={[2.2, 1.2, 0.08]} m={M.graphite} />
      <Box p={[0, 1.4, -3.55]} s={[2.0, 1.0, 0.02]} m={M.screen} shadow={false} />
    </group>
  );
}

export function PodsSet() {
  return (
    <group>
      {atSpots('pods', 2.7, (i) => (
        <group>
          <Hex p={[0, 0.06, 0]} rad={0.6} h={0.12} m={M.silver} />
          <Hex p={[0, 0.13, 0]} rad={0.5} h={0.02} m={i % 2 ? M.led : M.ledGreen} shadow={false} />
          <mesh position={[0, 1.0, 0]} material={M.glass}>
            <capsuleGeometry args={[0.55, 0.8, 4, 12]} />
          </mesh>
          <Hex p={[0, 1.95, 0]} rad={0.45} h={0.1} m={M.gold} />
        </group>
      ))}
      <Hex p={[0, 0.3, 0]} rad={0.8} h={0.6} m={M.silver} />
      <Hex p={[0, 0.62, 0]} rad={0.6} h={0.04} m={M.led} shadow={false} />
    </group>
  );
}

export function ServerSet() {
  const leds = useRef([]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    leds.current.forEach((m, i) => {
      if (m) m.visible = Math.sin(t * 3 + i * 1.7) > -0.2;
    });
  });
  let k = 0;
  return (
    <group>
      <Hex p={[0, 0.6, 0]} rad={0.6} h={1.2} m={M.silver} />
      <Hex p={[0, 0.9, 0]} rad={0.62} h={0.1} m={M.amber} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = ((90 + 60 * i) * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        return (
          <group key={i} position={[3.25 * c, 0, 3.25 * s]} rotation={[0, Math.atan2(-c, -s), 0]}>
            <Box p={[0, 0.85, 0]} s={[0.9, 1.7, 0.6]} m={M.graphite} />
            {[0.35, 0.65, 0.95, 1.25, 1.55].map((y) => (
              <mesh
                key={y}
                ref={(el) => (leds.current[k++] = el)}
                position={[-0.2 + ((y * 10) % 3) * 0.15, y, 0.31]}
                material={(y * 10) % 2 > 1 ? M.ledGreen : M.led}
              >
                <boxGeometry args={[0.08, 0.05, 0.01]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function Flower({ p, m }) {
  return (
    <group position={p}>
      <Cyl p={[0, 0.2, 0]} a={[0.02, 0.02, 0.4, 4]} m={M.leafDark} shadow={false} />
      <Sph p={[0, 0.42, 0]} rad={0.1} m={m} seg={[6, 4]} />
      <Sph p={[0, 0.43, 0]} rad={0.05} m={M.gold} seg={[6, 4]} shadow={false} />
    </group>
  );
}

export function GardenSet() {
  const flowers = [];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4;
    const r = 1.2 + ((i * 37) % 30) / 10;
    if (r > 3.9) continue;
    flowers.push(<Flower key={i} p={[r * Math.cos(a), 0, r * Math.sin(a)]} m={[M.white, M.pink, M.nectar][i % 3]} />);
  }
  return (
    <group>
      {flowers}
      {/* kotak sarang lebah */}
      <group position={[0, 0, 0]}>
        <Box p={[0, 0.3, 0]} s={[0.8, 0.6, 0.6]} m={M.cream} />
        <Box p={[0, 0.7, 0]} s={[0.85, 0.2, 0.65]} m={M.gold} />
        <Box p={[0, 0.88, 0]} s={[0.95, 0.12, 0.75]} m={M.royal} />
        <Box p={[0, 0.15, 0.31]} s={[0.3, 0.06, 0.02]} m={M.brown} shadow={false} />
      </group>
      {/* pohon kecil */}
      <group position={[-2.6, 0, -2.2]}>
        <Cyl p={[0, 0.5, 0]} a={[0.1, 0.14, 1, 6]} m={M.wood} />
        <Cone p={[0, 1.4, 0]} a={[0.7, 1.2, 7]} m={M.leaf} />
        <Cone p={[0, 2.0, 0]} a={[0.5, 0.9, 7]} m={M.leafDark} />
      </group>
      <Box p={[2.3, 0.25, -2.4]} r={[0, 0.6, 0]} s={[1.3, 0.12, 0.45]} m={M.wood} />
    </group>
  );
}

export function MissionSet() {
  const ref = useRef();
  useFrame((st) => {
    if (ref.current) ref.current.rotation.y = st.clock.elapsedTime * 0.3;
  });
  return (
    <group>
      <Hex p={[0, 0.45, 0]} rad={1.1} h={0.9} m={M.graphite} />
      <Hex p={[0, 0.92, 0]} rad={1.2} h={0.06} m={M.gold} />
      <group ref={ref} position={[0, 1.1, 0]}>
        {[
          [0, 0, 0.3],
          [0.45, 0.26, 0.15],
          [-0.45, 0.26, 0.2],
          [0, 0.52, 0.1],
          [0.45, -0.26, 0.25],
          [-0.45, -0.26, 0.12],
          [0, -0.52, 0.18],
        ].map(([x, z, h], i) => (
          <mesh key={i} position={[x, h / 2, z]} material={i === 0 ? M.led : M.holo}>
            <cylinderGeometry args={[0.24, 0.24, h, 6, 1, false, Math.PI / 2]} />
          </mesh>
        ))}
      </group>
      {[-1, 0, 1].map((i) => {
        const a = -HALF + i * 0.55;
        return (
          <group key={i} position={[3.4 * Math.cos(a), 0, 3.4 * Math.sin(a)]} rotation={[0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0]}>
            <Box p={[0, 1.5, 0]} s={[1.5, 0.9, 0.08]} m={M.graphite} />
            <Box p={[0, 1.5, 0.05]} s={[1.35, 0.75, 0.01]} m={M.screen} shadow={false} />
            <Box p={[0, 0.5, 0]} s={[0.1, 1.1, 0.1]} m={M.silver} />
          </group>
        );
      })}
    </group>
  );
}

export function RoyalDecor() {
  return (
    <group>
      <Hex p={[0, 0.012, 0.3]} rad={1.6} h={0.02} m={M.amber} shadow={false} />
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 2.9, 0, 1.4]}>
          <Hex p={[0, 0.9, 0]} rad={0.22} h={1.8} m={M.cream} />
          <Hex p={[0, 1.85, 0]} rad={0.3} h={0.12} m={M.gold} />
          <Sph p={[0, 2.05, 0]} rad={0.14} m={M.led} shadow={false} />
        </group>
      ))}
      <Plant p={[0, 0, 2.6]} s={0.9} />
    </group>
  );
}
