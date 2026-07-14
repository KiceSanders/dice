import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import {
  createFeltColliderGeometry,
  createRailColliderGeometry,
  createWallColliderGeometry,
  FELT_HALF_X,
  FELT_HALF_Z,
  TABLE,
  trimeshArgsFromGeometry,
} from '../geometry';
import { useDicePhysicsTuning } from './tuning';

/** Static colliders: felt surface + continuous oval rail and containment wall. */
export default function TableColliders() {
  const feltTrimeshArgs = useMemo(() => {
    const geometry = createFeltColliderGeometry();
    const args = trimeshArgsFromGeometry(geometry);
    geometry.dispose();
    return args;
  }, []);
  const railTrimeshArgs = useMemo(() => {
    const geometry = createRailColliderGeometry();
    const args = trimeshArgsFromGeometry(geometry);
    geometry.dispose();
    return args;
  }, []);
  const wallTrimeshArgs = useMemo(() => {
    const geometry = createWallColliderGeometry();
    const args = trimeshArgsFromGeometry(geometry);
    geometry.dispose();
    return args;
  }, []);
  const tuning = useDicePhysicsTuning();
  const ceilingY = Math.max(tuning.table.ceilingY, TABLE.surfaceY + 0.3);

  return (
    <group>
      <RigidBody
        type="fixed"
        friction={tuning.table.friction}
        restitution={tuning.table.restitution}
      >
        {/* Collider names feed impact-audio classification (audio/impactRules.ts). */}
        <TrimeshCollider name="felt" args={feltTrimeshArgs} />
        <CuboidCollider
          name="ceiling"
          args={[FELT_HALF_X, 0.025, FELT_HALF_Z]}
          position={[0, ceilingY, 0]}
          friction={tuning.table.wallFriction}
          restitution={tuning.table.wallRestitution}
        />
      </RigidBody>

      <RigidBody
        type="fixed"
        friction={tuning.table.railFriction}
        restitution={tuning.table.railRestitution}
      >
        <TrimeshCollider name="rail" args={railTrimeshArgs} />
      </RigidBody>

      <RigidBody
        type="fixed"
        friction={tuning.table.wallFriction}
        restitution={tuning.table.wallRestitution}
      >
        <TrimeshCollider name="wall" args={wallTrimeshArgs} />
      </RigidBody>
    </group>
  );
}
