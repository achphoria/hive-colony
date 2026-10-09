import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { ROOM_R, APOTHEM, WALL_H, SEATS_BY_ROOM, DEPTS } from '../data/hive';
import { useHive } from '../sim/store';
import { world } from '../sim/engine';
import { M, std, HEX_START } from './materials';
import {
  DESKS,
  DeptProp,
  LobbySet,
  LoungeSet,
  GymSet,
  HallSet,
  PodsSet,
  ServerSet,
  GardenSet,
  MissionSet,
  RoyalDecor,
} from './Furniture';

const WALL_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => ((30 + 60 * i) * Math.PI) / 180);
const SETS = {
  lobby: LobbySet,
  lounge: LoungeSet,
  gym: GymSet,
  hall: HallSet,
  pods: PodsSet,
  server: ServerSet,
  garden: GardenSet,
  mission: MissionSet,
};

function Gauge({ roomId }) {
  const group = useRef();
  const fill = useRef();
  useFrame((st) => {
    const m = world.missions.find((x) => x.roomId === roomId && x.phase !== 'done');
    if (!group.current) return;
    group.current.visible = !!m;
    if (!m) return;
    group.current.rotation.y = st.clock.elapsedTime * 0.7;
    group.current.position.y = 3.55 + Math.sin(st.clock.elapsedTime * 2) * 0.08;
    fill.current.scale.y = Math.max(0.04, m.progress);
  });
  return (
    <group ref={group} position={[0, 3.55, 0]} visible={false}>
      <mesh material={M.glass}>
        <cylinderGeometry args={[0.6, 0.6, 1, 6, 1, false, HEX_START]} />
      </mesh>
      <mesh position={[0, 0.52, 0]} material={M.gold}>
        <cylinderGeometry args={[0.64, 0.64, 0.06, 6, 1, false, HEX_START]} />
      </mesh>
      <mesh position={[0, -0.52, 0]} material={M.gold}>
        <cylinderGeometry args={[0.64, 0.64, 0.06, 6, 1, false, HEX_START]} />
      </mesh>
      <group ref={fill} position={[0, -0.48, 0]}>
        <mesh position={[0, 0.48, 0]} material={M.honey}>
          <cylinderGeometry args={[0.52, 0.52, 0.96, 6, 1, false, HEX_START]} />
        </mesh>
      </group>
    </group>
  );
}

export function Room({ room }) {
  const floor = useHive((s) => s.floor);
  const hover = useHive((s) => s.hoverRoom === room.id);
  const selected = useHive((s) => s.selectedRoom === room.id);
  const walls = useRef([]);
  const accent = room.dept ? DEPTS[room.dept].color : '#F5B700';
  const rim = useMemo(() => std(accent, { emissive: '#FFB020', emissiveIntensity: 0 }), [accent]);
  const floorMat = useMemo(() => std(room.floor), [room.floor]);
  const wallMat = room.kind === 'server' ? M.silver : room.kind === 'royal' ? M.nectar : M.cream;
  const isGarden = room.kind === 'garden';
  const wallH = isGarden ? 0.45 : WALL_H;

  useFrame((st, dt) => {
    const cam = st.camera.position;
    const dx = cam.x - room.x;
    const dz = cam.z - room.z;
    const len = Math.hypot(dx, dz) || 1;
    walls.current.forEach((w, i) => {
      if (!w) return;
      const a = WALL_ANGLES[i];
      const dot = (Math.cos(a) * dx + Math.sin(a) * dz) / len;
      const target = isGarden ? 1 : dot > 0.1 ? 0.1 : 1;
      w.scale.y += (target - w.scale.y) * Math.min(1, dt * 6);
    });
    const g = world.glow[room.id] || 0;
    rim.emissiveIntensity = g * 1.6 + (hover || selected ? 0.35 : 0);
  });

  if (floor !== 'all' && room.tier > floor) return null;

  const showLabel = hover || selected || floor === room.tier;
  const Set = SETS[room.kind];
  const sideLen = ROOM_R * 1.0;

  return (
    <group position={[room.x, room.y, room.z]}>
      {/* lantai */}
      <mesh
        position={[0, -0.2, 0]}
        material={rim}
        receiveShadow
        castShadow
        onPointerOver={(e) => {
          e.stopPropagation();
          useHive.getState().setHoverRoom(room.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (useHive.getState().hoverRoom === room.id) useHive.getState().setHoverRoom(null);
          document.body.style.cursor = '';
        }}
        onClick={(e) => {
          e.stopPropagation();
          useHive.getState().selectRoom(room.id);
        }}
      >
        <cylinderGeometry args={[ROOM_R, ROOM_R, 0.4, 6, 1, false, HEX_START]} />
      </mesh>
      <mesh position={[0, -0.19, 0]} material={floorMat} receiveShadow>
        <cylinderGeometry args={[ROOM_R - 0.32, ROOM_R - 0.32, 0.4, 6, 1, false, HEX_START]} />
      </mesh>
      {/* tetesan sarang di bawah lantai */}
      <mesh position={[0, -1.0, 0]} rotation={[Math.PI, 0, 0]} material={M.royal} castShadow>
        <coneGeometry args={[ROOM_R * 0.92, 1.2, 6, 1, false, HEX_START]} />
      </mesh>
      <mesh position={[0, -1.75, 0]} material={M.honey}>
        <sphereGeometry args={[0.22, 8, 6]} />
      </mesh>

      {/* dinding (otomatis turun di sisi yang menghadap kamera) */}
      {WALL_ANGLES.map((a, i) => (
        <group
          key={i}
          ref={(el) => (walls.current[i] = el)}
          position={[APOTHEM * Math.cos(a), 0, APOTHEM * Math.sin(a)]}
          rotation={[0, -(a + Math.PI / 2), 0]}
        >
          <mesh position={[0, wallH / 2, 0]} material={isGarden ? M.wood : wallMat} castShadow receiveShadow>
            <boxGeometry args={[sideLen, wallH, 0.18]} />
          </mesh>
          <mesh position={[0, wallH + 0.05, 0]} material={M.gold} castShadow>
            <boxGeometry args={[sideLen + 0.05, 0.1, 0.26]} />
          </mesh>
          {!isGarden && room.kind !== 'server' && (
            <mesh position={[0, wallH * 0.62, 0.1]} rotation={[Math.PI / 2, 0, 0]} material={M.nectar}>
              <cylinderGeometry args={[0.32, 0.32, 0.03, 6, 1, false, HEX_START]} />
            </mesh>
          )}
        </group>
      ))}

      {SEATS_BY_ROOM[room.id]?.map((s) => {
        const Desk = DESKS[s.type];
        return (
          <group key={s.agentId} position={s.deskLocal} rotation={[0, s.deskRot, 0]}>
            <Desk />
          </group>
        );
      })}
      {room.kind === 'dept' && <DeptProp dept={room.dept} />}
      {room.kind === 'royal' && <RoyalDecor />}
      {Set && <Set />}

      <Gauge roomId={room.id} />

      {showLabel && (
        <Html position={[0, WALL_H + 2.3, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className={`room-tag${selected ? ' is-active' : ''}`}>{room.name}</div>
        </Html>
      )}
    </group>
  );
}
