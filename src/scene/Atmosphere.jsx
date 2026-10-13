// Suasana diorama: kubah langit bergradasi (warnanya diatur siklus siang-malam) dan lautan
// awan empuk di bawah & sekeliling pulau melayang. Awan = ratusan gumpalan dalam satu
// InstancedMesh supaya ringan.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { M } from './materials';

export const skyUniforms = {
  top: { value: new THREE.Color('#F9C58C') },
  bottom: { value: new THREE.Color('#FFEBD0') },
};

export function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: skyUniforms,
        vertexShader: `varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
          void main(){ float h = smoothstep(-0.15, 0.65, vPos.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[420, 32, 16]} />
    </mesh>
  );
}

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// gumpalan awan: [x, y, z, skala]
function buildClouds() {
  const r = rng(42);
  const puffs = [];
  const cluster = (cx, cy, cz, size, n) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * size * 1.4;
      puffs.push([cx + Math.cos(a) * d, cy + r() * size * 0.5, cz + Math.sin(a) * d * 0.7, size * (0.55 + r() * 0.6)]);
    }
  };
  // lautan awan di bawah pulau (menutupi dasar batu)
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.2;
    const rad = 16 + r() * 34;
    cluster(Math.cos(a) * rad, -11 - r() * 4, Math.sin(a) * rad, 4 + r() * 4, 6);
  }
  // cincin awan di kejauhan, setinggi pulau
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + r() * 0.15;
    const rad = 62 + r() * 30;
    cluster(Math.cos(a) * rad, -6 + r() * 10, Math.sin(a) * rad, 6 + r() * 6, 7);
  }
  return puffs;
}

export function CloudSea() {
  const ref = useRef();
  const puffs = useMemo(buildClouds, []);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    puffs.forEach(([x, y, z, s], i) => {
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * 0.62, s));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [puffs]);
  // awan berputar sangat pelan mengelilingi pulau
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.004;
  });
  return <instancedMesh ref={ref} args={[geo, M.cloud, puffs.length]} receiveShadow={false} castShadow={false} />;
}
