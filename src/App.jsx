import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { HUD, useAutoSound } from './ui/HUD';
import { HallView } from './ui/HallView';
import { AvatarCreator } from './ui/AvatarCreator';
import { useRoute } from './ui/nav';
import { useHive } from './sim/store';
import { startLoop } from './sim/loop';
import { upsertWalker } from './sim/outdoor';
import { DEMO_STAFF } from './data/staff';

function Tower() {
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

export function App() {
  const route = useRoute();
  useAutoSound();

  useEffect(() => {
    startLoop();
    DEMO_STAFF.forEach(upsertWalker);
    const me = useHive.getState().profile;
    if (me) upsertWalker(me);
    useHive.getState().bumpOutdoor();
  }, []);

  if (route === '/hall') return <HallView />;
  if (route === '/avatar') return <AvatarCreator />;
  return <Tower />;
}
