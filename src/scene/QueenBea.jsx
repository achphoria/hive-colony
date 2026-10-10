// Queen Bea: ratu koloni. Lebih tinggi dan anggun dari Hive Worker biasa — wajah humanoid,
// rambut emas bersanggul, mahkota bertatah mutiara & permata madu, gaun bergaris lebah,
// jubah kerajaan berbulu putih, kerah renda, kalung, tongkat kerajaan, dan empat sayap.
// Dipakai di gedung koloni (HiveWorker) dan di Hive Hall (BeeFigure).
// Ref animasi (kepala, sayap, lengan, mata) dipegang komponen induk.
import * as THREE from 'three';
import { M, std, Box, Cyl, Sph, Cone } from './materials';

const Q = {
  gold: std('#F5B700', { metalness: 0.55, roughness: 0.3 }),
  goldDeep: std('#C98A00', { metalness: 0.6, roughness: 0.32 }),
  velvet: std('#A4470F', { roughness: 0.85 }),
  velvetIn: std('#7A3209', { roughness: 0.9, side: THREE.DoubleSide }),
  ermine: std('#FFFDF7', { roughness: 0.95 }),
  stripe: std('#3A2A12'),
  gown: std('#FFC93C', { roughness: 0.55 }),
  pearl: std('#FFFFFF', { metalness: 0.2, roughness: 0.15, emissive: '#FFF1CC', emissiveIntensity: 0.25 }),
  gem: std('#FF9E1A', { emissive: '#FF8C1A', emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.2 }),
  ruby: std('#E24B4A', { emissive: '#C2302F', emissiveIntensity: 0.5, roughness: 0.2 }),
  skin: std('#FFE3C6'),
  hair: std('#E8A93A', { roughness: 0.5 }),
  hairShade: std('#C98522', { roughness: 0.55 }),
  iris: std('#B86A00'),
  lips: std('#E2735F'),
  glove: std('#FFFDF7'),
  lace: new THREE.MeshStandardMaterial({ color: '#FFF8E7', transparent: true, opacity: 0.82, roughness: 0.6, side: THREE.DoubleSide }),
  wing: new THREE.MeshStandardMaterial({
    color: '#FFF4D6',
    emissive: '#FFD27A',
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.62,
    roughness: 0.1,
    metalness: 0.3,
    side: THREE.DoubleSide,
  }),
};

function Wing({ side, big }) {
  const s = big ? [0.5, 0.05, 0.26] : [0.32, 0.04, 0.17];
  return (
    <group rotation={[0, 0, side * (big ? 0.15 : -0.35)]}>
      <mesh position={[side * s[0] * 0.85, big ? 0.12 : -0.05, 0]} scale={s} material={Q.wing}>
        <sphereGeometry args={[1, 14, 8]} />
      </mesh>
      {/* tulang sayap emas */}
      <mesh position={[side * s[0] * 0.85, big ? 0.12 : -0.05, 0]} scale={[s[0], 0.012, s[2]]} material={Q.goldDeep}>
        <torusGeometry args={[0.98, 0.03, 4, 24]} />
      </mesh>
    </group>
  );
}

function Crown() {
  const points = 7;
  return (
    <group position={[0, 0.33, 0.0]} rotation={[-0.16, 0, 0]} scale={0.92}>
      {/* lingkar mahkota */}
      <mesh material={Q.gold} castShadow>
        <cylinderGeometry args={[0.23, 0.26, 0.13, 20, 1, true]} />
      </mesh>
      <mesh position={[0, -0.065, 0]} rotation={[Math.PI / 2, 0, 0]} material={Q.goldDeep}>
        <torusGeometry args={[0.26, 0.025, 6, 24]} />
      </mesh>
      {/* puncak bermutiara, yang tengah paling tinggi */}
      {Array.from({ length: points }, (_, i) => {
        const a = (i / points) * Math.PI * 2 + Math.PI / 2;
        const front = Math.abs(Math.sin((a - Math.PI / 2) / 2)) < 0.25;
        const h = front ? 0.26 : 0.17;
        return (
          <group key={i} position={[0.235 * Math.cos(a), 0.06 + h / 2, 0.235 * Math.sin(a)]}>
            <Cone a={[0.055, h, 4]} m={Q.gold} />
            <Sph p={[0, h / 2 + 0.03, 0]} rad={0.035} m={Q.pearl} seg={[8, 6]} />
          </group>
        );
      })}
      {/* permata di lingkar */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        return <Sph key={i} p={[0.255 * Math.cos(a), 0, 0.255 * Math.sin(a)]} rad={0.028} m={i % 2 ? Q.ruby : Q.gem} seg={[6, 5]} shadow={false} />;
      })}
      {/* permata madu heksagonal di depan */}
      <mesh position={[0, 0.02, 0.265]} rotation={[Math.PI / 2, 0, 0]} material={Q.gem}>
        <cylinderGeometry args={[0.065, 0.065, 0.04, 6]} />
      </mesh>
    </group>
  );
}

function Scepter() {
  return (
    <group position={[0.05, -0.38, 0.06]} rotation={[0.1, 0, -0.22]}>
      <Cyl p={[0, 0.12, 0]} a={[0.022, 0.026, 0.95, 8]} m={Q.goldDeep} />
      <mesh position={[0, 0.62, 0]} material={Q.gem}>
        <cylinderGeometry args={[0.08, 0.08, 0.12, 6]} />
      </mesh>
      <mesh position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]} material={Q.gold}>
        <torusGeometry args={[0.095, 0.018, 6, 6]} />
      </mesh>
      <Cone p={[0, 0.74, 0]} a={[0.04, 0.12, 4]} m={Q.gold} />
      <Sph p={[0, 0.81, 0]} rad={0.028} m={Q.pearl} seg={[8, 6]} />
    </group>
  );
}

// Tubuh lengkap Queen Bea. refs: { head, wl, wr, al, ar, eyes }
export function QueenModel({ refs, sleepy = false, thinking = false }) {
  const eyeScale = thinking ? [1, 0.3, 1] : [1, 1, 1];
  return (
    <group scale={1.08}>
      {/* sepatu emas & kaki */}
      {[-0.1, 0.1].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0.12, 0]} a={[0.055, 0.06, 0.22, 8]} m={Q.ermine} />
          <Sph p={[x, 0.035, 0.05]} rad={0.075} sc={[1, 0.55, 1.4]} m={Q.gold} seg={[8, 6]} />
        </group>
      ))}

      {/* gaun mengembang bergaris lebah */}
      <Cyl p={[0, 0.42, 0]} a={[0.25, 0.46, 0.5, 18]} m={Q.gown} />
      <Cyl p={[0, 0.3, 0]} a={[0.385, 0.42, 0.07, 18]} m={Q.stripe} />
      <Cyl p={[0, 0.47, 0]} a={[0.31, 0.34, 0.06, 18]} m={Q.stripe} />
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} material={Q.ermine}>
        <torusGeometry args={[0.46, 0.045, 6, 22]} />
      </mesh>
      {/* korset & ikat pinggang permata */}
      <mesh position={[0, 0.78, 0]} material={Q.gown} castShadow>
        <capsuleGeometry args={[0.22, 0.22, 4, 14]} />
      </mesh>
      <Cyl p={[0, 0.66, 0]} a={[0.235, 0.24, 0.06, 16]} m={Q.goldDeep} />
      <mesh position={[0, 0.66, 0.235]} rotation={[Math.PI / 2, 0, 0]} material={Q.gem}>
        <cylinderGeometry args={[0.045, 0.045, 0.03, 6]} />
      </mesh>
      {[0.74, 0.82, 0.9].map((y) => (
        <Box key={y} p={[0, y, 0.215]} s={[0.1, 0.015, 0.02]} m={Q.ermine} shadow={false} />
      ))}
      {/* kalung & liontin */}
      <mesh position={[0, 1.0, 0.03]} rotation={[Math.PI / 2 - 0.25, 0, 0]} material={Q.gold}>
        <torusGeometry args={[0.17, 0.018, 6, 20]} />
      </mesh>
      <mesh position={[0, 0.9, 0.2]} rotation={[Math.PI / 2, 0, 0]} material={Q.gem}>
        <cylinderGeometry args={[0.04, 0.04, 0.025, 6]} />
      </mesh>

      {/* jubah kerajaan dengan pinggiran bulu putih */}
      <group position={[0, 0, -0.04]}>
        <mesh position={[0, 0.55, -0.02]} rotation={[0, Math.PI, 0]} material={Q.velvetIn}>
          <cylinderGeometry args={[0.3, 0.55, 1.0, 18, 1, true, -Math.PI / 2 - 0.2, Math.PI + 0.4]} />
        </mesh>
        <mesh position={[0, 0.55, -0.03]} rotation={[0, Math.PI, 0]} material={Q.velvet} castShadow>
          <cylinderGeometry args={[0.31, 0.56, 1.0, 18, 1, true, -Math.PI / 2 - 0.2, Math.PI + 0.4]} />
        </mesh>
        <mesh position={[0, 0.06, -0.03]} rotation={[Math.PI / 2, 0, Math.PI]} material={Q.ermine}>
          <torusGeometry args={[0.56, 0.05, 6, 20, Math.PI + 0.4]} />
        </mesh>
        {/* bulu di bahu dengan titik khas */}
        <mesh position={[0, 1.02, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={Q.ermine}>
          <torusGeometry args={[0.27, 0.075, 8, 20]} />
        </mesh>
        {[-0.2, -0.07, 0.07, 0.2].map((x) => (
          <Sph key={x} p={[x, 1.07, 0.18 - Math.abs(x) * 0.4]} rad={0.018} m={Q.stripe} seg={[5, 4]} shadow={false} />
        ))}
      </group>

      {/* kerah renda tinggi di belakang kepala */}
      <mesh position={[0, 1.22, -0.2]} rotation={[-0.35, 0, 0]} material={Q.lace}>
        <circleGeometry args={[0.42, 18, 0, Math.PI]} />
      </mesh>

      {/* lengan: bahu menggembung, sarung tangan putih; tangan kanan memegang tongkat */}
      <group ref={refs.al} position={[-0.27, 0.92, 0]}>
        <Sph p={[0, 0, 0]} rad={0.11} m={Q.gown} seg={[10, 8]} />
        <mesh position={[0, -0.18, 0]} material={Q.glove} castShadow>
          <capsuleGeometry args={[0.055, 0.2, 3, 8]} />
        </mesh>
        <Sph p={[0, -0.34, 0]} rad={0.06} m={Q.glove} seg={[8, 6]} />
      </group>
      <group ref={refs.ar} position={[0.27, 0.92, 0]}>
        <Sph p={[0, 0, 0]} rad={0.11} m={Q.gown} seg={[10, 8]} />
        <mesh position={[0, -0.18, 0]} material={Q.glove} castShadow>
          <capsuleGeometry args={[0.055, 0.2, 3, 8]} />
        </mesh>
        <Sph p={[0, -0.34, 0]} rad={0.06} m={Q.glove} seg={[8, 6]} />
        <Scepter />
      </group>

      {/* empat sayap berkilau */}
      <group ref={refs.wl} position={[-0.12, 1.0, -0.26]} rotation={[0, 0.35, 0]}>
        <Wing side={-1} big />
        <Wing side={-1} />
      </group>
      <group ref={refs.wr} position={[0.12, 1.0, -0.26]} rotation={[0, -0.35, 0]}>
        <Wing side={1} big />
        <Wing side={1} />
      </group>

      {/* kepala */}
      <group ref={refs.head} position={[0, 1.36, 0]}>
        {/* rambut belakang panjang + sanggul */}
        <Sph p={[0, 0.02, -0.06]} rad={0.37} sc={[1.05, 1.05, 1]} m={Q.hair} seg={[16, 12]} />
        <mesh position={[0, -0.3, -0.12]} material={Q.hair} castShadow>
          <capsuleGeometry args={[0.24, 0.3, 4, 12]} />
        </mesh>
        <Sph p={[0, 0.3, -0.2]} rad={0.15} m={Q.hairShade} seg={[10, 8]} />
        {/* wajah */}
        <Sph p={[0, -0.03, 0.06]} rad={0.31} sc={[1, 1.05, 1]} m={Q.skin} seg={[18, 14]} />
        {/* poni menyamping */}
        <Sph p={[-0.1, 0.17, 0.14]} rad={0.22} sc={[1.05, 0.42, 0.85]} m={Q.hair} seg={[14, 8]} />
        <Sph p={[0.13, 0.19, 0.12]} rad={0.18} sc={[1, 0.38, 0.85]} m={Q.hair} seg={[12, 8]} />
        {/* helai samping membingkai wajah */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * 0.27, -0.12, 0.1]} rotation={[0, 0, sx * 0.12]} material={Q.hair}>
            <capsuleGeometry args={[0.07, 0.3, 3, 8]} />
          </mesh>
        ))}
        {/* mata besar dengan iris madu, kilau, dan bulu mata */}
        <group ref={refs.eyes} position={[0, -0.04, 0]} scale={sleepy ? [1, 0.12, 1] : eyeScale}>
          {[-0.11, 0.11].map((x) => (
            <group key={x}>
              <Sph p={[x, 0, 0.32]} rad={0.07} sc={[1, 1.15, 0.6]} m={M.white} seg={[10, 8]} shadow={false} />
              <Sph p={[x, -0.005, 0.355]} rad={0.05} sc={[1, 1.12, 0.6]} m={Q.iris} seg={[10, 8]} shadow={false} />
              <Sph p={[x, -0.005, 0.375]} rad={0.027} sc={[1, 1.1, 0.6]} m={M.graphite} seg={[8, 6]} shadow={false} />
              <Sph p={[x + 0.018, 0.025, 0.39]} rad={0.013} m={M.white} seg={[6, 4]} shadow={false} />
            </group>
          ))}
        </group>
        {[-1, 1].map((sx) => (
          <group key={sx}>
            {/* bulu mata lentik */}
            <Box p={[sx * 0.17, 0.035, 0.325]} r={[0, sx * 0.4, sx * 0.55]} s={[0.05, 0.011, 0.015]} m={M.graphite} shadow={false} />
            <Box p={[sx * 0.155, 0.055, 0.33]} r={[0, sx * 0.3, sx * 0.9]} s={[0.04, 0.01, 0.015]} m={M.graphite} shadow={false} />
            {/* alis tipis */}
            <Box p={[sx * 0.115, 0.125, 0.325]} r={[0, sx * 0.25, sx * -0.05]} s={[0.08, 0.014, 0.02]} m={M.honeyDark} shadow={false} />
            {/* pipi merona */}
            <Sph p={[sx * 0.19, -0.12, 0.28]} rad={0.05} sc={[1, 0.55, 0.4]} m={M.pink} seg={[8, 6]} shadow={false} />
          </group>
        ))}
        {/* senyum */}
        <mesh position={[0, -0.155, 0.335]} rotation={[0, 0, Math.PI]} scale={[1, 0.7, 1]} material={Q.lips}>
          <torusGeometry args={[0.035, 0.008, 6, 14, Math.PI]} />
        </mesh>
        {/* antena dengan ujung permata */}
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * 0.12, 0.33, 0.02]} rotation={[0, 0, -sx * 0.45]}>
            <Cyl p={[0, 0.16, 0]} a={[0.014, 0.014, 0.32, 5]} m={Q.goldDeep} />
            <Sph p={[0, 0.34, 0]} rad={0.045} m={Q.gem} seg={[8, 6]} />
          </group>
        ))}
        <Crown />
      </group>
    </group>
  );
}
