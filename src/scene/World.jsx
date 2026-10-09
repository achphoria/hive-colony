// Komponen dunia: simulasi, pulau, lift madu, efek misi, dan kamera.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { AGENTS, LIFT_X, tierY, tierOf } from '../data/hive';
import { useHive } from '../sim/store';
import { update, world } from '../sim/engine';
import { M, Box, Cyl, Hex, Sph, Cone, HEX_START } from './materials';
import { HiveWorker } from './HiveWorker';

export function Simulation() {
  useFrame((_, dt) => update(dt));
  return null;
}

export function Agents() {
  return AGENTS.map((def) => <HiveWorker key={def.id} def={def} />);
}

/* ---------- pulau dasar ---------- */

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function Tree({ p, s = 1 }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 0.6, 0]} a={[0.15, 0.22, 1.2, 6]} m={M.wood} />
      <Cone p={[0, 1.7, 0]} a={[1, 1.6, 7]} m={M.leaf} />
      <Cone p={[0, 2.5, 0]} a={[0.7, 1.2, 7]} m={M.leafDark} />
    </group>
  );
}

export function Island() {
  const rnd = seeded(7);
  const trees = [];
  const flowers = [];
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 19 + rnd() * 5;
    trees.push(<Tree key={i} p={[r * Math.cos(a), -2.2, r * Math.sin(a)]} s={0.8 + rnd() * 0.6} />);
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 15 + rnd() * 10;
    const m = [M.white, M.pink, M.nectar, M.amber][i % 4];
    flowers.push(<Sph key={i} p={[r * Math.cos(a), -2.05, r * Math.sin(a)]} rad={0.18} m={m} seg={[6, 4]} />);
  }
  return (
    <group>
      <mesh position={[0, -2.35, 0]} receiveShadow>
        <cylinderGeometry args={[27, 27, 0.3, 6, 1, false, HEX_START]} />
        <primitive object={M.grass} attach="material" />
      </mesh>
      <mesh position={[0, -4.3, 0]} material={M.earth} receiveShadow>
        <cylinderGeometry args={[26.6, 20, 3.6, 6, 1, false, HEX_START]} />
      </mesh>
      <mesh position={[0, -7.3, 0]} rotation={[Math.PI, 0, 0]} material={M.earthDark}>
        <coneGeometry args={[20, 6, 6, 1, false, HEX_START]} />
      </mesh>
      {/* kolam madu */}
      <Hex p={[-15, -2.17, 11]} rad={3.2} h={0.06} m={M.honey} shadow={false} />
      <Hex p={[-15, -2.19, 11]} rad={3.6} h={0.05} m={M.royal} shadow={false} />
      {/* jalan setapak menuju lobby */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Hex key={i} p={[0, -2.18, 14 + i * 2.2]} rad={0.8} h={0.06} m={M.stone} shadow={false} />
      ))}
      {trees}
      {flowers}
    </group>
  );
}

/* ---------- lift madu ---------- */

export function Lift() {
  const cab = useRef();
  const top = tierY(2) + 5.5;
  const bottom = -2.2;
  const h = top - bottom;
  useFrame((st) => {
    if (cab.current) cab.current.position.y = 6.5 + Math.sin(st.clock.elapsedTime * 0.5) * 7.5;
  });
  return (
    <group position={[LIFT_X, 0, 0]}>
      <mesh position={[0, (top + bottom) / 2, 0]} material={M.glass}>
        <cylinderGeometry args={[1.3, 1.3, h, 6, 1, true, HEX_START]} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i * Math.PI) / 3;
        return <Cyl key={i} p={[1.3 * Math.cos(a), (top + bottom) / 2, 1.3 * Math.sin(a)]} a={[0.06, 0.06, h, 5]} m={M.gold} />;
      })}
      {[0, 1, 2].map((t) => (
        <group key={t} position={[0, tierY(t), 0]}>
          <Hex p={[0, -0.15, 0]} rad={1.75} h={0.3} m={M.royal} />
          <Hex p={[0, 0.02, 0]} rad={1.4} h={0.04} m={M.led} shadow={false} />
          <Box p={[-2.3, -0.15, 0]} s={[1.8, 0.2, 1.2]} m={M.gold} />
        </group>
      ))}
      <Hex p={[0, top + 0.15, 0]} rad={1.6} h={0.3} m={M.gold} />
      <Cone p={[0, top + 0.8, 0]} a={[1.2, 1, 6]} m={M.royal} />
      <Sph p={[0, top + 1.45, 0]} rad={0.25} m={M.led} />
      <group ref={cab}>
        <Hex rad={0.9} h={0.12} m={M.honey} shadow={false} />
      </group>
    </group>
  );
}

/* ---------- efek misi: tetes madu & percikan ---------- */

const bez = new THREE.Vector3();
export function Effects() {
  const drops = useRef([]);
  const bursts = useRef([]);
  useFrame(() => {
    const floor = useHive.getState().floor;
    const show = (y) => floor === 'all' || tierOf(y) <= floor;
    const ds = world.effects.filter((e) => e.type === 'drop');
    drops.current.forEach((m, i) => {
      if (!m) return;
      const e = ds[i];
      if (!e) {
        m.visible = false;
        return;
      }
      const k = Math.min(1, e.t / e.dur);
      const ctrl = e.from.clone().add(e.to).multiplyScalar(0.5);
      ctrl.y = Math.max(e.from.y, e.to.y) + 6;
      const u = 1 - k;
      bez.set(0, 0, 0)
        .addScaledVector(e.from, u * u)
        .addScaledVector(ctrl, 2 * u * k)
        .addScaledVector(e.to, k * k);
      m.position.copy(bez);
      m.scale.set(1, 1 + Math.sin(k * Math.PI) * 0.4, 1);
      m.visible = show(bez.y);
    });
    const bs = world.effects.filter((e) => e.type === 'burst');
    bursts.current.forEach((grp, i) => {
      if (!grp) return;
      const e = bs[i];
      if (!e) {
        grp.visible = false;
        return;
      }
      const k = e.t / e.dur;
      grp.visible = show(e.at.y);
      grp.position.copy(e.at);
      grp.children.forEach((c, j) => {
        const d = e.dirs[j];
        c.position.set(d.x * k * 2.6, d.y * k * 3 - 3 * k * k, d.z * k * 2.6);
        c.scale.setScalar(Math.max(0.01, 1 - k));
        c.rotation.y = k * 6;
      });
    });
  });
  return (
    <group>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} ref={(el) => (drops.current[i] = el)} visible={false} material={M.honey}>
          <sphereGeometry args={[0.34, 14, 10]} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} ref={(el) => (bursts.current[i] = el)} visible={false}>
          {Array.from({ length: 14 }, (_, j) => (
            <mesh key={j} material={j % 2 ? M.led : M.honey}>
              <cylinderGeometry args={[0.16, 0.16, 0.08, 6]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ---------- kamera ---------- */

export function CameraRig() {
  const { camera, controls } = useThree();
  const focus = useHive((s) => s.focus);
  const anim = useRef(null);

  useEffect(() => {
    anim.current = {
      target: new THREE.Vector3(...focus.target),
      dist: focus.dist,
      dir: focus.dir ? new THREE.Vector3(...focus.dir).normalize() : null,
      t: 0,
    };
  }, [focus.key]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (anim.current = null);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, dt) => {
    if (!controls || !anim.current) return;
    const k = 1 - Math.exp(-dt * 3.2);
    controls.target.lerp(anim.current.target, k);
    if (anim.current.dir) {
      const goal = anim.current.target.clone().addScaledVector(anim.current.dir, anim.current.dist);
      camera.position.lerp(goal, k);
    } else {
      const dir = camera.position.clone().sub(controls.target);
      const d = dir.length();
      dir.normalize();
      camera.position.copy(controls.target).addScaledVector(dir, d + (anim.current.dist - d) * k);
    }
    anim.current.t += dt;
    if (anim.current.t > 2.5) anim.current = null;
    controls.update();
  });
  return null;
}
