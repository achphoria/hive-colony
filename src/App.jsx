import { Suspense, lazy, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { HUD, useAutoSound } from './ui/HUD';
import { HallView } from './ui/HallView';
import { AvatarCreator } from './ui/AvatarCreator';
import { LoginPage, JoinPage, InvitePage } from './ui/AuthPages';
import { useRoute } from './ui/nav';
import { useHive } from './sim/store';
import { useAuth, toAvatarProfile } from './sim/auth';
import { startLoop } from './sim/loop';
import { setRealMode } from './sim/engine';
import { checkAi } from './hall/queenBea';
import { upsertWalker, removeWalker } from './sim/outdoor';
import { startPresence, stopPresence } from './sim/presence';
import { startHallSync, stopHallSync } from './sim/hallSync';
import { DEMO_STAFF, loadProfile } from './data/staff';

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

// Login: staff sungguhan menggantikan staff contoh, presence & data Hive Hall tersambung ke Supabase.
// Tanpa login: mode demo lokal seperti sebelumnya.
function useColonyMode() {
  const account = useAuth((s) => s.account);
  const uid = useAuth((s) => s.session?.user?.id);
  useEffect(() => {
    setRealMode(!!(account && uid)); // login = mode real; pengunjung tanpa login = simulasi demo
    if (account && uid) {
      DEMO_STAFF.forEach((s) => removeWalker(s.id));
      startPresence(uid, toAvatarProfile(account));
      startHallSync();
    } else {
      stopPresence();
      stopHallSync();
      DEMO_STAFF.forEach(upsertWalker);
      const local = loadProfile();
      useHive.getState().setProfile(local);
      if (local) upsertWalker(local);
      else removeWalker('me');
    }
    checkAi();
    useHive.getState().bumpOutdoor();
    // profil avatar dikirim ulang lewat presence saat akun diperbarui
  }, [account, uid]);
}

// pratinjau karakter, hanya saat pengembangan (dibuang dari build publik)
const QueenPreview = import.meta.env.DEV ? lazy(() => import('./scene/QueenPreview')) : null;

export function App() {
  const route = useRoute();
  useAutoSound();
  useColonyMode();

  useEffect(() => {
    startLoop();
    useAuth.getState().init();
  }, []);

  if (QueenPreview && route === '/queen')
    return (
      <Suspense fallback={null}>
        <QueenPreview />
      </Suspense>
    );
  if (route === '/hall') return <HallView />;
  if (route === '/avatar') return <AvatarCreator />;
  if (route === '/login') return <LoginPage />;
  if (route === '/join') return <JoinPage />;
  if (route === '/undang') return <InvitePage />;
  return <Tower />;
}
