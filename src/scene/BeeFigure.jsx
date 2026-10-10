// Hive Worker statis untuk Hive Hall: duduk di meja rapat, bergerak dan menyala saat bicara.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { QueenModel } from './QueenBea';
import { M, std, Box, Cyl, Sph, Cone } from './materials';

export function SpeakRing({ active, color = '#FF8C1A' }) {
  const ring = useRef();
  const mat = useMemo(() => std(color, { emissive: color, emissiveIntensity: 1.2 }), [color]);
  useFrame((st) => {
    if (!ring.current) return;
    ring.current.visible = active;
    if (active) ring.current.scale.setScalar(1 + Math.sin(st.clock.elapsedTime * 7) * 0.08);
  });
  return (
    <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat} visible={false}>
      <torusGeometry args={[0.62, 0.05, 8, 32]} />
    </mesh>
  );
}

export function SoundBars({ active, position = [0.62, 1.45, 0] }) {
  const g = useRef();
  useFrame((st) => {
    if (!g.current) return;
    g.current.visible = active;
    if (!active) return;
    g.current.children.forEach((c, i) => {
      c.scale.y = 0.4 + Math.abs(Math.sin(st.clock.elapsedTime * 9 + i * 1.3));
    });
  });
  return (
    <Billboard position={position}>
      <group ref={g} visible={false}>
        {[-0.09, 0, 0.09].map((x) => (
          <mesh key={x} position={[x, 0, 0]} material={M.led}>
            <boxGeometry args={[0.05, 0.22, 0.02]} />
          </mesh>
        ))}
      </group>
    </Billboard>
  );
}

function ThinkDots({ active }) {
  const g = useRef();
  useFrame((st) => {
    if (!g.current) return;
    g.current.visible = active;
    if (!active) return;
    g.current.children.forEach((c, i) => {
      c.scale.setScalar(0.6 + 0.5 * Math.abs(Math.sin(st.clock.elapsedTime * 4 - i * 0.6)));
    });
  });
  return (
    <Billboard position={[0, 2.2, 0]}>
      <group ref={g} visible={false}>
        {[-0.16, 0, 0.16].map((x) => (
          <mesh key={x} position={[x, 0, 0]} material={M.led}>
            <sphereGeometry args={[0.06, 8, 6]} />
          </mesh>
        ))}
      </group>
    </Billboard>
  );
}

export function BeeFigure({ position, facing = 0, crown = false, muted = false, speaking = false, thinking = false }) {
  const inner = useRef();
  const head = useRef();
  const wl = useRef();
  const wr = useRef();
  const al = useRef();
  const ar = useRef();
  const off = useMemo(() => Math.random() * 10, []);
  useFrame((st) => {
    const t = st.clock.elapsedTime + off;
    if (!inner.current) return;
    inner.current.position.y = speaking ? Math.abs(Math.sin(t * 8)) * 0.06 : Math.sin(t * 1.6) * 0.02;
    head.current.rotation.y = speaking ? Math.sin(t * 2.2) * 0.25 : Math.sin(t * 0.5) * 0.12;
    head.current.rotation.z = thinking ? 0.18 : 0;
    const flap = speaking ? Math.sin(t * 30) * 0.5 : Math.sin(t * 4) * 0.12;
    wl.current.rotation.z = -(0.45 + flap);
    wr.current.rotation.z = 0.45 + flap;
    al.current.rotation.x = speaking ? Math.sin(t * 4) * 0.5 - 0.6 : thinking ? -1.9 : -0.25;
    ar.current.rotation.x = speaking ? Math.sin(t * 4 + 1.5) * 0.3 - 0.3 : -0.25;
  });
  return (
    <group position={position} rotation={[0, facing, 0]}>
      <SpeakRing active={speaking} />
      <group ref={inner}>
        {crown ? (
          <QueenModel refs={{ head, wl, wr, al, ar }} thinking={thinking} />
        ) : (
          <>
        {[-0.12, 0.12].map((x) => (
          <group key={x}>
            <Cyl p={[x, 0.1, 0]} a={[0.07, 0.07, 0.2, 6]} m={M.brown} />
            <Sph p={[x, 0.04, 0.05]} rad={0.09} sc={[1, 0.6, 1.3]} m={M.brown} seg={[8, 6]} />
          </group>
        ))}
        <mesh position={[0, 0.55, 0]} material={M.hoodie} castShadow>
          <capsuleGeometry args={[0.3, 0.32, 4, 12]} />
        </mesh>
        <Cyl p={[0, 0.4, 0]} a={[0.305, 0.305, 0.07, 14]} m={M.brown} />
        <Cyl p={[0, 0.54, 0]} a={[0.31, 0.31, 0.07, 14]} m={M.brown} />
        <group ref={al} position={[-0.33, 0.72, 0]}>
          <mesh position={[0, -0.16, 0]} material={M.hoodie} castShadow>
            <capsuleGeometry args={[0.08, 0.18, 3, 8]} />
          </mesh>
          <Sph p={[0, -0.33, 0]} rad={0.08} m={M.cream} seg={[8, 6]} />
        </group>
        <group ref={ar} position={[0.33, 0.72, 0]}>
          <mesh position={[0, -0.16, 0]} material={M.hoodie} castShadow>
            <capsuleGeometry args={[0.08, 0.18, 3, 8]} />
          </mesh>
          <Sph p={[0, -0.33, 0]} rad={0.08} m={M.cream} seg={[8, 6]} />
        </group>
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
        <group ref={head} position={[0, 1.1, 0]}>
          <Sph rad={0.44} m={M.gold} seg={[16, 12]} />
          <Sph p={[0, -0.02, 0.12]} rad={0.35} m={M.skinBee} seg={[16, 12]} />
          <Sph p={[0, 0.17, 0.13]} rad={0.36} sc={[1, 0.5, 1]} m={M.hairBee} seg={[14, 8]} />
          {[-0.12, 0.12].map((x) => (
            <Sph key={x} p={[x, -0.02, 0.43]} rad={0.05} sc={thinking ? [1, 0.3, 1] : [1, 1, 1]} m={M.graphite} seg={[8, 6]} shadow={false} />
          ))}
          {[-0.21, 0.21].map((x) => (
            <Sph key={x} p={[x, -0.11, 0.38]} rad={0.055} sc={[1, 0.6, 0.5]} m={M.pink} seg={[8, 6]} shadow={false} />
          ))}
          <mesh position={[0, -0.14, 0.44]} rotation={[0, 0, Math.PI]} material={M.brown}>
            <torusGeometry args={[0.045, 0.013, 6, 12, Math.PI]} />
          </mesh>
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * 0.15, 0.36, 0]} rotation={[0, 0, -sx * 0.4]}>
              <Cyl p={[0, 0.16, 0]} a={[0.02, 0.02, 0.32, 5]} m={M.brown} />
              <Sph p={[0, 0.34, 0]} rad={0.065} m={M.amber} seg={[8, 6]} />
            </group>
          ))}
          {crown && (
            <group position={[0, 0.42, 0]}>
              <Cyl a={[0.2, 0.23, 0.12, 6]} m={M.led} />
              {[0, 1, 2, 3, 4].map((i) => {
                const a = (i / 5) * Math.PI * 2;
                return <Cone key={i} p={[0.18 * Math.cos(a), 0.12, 0.18 * Math.sin(a)]} a={[0.05, 0.14, 4]} m={M.gold} />;
              })}
            </group>
          )}
        </group>
          </>
        )}
      </group>
      {muted && (
        <Billboard position={[0.45, 1.75, 0]}>
          <mesh material={M.mute}>
            <circleGeometry args={[0.13, 20]} />
          </mesh>
          <Box p={[0, 0, 0.01]} r={[0, 0, Math.PI / 4]} s={[0.2, 0.035, 0.01]} m={M.white} shadow={false} />
        </Billboard>
      )}
      <group position={[0, crown ? 0.45 : 0, 0]}>
        <ThinkDots active={thinking} />
        <SoundBars active={speaking} />
      </group>
    </group>
  );
}
