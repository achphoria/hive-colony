import * as THREE from 'three';

export const std = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0, flatShading: true, ...extra });

export const M = {
  gold: std('#F5B700'),
  amber: std('#FF8C1A'),
  royal: std('#C98A00'),
  nectar: std('#FFC93C'),
  hoodie: std('#FFB020'),
  cream: std('#FFF8E7'),
  creamDark: std('#F3E6C6'),
  silver: std('#C0C5CE', { metalness: 0.35, roughness: 0.4 }),
  graphite: std('#2B2B2E'),
  brown: std('#3A2A12'),
  honeyDark: std('#8A5A00'),
  wood: std('#B9853F'),
  pink: std('#FF9E7A'),
  white: std('#FFFFFF'),
  leaf: std('#8DBF5A'),
  leafDark: std('#6FA043'),
  grass: std('#C2D87A'),
  earth: std('#D9A441'),
  earthDark: std('#B07A22'),
  stone: std('#E8DCC2'),
  screen: std('#FFC93C', { emissive: '#FFB020', emissiveIntensity: 0.6 }),
  led: std('#FFD54A', { emissive: '#FFB020', emissiveIntensity: 1.4 }),
  ledGreen: std('#B6E07A', { emissive: '#8DCB45', emissiveIntensity: 1.2 }),
  honey: std('#FFB020', { emissive: '#FF8C1A', emissiveIntensity: 0.45, roughness: 0.25 }),
  glass: new THREE.MeshStandardMaterial({
    color: '#FFF8E7',
    transparent: true,
    opacity: 0.2,
    roughness: 0.1,
    metalness: 0.1,
    depthWrite: false,
  }),
  holo: new THREE.MeshStandardMaterial({
    color: '#FFC93C',
    emissive: '#FF8C1A',
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  window: std('#FFC93C', { emissive: '#FFB020', emissiveIntensity: 0.1 }),
  zzz: new THREE.MeshBasicMaterial({ color: '#BFD3FF', transparent: true, opacity: 0.9 }),
  doorGlass: new THREE.MeshStandardMaterial({
    color: '#FFC93C',
    transparent: true,
    opacity: 0.38,
    roughness: 0.1,
    metalness: 0.2,
  }),
  wing: new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    transparent: true,
    opacity: 0.75,
    roughness: 0.2,
    side: THREE.DoubleSide,
  }),
};

export const HEX_START = Math.PI / 2; // thetaStart agar heksagon flat-top (titik sudut di +x)

export const Box = ({ p = [0, 0, 0], s = [1, 1, 1], r, m = M.cream, shadow = true }) => (
  <mesh position={p} rotation={r} material={m} castShadow={shadow} receiveShadow>
    <boxGeometry args={s} />
  </mesh>
);

export const Cyl = ({ p = [0, 0, 0], a = [0.5, 0.5, 1, 12], r, m = M.cream, shadow = true }) => (
  <mesh position={p} rotation={r} material={m} castShadow={shadow} receiveShadow>
    <cylinderGeometry args={a} />
  </mesh>
);

export const Hex = ({ p = [0, 0, 0], rad = 0.5, h = 0.1, r, m = M.gold, shadow = true }) => (
  <mesh position={p} rotation={r} material={m} castShadow={shadow} receiveShadow>
    <cylinderGeometry args={[rad, rad, h, 6, 1, false, HEX_START]} />
  </mesh>
);

export const Sph = ({ p = [0, 0, 0], rad = 0.5, sc, m = M.cream, seg = [12, 10], shadow = true }) => (
  <mesh position={p} scale={sc} material={m} castShadow={shadow}>
    <sphereGeometry args={[rad, seg[0], seg[1]]} />
  </mesh>
);

export const Cone = ({ p = [0, 0, 0], a = [0.5, 1, 8], r, m = M.leaf }) => (
  <mesh position={p} rotation={r} material={m} castShadow receiveShadow>
    <coneGeometry args={a} />
  </mesh>
);
