import { Suspense, lazy, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { HUD, useAutoSound } from './ui/HUD';
import { HallView } from './ui/HallView';
import { TvOverlay } from './ui/TvOverlay';
import { AgentWorkspace } from './ui/AgentWorkspace';
import { AccessPage } from './ui/AccessPage';
import { startAgentWatch, stopAgentWatch } from './hall/agentApi';
import { AvatarCreator } from './ui/AvatarCreator';
import { LoginPage, JoinPage, InvitePage } from './ui/AuthPages';
import { useRoute } from './ui/nav';
import { useHive } from './sim/store';
import { useAuth, toAvatarProfile } from './sim/auth';
import { startLoop } from './sim/loop';
import { setRealMode } from './sim/engine';
import { checkAi } from './hall/queenBea';
import { removeWalker } from './sim/outdoor';
import { startPresence, stopPresence } from './sim/presence';
import { startHallSync, stopHallSync } from './sim/hallSync';
import { PerformanceMonitor } from '@react-three/drei';

// Resolusi render menyesuaikan kemampuan perangkat: turun otomatis kalau frame mulai tersendat.
const MAX_DPR = Math.min(1.5, window.devicePixelRatio || 1);

function Tower({ tv = false }) {
  const [dpr, setDpr] = useState(MAX_DPR);
  return (
    <div className="app">
      <Canvas
        shadows
        dpr={dpr}
        gl={{ powerPreference: 'high-performance', antialias: false, stencil: false }}
        camera={{ position: [40, 34, 48], fov: 35, near: 0.1, far: 500 }}
        onPointerMissed={() => useHive.getState().clearSelection()}
      >
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(0.75, Math.round((d - 0.25) * 100) / 100))}
          onIncline={() => setDpr((d) => Math.min(MAX_DPR, Math.round((d + 0.25) * 100) / 100))}
          flipflops={3}
          onFallback={() => setDpr(0.75)}
        />
        <Suspense fallback={null}>
          <Scene tv={tv} />
        </Suspense>
      </Canvas>
      {tv ? <TvOverlay /> : <HUD />}
    </div>
  );
}

// Koloni hanya untuk staff yang login (tanpa mode demo): presence & data Hive Hall tersambung ke Supabase.
function useColonyMode() {
  const account = useAuth((s) => s.account);
  const uid = useAuth((s) => s.session?.user?.id);
  useEffect(() => {
    setRealMode(true);
    if (account && uid) {
      startPresence(uid, toAvatarProfile(account));
      startHallSync();
    } else {
      stopPresence();
      stopHallSync();
      useHive.getState().setProfile(null);
      removeWalker('me');
    }
    checkAi();
    // status server agent (n8n) & akses saya ke agent
    if (account && uid) startAgentWatch();
    else stopAgentWatch();
    useHive.getState().bumpOutdoor();
    // profil avatar dikirim ulang lewat presence saat akun diperbarui
  }, [account, uid]);
}

// pratinjau karakter, hanya saat pengembangan (dibuang dari build publik)
const QueenPreview = import.meta.env.DEV ? lazy(() => import('./scene/QueenPreview')) : null;

function Splash() {
  return (
    <div className="page auth-page">
      <div className="splash">
        <span className="splash-hex" aria-hidden="true" />
        Memuat Hive Colony…
      </div>
    </div>
  );
}

export function App() {
  const route = useRoute();
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const account = useAuth((s) => s.account);
  const needsInvite = useAuth((s) => s.needsInvite);
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
  // wajib login: tanpa sesi hanya halaman masuk & daftar dengan kode undangan
  if (route === '/join') return <JoinPage />;
  if (!ready) return <Splash />;
  if (!session) return <LoginPage />;
  if (!account) return needsInvite ? <JoinPage /> : <Splash />;
  if (route === '/tv') return <Tower tv />;
  if (route === '/agent' || route.startsWith('/agent/')) return <AgentWorkspace agentId={route.split('/')[2] || 'ceo'} />;
  if (route === '/akses') return <AccessPage />;
  if (route === '/hall') return <HallView />;
  if (route === '/avatar') return <AvatarCreator />;
  if (route === '/login') return <LoginPage />;
  if (route === '/undang') return <InvitePage />;
  return <Tower />;
}
