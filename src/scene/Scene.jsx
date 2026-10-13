import { OrbitControls } from '@react-three/drei';
import { ROOM_LIST } from '../data/hive';
import { Room } from './Room';
import { Agents, Island, Lift, Effects, CameraRig } from './World';
import { OutdoorStaff } from './StaffAvatar';
import { DayNight, BuzzBridge } from './DayNight';
import { TvDirector } from './TvDirector';
import { SkyDome, CloudSea } from './Atmosphere';
import { WarmEnvironment, LookFX, useQuality } from './Look';

// tv: mode spectator untuk layar besar (kamera dikendalikan TvDirector)
export function Scene({ tv = false }) {
  const quality = useQuality();
  return (
    <>
      <fog attach="fog" args={['#FFEAD0', 90, 260]} />
      <SkyDome />
      <CloudSea />
      <WarmEnvironment intensity={0.42} />
      <LookFX quality={quality} ao aoRadius={2.2} />
      <DayNight />
      <BuzzBridge />
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
      {tv ? <TvDirector /> : <CameraRig />}
    </>
  );
}
