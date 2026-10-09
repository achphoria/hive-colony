import { OrbitControls, Sparkles } from '@react-three/drei';
import { ROOM_LIST } from '../data/hive';
import { Room } from './Room';
import { Simulation, Agents, Island, Lift, Effects, CameraRig } from './World';

export function Scene() {
  return (
    <>
      <color attach="background" args={['#FFF1D0']} />
      <fog attach="fog" args={['#FFF1D0', 95, 200]} />
      <hemisphereLight args={['#FFF8E7', '#C98A00', 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight
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
        shadow-camera-far={130}
        shadow-bias={-0.0006}
      />
      <Simulation />
      <Island />
      {ROOM_LIST.map((r) => (
        <Room key={r.id} room={r} />
      ))}
      <Lift />
      <Agents />
      <Effects />
      <Sparkles count={70} scale={[54, 28, 54]} position={[0, 9, 0]} size={5} color="#FFC93C" speed={0.35} opacity={0.8} />
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
