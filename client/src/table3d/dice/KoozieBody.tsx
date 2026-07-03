import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import KoozieMesh from './KoozieMesh';
import { koozieWallSegments } from './koozieColliders';
import type { DicePhysicsTuning } from './tuning';

export interface KoozieBodyHandle {
  body: RapierRigidBody | null;
}

type BodyType = 'fixed' | 'dynamic' | 'kinematicPosition';

interface Props {
  bodyType: BodyType;
  position: [number, number, number];
  rotation?: [number, number, number];
  visible?: boolean;
  lid?: boolean;
  ccd?: boolean;
  tuning: DicePhysicsTuning;
  onGrabStart?: (event: ThreeEvent<PointerEvent>) => void;
}

const KoozieBody = forwardRef<KoozieBodyHandle, Props>(function KoozieBody(
  { bodyType, position, rotation, visible = true, lid = false, ccd = false, tuning, onGrabStart },
  ref,
) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const walls = koozieWallSegments(tuning.cup);

  useImperativeHandle(ref, () => ({
    get body() {
      return bodyRef.current;
    },
  }));

  if (!visible) return null;

  const bottomY = -tuning.cup.height * 0.5 + tuning.cup.bottomThickness * 0.5;
  const lidY = tuning.cup.height * 0.5 - tuning.cup.rimInset + tuning.cup.lidThickness * 0.5;

  return (
    <RigidBody
      ref={bodyRef}
      type={bodyType}
      position={position}
      rotation={rotation}
      colliders={false}
      friction={tuning.cup.friction}
      restitution={tuning.cup.restitution}
      linearDamping={0.35}
      angularDamping={0.4}
      gravityScale={0}
      ccd={ccd}
      canSleep
    >
      <CylinderCollider
        args={[tuning.cup.bottomThickness * 0.5, tuning.cup.radius * 0.88]}
        position={[0, bottomY, 0]}
        friction={tuning.cup.friction}
        restitution={tuning.cup.restitution}
        density={tuning.cup.density}
      />
      {lid ? (
        <CylinderCollider
          args={[tuning.cup.lidThickness * 0.5, tuning.cup.radius * 0.86]}
          position={[0, lidY, 0]}
          friction={tuning.cup.friction}
          restitution={tuning.cup.restitution}
          density={tuning.cup.density}
        />
      ) : null}
      {walls.map((seg, i) => (
        <CuboidCollider
          key={i}
          args={seg.halfExtents}
          position={seg.position}
          rotation={seg.rotation}
          friction={tuning.cup.friction}
          restitution={tuning.cup.restitution}
          density={tuning.cup.density}
        />
      ))}
      {onGrabStart ? (
        <mesh
          onPointerDown={(event) => {
            event.stopPropagation();
            onGrabStart(event);
          }}
        >
          <cylinderGeometry
            args={[
              tuning.cup.radius * 1.12,
              tuning.cup.radius * 1.12,
              tuning.cup.height * 0.92,
              20,
            ]}
          />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
      <KoozieMesh cup={tuning.cup} />
    </RigidBody>
  );
});

export default KoozieBody;
