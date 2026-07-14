import type { ThreeEvent } from '@react-three/fiber';
import { CuboidCollider, type RapierRigidBody, RigidBody } from '@react-three/rapier';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { handleDieContactForce } from '../audio/rollerImpacts';
import { DIE_HALF, SOFT_CCD_PREDICTION } from './constants';
import PipDie from './PipDie';
import type { GlowHandle } from './straightGlow';
import { useDicePhysicsTuning } from './tuning';

export interface DieBodyHandle {
  body: RapierRigidBody | null;
}

interface Props {
  locked: boolean;
  /** Kinematic body driven each frame (e.g. carried inside a moving cup). */
  driven?: boolean;
  /** When false, pointer rays pass through to the koozie pick mesh. */
  pickable?: boolean;
  /** Keep the rigid body alive while hiding the die mesh. */
  meshVisible?: boolean;
  /** Straight-celebration glow level for this die (see useStraightGlow). */
  glow?: GlowHandle;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  position: [number, number, number];
  rotation?: [number, number, number];
}

const DieBody = forwardRef<DieBodyHandle, Props>(function DieBody(
  {
    locked,
    driven = false,
    pickable = true,
    meshVisible = true,
    glow,
    onPointerDown,
    onPointerEnter,
    onPointerLeave,
    position,
    rotation,
  },
  ref,
) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const tuning = useDicePhysicsTuning();

  useImperativeHandle(ref, () => ({
    get body() {
      return bodyRef.current;
    },
  }));

  const bodyType = driven ? 'kinematicPosition' : locked ? 'fixed' : 'dynamic';

  return (
    <RigidBody
      ref={bodyRef}
      type={bodyType}
      position={position}
      rotation={rotation}
      colliders={false}
      linearDamping={tuning.dice.linearDamping}
      angularDamping={tuning.dice.angularDamping}
      canSleep
      // Hard CCD's nonlinear TOI search caused 86–121 ms Chromebook steps
      // with several dice in the cup. Keep this paired with soft CCD (ADR 002).
      ccd={false}
      softCcdPrediction={!locked && !driven ? SOFT_CCD_PREDICTION : 0}
    >
      <CuboidCollider
        // `name` tags this side of a contact for impact audio (impactRules.ts);
        // onContactForce only exists here — dice touch everything we sound.
        name="die"
        args={[DIE_HALF * 0.96, DIE_HALF * 0.96, DIE_HALF * 0.96]}
        friction={tuning.dice.friction}
        restitution={tuning.dice.restitution}
        density={tuning.dice.density}
        onContactForce={handleDieContactForce}
      />
      <group
        visible={meshVisible}
        raycast={pickable ? undefined : () => null}
        onPointerDown={pickable ? onPointerDown : undefined}
        onPointerEnter={pickable ? onPointerEnter : undefined}
        onPointerLeave={pickable ? onPointerLeave : undefined}
      >
        <PipDie glow={glow} />
      </group>
    </RigidBody>
  );
});

export default DieBody;
