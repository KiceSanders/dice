import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import KoozieMesh from './KoozieMesh';
import { KOOZIE } from './constants';
import { koozieWallSegments } from './koozieColliders';

export interface KoozieBodyHandle {
  body: RapierRigidBody | null;
}

type BodyType = 'fixed' | 'dynamic' | 'kinematicPosition';

interface Props {
  bodyType: BodyType;
  position: [number, number, number];
  rotation?: [number, number, number];
  visible?: boolean;
  ccd?: boolean;
  onGrabStart?: (event: ThreeEvent<PointerEvent>) => void;
}

const KoozieBody = forwardRef<KoozieBodyHandle, Props>(function KoozieBody(
  { bodyType, position, rotation, visible = true, ccd = false, onGrabStart },
  ref,
) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const walls = koozieWallSegments();

  useImperativeHandle(ref, () => ({
    get body() {
      return bodyRef.current;
    },
  }));

  if (!visible) return null;

  const bottomY = -KOOZIE.height * 0.5 + KOOZIE.bottomThickness * 0.5;

  return (
    <RigidBody
      ref={bodyRef}
      type={bodyType}
      position={position}
      rotation={rotation}
      colliders={false}
      friction={KOOZIE.friction}
      restitution={KOOZIE.restitution}
      linearDamping={0.35}
      angularDamping={0.4}
      gravityScale={0}
      ccd={ccd}
      canSleep
    >
      <CylinderCollider
        args={[KOOZIE.bottomThickness * 0.5, KOOZIE.radius * 0.88]}
        position={[0, bottomY, 0]}
        friction={KOOZIE.friction}
        restitution={KOOZIE.restitution}
        density={KOOZIE.density}
      />
      {walls.map((seg, i) => (
        <CuboidCollider
          key={i}
          args={seg.halfExtents}
          position={seg.position}
          rotation={seg.rotation}
          friction={KOOZIE.friction}
          restitution={KOOZIE.restitution}
          density={KOOZIE.density}
        />
      ))}
      {onGrabStart ? (
        <mesh
          onPointerDown={(event) => {
            event.stopPropagation();
            onGrabStart(event);
          }}
        >
          <cylinderGeometry args={[KOOZIE.radius * 1.12, KOOZIE.radius * 1.12, KOOZIE.height * 0.92, 20]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
      <KoozieMesh />
    </RigidBody>
  );
});

export default KoozieBody;
