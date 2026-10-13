// "Look" sinematik bersama untuk koloni & Hive Hall: lingkungan cahaya hangat (pantulan emas),
// glow pada benda yang menyala (bloom), bayangan sudut lembut (AO), dan vignette tipis.
// Semua dibuat lokal (Lightformer), tanpa mengunduh peta HDR dari internet.
// Kualitas otomatis: penuh di laptop/TV, ringan di HP.
import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

const isLowEnd = () =>
  typeof window !== 'undefined' && (window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches);

export function useQuality() {
  const [q, setQ] = useState(() => (isLowEnd() ? 'low' : 'high'));
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const on = () => setQ(isLowEnd() ? 'low' : 'high');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return q;
}

// Lingkungan studio hangat: langit krem keemasan + "jendela" cahaya untuk kilau logam
export function WarmEnvironment({ intensity = 0.9 }) {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={intensity}>
      <color attach="background" args={['#FFE2B0']} />
      <Lightformer form="rect" intensity={2.4} color="#FFF4DC" position={[0, 6, -8]} scale={[16, 6, 1]} />
      <Lightformer form="rect" intensity={1.6} color="#FFC56B" position={[-9, 3, 4]} rotation-y={Math.PI / 2} scale={[10, 5, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#FFB04A" position={[9, 2, 4]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
      <Lightformer form="ring" intensity={3} color="#FFE7B8" position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={6} />
      <Lightformer form="rect" intensity={0.6} color="#B97A1E" position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} />
    </Environment>
  );
}

// Efek layar. bloomIntensity bisa dinaikkan saat malam (dari komponen siang-malam).
export function LookFX({ quality = 'high', bloom = 0.65, threshold = 0.82, ao = true, aoRadius = 1.6 }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = 0.95;
  }, [gl]);
  const high = quality === 'high';
  const effects = [
    high && ao && <N8AO key="ao" aoRadius={aoRadius} intensity={1.6} distanceFalloff={0.6} color="#5A3A10" halfRes />,
    <Bloom key="bloom" mipmapBlur intensity={bloom} luminanceThreshold={threshold} luminanceSmoothing={0.25} radius={0.72} />,
    <ToneMapping key="tone" mode={ToneMappingMode.NEUTRAL} />,
    <Vignette key="vig" offset={0.32} darkness={0.42} />,
  ].filter(Boolean);
  return (
    <EffectComposer multisampling={high ? 4 : 0} disableNormalPass>
      {effects}
    </EffectComposer>
  );
}
