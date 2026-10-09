import { OrbitControls } from '@react-three/drei';
import { ROOM_LIST } from '../data/hive';
import { Room } from './Room';
import { Simulation, Agents, Island, Lift, Effects, CameraRig } from './World';
import { DayNight, BuzzBridge } from './DayNight';

export function Scene() {
  return (
    <>
      <fog attach="fog" args={['#FFF1D0', 95, 200]} />
      <DayNight />
      <BuzzBridge />
      <Simulation />
      <Island />
      {ROOM_LIST.map((r) => (
        <Room key={r.id} room={r} />
      ))}
      <Lift />
      <Agents />
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
      <CameraRig />
    </>
  );
}
