import { OrbitControls } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ROOM_LIST } from '../data/hive';
import { Room } from './Room';
import { Agents, Island, Lift, Effects, CameraRig } from './World';
import { OutdoorStaff } from './StaffAvatar';
import { DayNight } from './DayNight';
import { TvDirector } from './TvDirector';
import { IntroDirector } from './IntroDirector';
import { SkyDome, CloudSea } from './Atmosphere';
import { WarmEnvironment, LookFX, useQuality } from './Look';
import { useSaver } from '../sim/saver';

// pengembangan saja: akses renderer untuk profil performa (tidak ikut build publik)
function DevExpose() {
  const three = useThree();
  if (import.meta.env.DEV) window.__three = three;
  return null;
}

// Peta bayangan diperbarui ~5x per detik (bukan tiap frame): matahari & lebah bergerak pelan,
// jadi hasilnya sama tapi pass bayangan tidak menggambar ulang ratusan objek setiap frame.
function ShadowThrottle({ hz = 5 }) {
  const { gl } = useThree();
  const acc = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current >= 1 / hz) {
      acc.current = 0;
      gl.shadowMap.needsUpdate = true;
    }
  });
  return null;
}

// tv: mode spectator untuk layar besar (kamera dikendalikan TvDirector); intro: video perkenalan (IntroDirector)
export function Scene({ tv = false, intro = false }) {
  const quality = useQuality();
  const saver = useSaver((s) => s.on);
  return (
    <>
      {import.meta.env.DEV && <DevExpose />}
      {!saver && <ShadowThrottle />}
      <fog attach="fog" args={['#FFEAD0', 90, 260]} />
      <SkyDome />
      <CloudSea />
      <WarmEnvironment intensity={0.42} />
      {/* tanpa AO (paling berat) supaya koloni tetap mulus */}
      {!saver && <LookFX quality={quality} ao={false} />}
      <DayNight />
      <Island />
      {ROOM_LIST.map((r) => (
        <Room key={r.id} room={r} />
      ))}
      <Lift />
      <Agents />
      <OutdoorStaff />
      <Effects />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={7}
        maxDistance={120}
        maxPolarAngle={1.4}
        target={[0, 7, 0]}
      />
      {intro ? <IntroDirector /> : tv ? <TvDirector /> : <CameraRig />}
    </>
  );
}
