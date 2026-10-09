import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { HUD } from './ui/HUD';
import { useHive } from './sim/store';

export function App() {
  return (
    <div className="app">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [40, 34, 48], fov: 35, near: 0.1, far: 500 }}
        onPointerMissed={() => useHive.getState().clearSelection()}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <HUD />
    </div>
  );
}
