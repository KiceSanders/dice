import { useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
  FELT_SCALE,
  RAIL_COLLIDER_H,
  RAIL_COLLIDER_SEGMENTS,
  RAIL_COLLIDER_Y,
  RAIL_INNER_WORLD,
  RAIL_OUTER_WORLD,
  TABLE,
  TABLE_WALL_H,
  TABLE_WALL_OUTSET,
  TABLE_WALL_SEGMENTS,
  TABLE_WALL_Y,
} from '../layout';
import { FELT_HALF_X, FELT_HALF_Y, FELT_HALF_Z } from './constants';
import { useDicePhysicsTuning } from './tuning';

const feltY = TABLE.surfaceY - FELT_HALF_Y;

type OvalSegment = {
  position: [number, number, number];
  rotation: [number, number, number];
  args: [number, number, number];
};

function buildOvalSegments(
  count: number,
  midRadius: number,
  radialDepth: number,
  halfHeight: number,
  centerY: number,
  arcOverscan = 1.08,
): OvalSegment[] {
  const avgScale = (FELT_SCALE.x + FELT_SCALE.z) / 2;
  const arcWidth = ((Math.PI * 2 * midRadius * avgScale) / count) * arcOverscan;
  const halfRad = radialDepth / 2;
  const halfTan = arcWidth / 2;

  return Array.from({ length: count }, (_, i) => {
    const theta = (i / count) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return {
      position: [midRadius * FELT_SCALE.x * cos, centerY, midRadius * FELT_SCALE.z * sin],
      rotation: [0, -theta + Math.PI / 2, 0],
      args: [halfRad, halfHeight, halfTan],
    };
  });
}

function buildRailSegments(): OvalSegment[] {
  const midR = (RAIL_INNER_WORLD + RAIL_OUTER_WORLD) / 2;
  const radialDepth = RAIL_OUTER_WORLD - RAIL_INNER_WORLD;
  return buildOvalSegments(
    RAIL_COLLIDER_SEGMENTS,
    midR,
    radialDepth,
    RAIL_COLLIDER_H / 2,
    RAIL_COLLIDER_Y,
  );
}

/** Tall invisible ring at the outer table edge — dice cannot escape over the rail. */
function buildContainmentWallSegments(): OvalSegment[] {
  const wallRadius = RAIL_OUTER_WORLD + TABLE_WALL_OUTSET;
  const radialDepth = 0.08;
  return buildOvalSegments(
    TABLE_WALL_SEGMENTS,
    wallRadius,
    radialDepth,
    TABLE_WALL_H / 2,
    TABLE_WALL_Y,
  );
}

const RAIL_SEGMENTS = buildRailSegments();
const WALL_SEGMENTS = buildContainmentWallSegments();

/** Static colliders: felt surface + oval rail bumpers + invisible containment wall. */
export default function TableColliders() {
  const railSegments = useMemo(() => RAIL_SEGMENTS, []);
  const wallSegments = useMemo(() => WALL_SEGMENTS, []);
  const tuning = useDicePhysicsTuning();
  const ceilingY = Math.max(tuning.table.ceilingY, TABLE.surfaceY + 0.3);

  return (
    <group>
      <RigidBody type="fixed" friction={tuning.table.friction} restitution={tuning.table.restitution}>
        <CuboidCollider args={[FELT_HALF_X, FELT_HALF_Y, FELT_HALF_Z]} position={[0, feltY, 0]} />
        <CuboidCollider
          args={[FELT_HALF_X, 0.025, FELT_HALF_Z]}
          position={[0, ceilingY, 0]}
          friction={tuning.table.wallFriction}
          restitution={tuning.table.wallRestitution}
        />
      </RigidBody>

      <RigidBody type="fixed" friction={tuning.table.railFriction} restitution={tuning.table.railRestitution}>
        {railSegments.map((seg, i) => (
          <CuboidCollider
            key={`rail-${i}`}
            args={seg.args}
            position={seg.position}
            rotation={seg.rotation}
          />
        ))}
      </RigidBody>

      <RigidBody type="fixed" friction={tuning.table.wallFriction} restitution={tuning.table.wallRestitution}>
        {wallSegments.map((seg, i) => (
          <CuboidCollider
            key={`wall-${i}`}
            args={seg.args}
            position={seg.position}
            rotation={seg.rotation}
          />
        ))}
      </RigidBody>
    </group>
  );
}
