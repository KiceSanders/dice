import { forwardRef, useImperativeHandle, useRef } from 'react';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import PipDie from './PipDie';
import { DIE_HALF, PHYSICS } from './constants';

export interface DieBodyHandle {
  body: RapierRigidBody | null;
}

interface Props {
  locked: boolean;
  /** When false, pointer rays pass through to the koozie pick mesh. */
  pickable?: boolean;
  position: [number, number, number];
  rotation?: [number, number, number];
}

const DieBody = forwardRef<DieBodyHandle, Props>(function DieBody(
  { locked, pickable = true, position, rotation },
  ref,
) {
  const bodyRef = useRef<RapierRigidBody>(null);

  useImperativeHandle(ref, () => ({
    get body() {
      return bodyRef.current;
    },
  }));

  return (
    <RigidBody
      ref={bodyRef}
      type={locked ? 'fixed' : 'dynamic'}
      position={position}
      rotation={rotation}
      colliders={false}
      linearDamping={PHYSICS.linearDamping}
      angularDamping={PHYSICS.angularDamping}
      canSleep
      ccd={!locked}
    >
      <CuboidCollider
        args={[DIE_HALF * 0.96, DIE_HALF * 0.96, DIE_HALF * 0.96]}
        friction={PHYSICS.dieFriction}
        restitution={PHYSICS.dieRestitution}
        density={PHYSICS.dieDensity}
      />
      <group raycast={pickable ? undefined : () => null}>
        <PipDie />
      </group>
    </RigidBody>
  );
});

export default DieBody;
