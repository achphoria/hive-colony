// Avatar staff manusia 3D: tanpa tudung/sayap lebah (pembeda dari agent AI),
// bisa dikustomisasi dan punya 6 joget + animasi jalan.
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { DEPTS } from '../data/hive';
import { POSE_BY_ID } from '../data/staff';
import { outdoor } from '../sim/outdoor';
import { useHive } from '../sim/store';
import { M, std, Box, Cyl, Sph, HEX_START } from './materials';

// Posisi badan per pose pada waktu t. aL/aR = rotasi bahu ke samping (kiri negatif = keluar),
// aLx/aRx = ayun depan-belakang, lL/lR = ayun kaki.
export function poseState(pose, t) {
  const s = { y: 0, x: 0, rz: 0, scale: 1, headZ: 0, aL: 0.08, aR: -0.08, aLx: 0, aRx: 0, lL: 0, lR: 0, wings: false, flap: 0 };
  switch (pose) {
    case 'walk': {
      const k = Math.sin(t * 9);
      s.y = Math.abs(k) * 0.05;
      s.aLx = k * 0.6;
      s.aRx = -k * 0.6;
      s.lL = -k * 0.5;
      s.lR = k * 0.5;
      break;
    }
    case 'itik': {
      const k = Math.sin(t * 6.3);
      const f = Math.abs(Math.sin(t * 14));
      s.x = k * 0.12;
      s.rz = -k * 0.12;
      s.aL = -(0.3 + f * 0.9);
      s.aR = 0.3 + f * 0.9;
      s.headZ = k * 0.15;
      break;
    }
    case 'floss': {
      const k = Math.sin(t * 8.7);
      s.x = k * 0.1;
      s.aL = k * 0.7;
      s.aR = k * 0.7;
      s.aLx = k * 0.5;
      s.aRx = -k * 0.5;
      break;
    }
    case 'baling':
      s.y = Math.abs(Math.sin(t * 12)) * 0.2;
      s.aL = -t * 14;
      s.aR = t * 14;
      s.headZ = Math.sin(t * 3.5) * 0.2;
      break;
    case 'robot': {
      const k = Math.floor(t * 3.3) % 4;
      s.aL = [-1.57, 0, -1.57, -2.8][k];
      s.aR = [0, 1.57, 2.8, 1.57][k];
      s.headZ = [-0.2, 0.2, 0, 0.2][k];
      s.y = k % 2 ? 0.06 : 0;
      break;
    }
    case 'koboi': {
      const k = Math.sin(t * 10);
      s.y = Math.abs(k) * 0.25;
      s.rz = k * 0.05;
      s.aR = 2.9 + k * 0.3;
      s.aL = -0.2;
      s.aLx = -0.7;
      s.lL = Math.max(0, k) * 0.5;
      s.lR = Math.max(0, -k) * 0.5;
      s.headZ = Math.sin(t * 5) * 0.12;
      break;
    }
    case 'pargoy': {
      const u = (t % 2.4) / 2.4;
      s.wings = true;
      s.flap = Math.sin(t * 60) * 0.35;
      if (u < 0.8) {
        const k = Math.sin(t * 13);
        s.y = Math.abs(k) * 0.2;
        s.rz = k * 0.07;
        s.aL = -2.75 + k * 0.25;
        s.aR = 2.75 + k * 0.25;
        s.headZ = Math.sin(t * 26) * 0.25;
      } else {
        s.aL = -0.6;
        s.aR = 1.6;
        s.scale = 1.04;
        s.headZ = -0.1;
      }
      break;
    }
    default:
      s.y = Math.sin(t * 2) * 0.015;
  }
  return s;
}

function Hair({ type, mat }) {
  const cap = (
    <mesh position={[0, 0.02, -0.02]} rotation={[-0.3, 0, 0]} material={mat} castShadow>
      <sphereGeometry args={[0.42, 16, 10, 0, Math.PI * 2, 0, 1.25]} />
    </mesh>
  );
  switch (type) {
    case 'short':
      return cap;
    case 'long':
      return (
        <group>
          {cap}
          <Sph p={[0, -0.12, -0.2]} rad={1} sc={[0.42, 0.5, 0.26]} m={mat} seg={[12, 8]} />
        </group>
      );
    case 'pony':
      return (
        <group>
          {cap}
          <Sph p={[0, 0.12, -0.44]} rad={0.15} m={mat} seg={[10, 8]} />
          <Sph p={[0, -0.06, -0.48]} rad={0.11} m={mat} seg={[10, 8]} />
        </group>
      );
    case 'mohawk':
      return <Box p={[0, 0.38, -0.02]} s={[0.1, 0.2, 0.62]} m={mat} />;
    default:
      return null;
  }
}

function Face({ expr }) {
  const eyeScale = expr === 'chill' ? [1, 0.25, 1] : expr === 'happy' ? [1, 0.55, 1] : expr === 'hype' ? [1.3, 1.3, 1] : [1, 1, 1];
  return (
    <group>
      <Sph p={[-0.13, 0.02, 0.37]} rad={0.05} sc={eyeScale} m={M.graphite} seg={[8, 6]} shadow={false} />
      <Sph p={[0.13, 0.02, 0.37]} rad={0.05} sc={expr === 'wink' ? [1.1, 0.18, 1] : eyeScale} m={M.graphite} seg={[8, 6]} shadow={false} />
      {expr === 'hype' && (
        <>
          <Sph p={[-0.11, 0.05, 0.41]} rad={0.018} m={M.white} seg={[6, 4]} shadow={false} />
          <Sph p={[0.15, 0.05, 0.41]} rad={0.018} m={M.white} seg={[6, 4]} shadow={false} />
          <Sph p={[0, -0.14, 0.36]} rad={0.07} sc={[1, 0.75, 0.5]} m={M.brown} seg={[8, 6]} shadow={false} />
        </>
      )}
      {(expr === 'happy' || expr === 'wink') && (
        <mesh position={[0, -0.13, 0.38]} rotation={[0, 0, Math.PI]} material={M.brown}>
          <torusGeometry args={[0.06, 0.015, 6, 12, Math.PI]} />
        </mesh>
      )}
      {expr === 'chill' && <Box p={[0, -0.13, 0.39]} s={[0.1, 0.02, 0.01]} m={M.brown} shadow={false} />}
      <Sph p={[-0.24, -0.08, 0.31]} rad={0.055} sc={[1, 0.6, 0.5]} m={M.pink} seg={[8, 6]} shadow={false} />
      <Sph p={[0.24, -0.08, 0.31]} rad={0.055} sc={[1, 0.6, 0.5]} m={M.pink} seg={[8, 6]} shadow={false} />
    </group>
  );
}

function HeadAccessory({ acc }) {
  switch (acc) {
    case 'glasses':
      return (
        <group position={[0, 0.02, 0.4]}>
          {[-0.13, 0.13].map((x) => (
            <mesh key={x} position={[x, 0, 0]} material={M.graphite}>
              <torusGeometry args={[0.08, 0.016, 6, 14]} />
            </mesh>
          ))}
          <Box p={[0, 0.01, 0]} s={[0.1, 0.02, 0.02]} m={M.graphite} shadow={false} />
        </group>
      );
    case 'cap':
      return (
        <group position={[0, 0.06, 0]} rotation={[-0.15, 0, 0]}>
          <mesh material={M.amber} castShadow>
            <sphereGeometry args={[0.43, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <Box p={[0, 0.02, 0.4]} s={[0.46, 0.03, 0.3]} m={M.royal} />
        </group>
      );
    case 'band':
      return (
        <mesh position={[0, 0.17, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.amber}>
          <torusGeometry args={[0.405, 0.04, 6, 20]} />
        </mesh>
      );
    case 'ear':
      return (
        <>
          <Sph p={[-0.4, -0.06, 0]} rad={0.035} m={M.led} seg={[6, 4]} shadow={false} />
          <Sph p={[0.4, -0.06, 0]} rad={0.035} m={M.led} seg={[6, 4]} shadow={false} />
        </>
      );
    default:
      return null;
  }
}

function Outfit({ type }) {
  switch (type) {
    case 'hoodie':
      return (
        <>
          <Cyl p={[0, 0.45, 0]} a={[0.285, 0.285, 0.06, 14]} m={M.brown} />
          <Cyl p={[0, 0.58, 0]} a={[0.29, 0.29, 0.06, 14]} m={M.brown} />
          <mesh position={[0, 0.8, -0.04]} rotation={[Math.PI / 2, 0, 0]} material={M.royal}>
            <torusGeometry args={[0.2, 0.06, 6, 14]} />
          </mesh>
        </>
      );
    case 'tee':
      return (
        <mesh position={[0, 0.62, 0.28]} rotation={[Math.PI / 2, 0, 0]} material={M.cream}>
          <cylinderGeometry args={[0.1, 0.1, 0.02, 6, 1, false, HEX_START]} />
        </mesh>
      );
    case 'jacket':
      return <Box p={[0, 0.55, 0.285]} s={[0.03, 0.55, 0.01]} m={M.cream} shadow={false} />;
    case 'shirt':
      return (
        <>
          <Box p={[-0.07, 0.8, 0.2]} r={[0.4, 0, 0.5]} s={[0.12, 0.03, 0.08]} m={M.cream} />
          <Box p={[0.07, 0.8, 0.2]} r={[0.4, 0, -0.5]} s={[0.12, 0.03, 0.08]} m={M.cream} />
          {[0.65, 0.53, 0.41].map((y) => (
            <Sph key={y} p={[0, y, 0.285]} rad={0.018} m={M.cream} seg={[6, 4]} shadow={false} />
          ))}
        </>
      );
    default:
      return null;
  }
}

function StatusTag({ walker, isMe }) {
  const p = walker.profile;
  const dept = DEPTS[p.dept];
  const doing = walker.state === 'dance' ? `joget ${POSE_BY_ID[walker.pose]?.name || ''}` : walker.state === 'walk' ? 'jalan-jalan' : 'santai';
  return (
    <div className={`agent-tag staff-tag${isMe ? ' is-me' : ''}`}>
      <strong>{isMe ? `${p.name || 'Anda'} (Anda)` : p.name}</strong>
      <span>
        {dept?.short} · {doing}
      </span>
    </div>
  );
}

export function StaffAvatar({ walker }) {
  const p = walker.profile;
  const isMe = walker.id === 'me';
  const g = useRef();
  const body = useRef();
  const head = useRef();
  const al = useRef();
  const ar = useRef();
  const ll = useRef();
  const lr = useRef();
  const wings = useRef();
  const wl = useRef();
  const wr = useRef();
  const [hover, setHover] = useState(false);
  const [, force] = useState(0);
  const tagTick = useRef(0);
  const mats = useMemo(
    () => ({ skin: std(p.skin), hair: std(p.hairColor), outfit: std(p.outfitColor), badge: std(DEPTS[p.dept]?.color || '#F5B700') }),
    [p.skin, p.hairColor, p.outfitColor, p.dept],
  );

  useFrame((st, dt) => {
    if (!g.current) return;
    g.current.position.copy(walker.pos);
    let d = walker.facing - g.current.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.current.rotation.y += d * Math.min(1, dt * 8);
    const s = poseState(walker.pose, st.clock.elapsedTime + walker.t0);
    body.current.position.set(s.x, s.y, 0);
    body.current.rotation.z = s.rz;
    body.current.scale.setScalar(s.scale);
    head.current.rotation.z = s.headZ;
    al.current.rotation.set(s.aLx, 0, s.aL);
    ar.current.rotation.set(s.aRx, 0, s.aR);
    ll.current.rotation.x = s.lL;
    lr.current.rotation.x = s.lR;
    wings.current.visible = s.wings;
    if (s.wings) {
      wl.current.rotation.z = -(0.45 + s.flap);
      wr.current.rotation.z = 0.45 + s.flap;
    }
    // label status diperbarui pelan saja supaya tidak re-render tiap frame
    tagTick.current += dt;
    if ((hover || isMe) && tagTick.current > 0.3) {
      tagTick.current = 0;
      force((n) => n + 1);
    }
  });

  return (
    <group
      ref={g}
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
      <group ref={body}>
        {/* kaki */}
        <group ref={ll} position={[-0.11, 0.22, 0]}>
          <Cyl p={[0, -0.11, 0]} a={[0.075, 0.075, 0.22, 6]} m={M.graphite} />
          <Sph p={[0, -0.2, 0.05]} rad={0.09} sc={[1, 0.6, 1.3]} m={M.brown} seg={[8, 6]} />
        </group>
        <group ref={lr} position={[0.11, 0.22, 0]}>
          <Cyl p={[0, -0.11, 0]} a={[0.075, 0.075, 0.22, 6]} m={M.graphite} />
          <Sph p={[0, -0.2, 0.05]} rad={0.09} sc={[1, 0.6, 1.3]} m={M.brown} seg={[8, 6]} />
        </group>
        {/* badan */}
        <mesh position={[0, 0.55, 0]} material={mats.outfit} castShadow>
          <capsuleGeometry args={[0.28, 0.3, 4, 12]} />
        </mesh>
        <Outfit type={p.outfit} />
        <Box p={[0.15, 0.68, 0.25]} r={[-0.2, 0, 0]} s={[0.12, 0.07, 0.02]} m={mats.badge} shadow={false} />
        {/* tangan */}
        <group ref={al} position={[-0.31, 0.74, 0]}>
          <mesh position={[0, -0.15, 0]} material={mats.outfit} castShadow>
            <capsuleGeometry args={[0.075, 0.2, 3, 8]} />
          </mesh>
          <Sph p={[0, -0.32, 0]} rad={0.075} m={mats.skin} seg={[8, 6]} />
          {p.tattoo === 'arm' && (
            <mesh position={[-0.07, -0.13, 0]} rotation={[0, 0, Math.PI / 2]} material={M.brown}>
              <torusGeometry args={[0.035, 0.008, 4, 6]} />
            </mesh>
          )}
        </group>
        <group ref={ar} position={[0.31, 0.74, 0]}>
          <mesh position={[0, -0.15, 0]} material={mats.outfit} castShadow>
            <capsuleGeometry args={[0.075, 0.2, 3, 8]} />
          </mesh>
          <Sph p={[0, -0.32, 0]} rad={0.075} m={mats.skin} seg={[8, 6]} />
        </group>
        {/* sayap kostum, hanya saat Pargoy Lebah */}
        <group ref={wings} position={[0, 0.78, -0.26]} visible={false}>
          <group ref={wl} position={[-0.12, 0, 0]} rotation={[0, 0.35, 0]}>
            <mesh position={[-0.3, 0.08, 0]} scale={[0.36, 0.05, 0.2]} material={M.wing}>
              <sphereGeometry args={[1, 12, 8]} />
            </mesh>
          </group>
          <group ref={wr} position={[0.12, 0, 0]} rotation={[0, -0.35, 0]}>
            <mesh position={[0.3, 0.08, 0]} scale={[0.36, 0.05, 0.2]} material={M.wing}>
              <sphereGeometry args={[1, 12, 8]} />
            </mesh>
          </group>
        </group>
        {/* kepala */}
        <group ref={head} position={[0, 1.12, 0]}>
          <Sph rad={0.4} m={mats.skin} seg={[16, 12]} />
          <Hair type={p.hair} mat={mats.hair} />
          <Face expr={p.expr} />
          {p.tattoo === 'cheek' && (
            <mesh position={[0.25, -0.12, 0.31]} rotation={[0, 0.6, 0]} material={M.brown}>
              <torusGeometry args={[0.035, 0.008, 4, 6]} />
            </mesh>
          )}
          <HeadAccessory acc={p.acc} />
        </group>
      </group>
      {(hover || (isMe && walker.state === 'dance')) && (
        <Html position={[0, 2.05, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <StatusTag walker={walker} isMe={isMe} />
        </Html>
      )}
    </group>
  );
}

export function OutdoorStaff() {
  useHive((s) => s.outdoorVersion); // render ulang saat daftar/profil staff berubah
  return outdoor.walkers.map((w) => <StaffAvatar key={`${w.id}-${JSON.stringify(w.profile)}`} walker={w} />);
}
