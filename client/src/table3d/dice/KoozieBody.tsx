import type { ThreeEvent } from '@react-three/fiber';
import {
  CylinderCollider,
  type RapierRigidBody,
  RigidBody,
  TrimeshCollider,
} from '@react-three/rapier';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import KoozieMesh from './KoozieMesh';
import {
  createKooziePickGeometry,
  KOOZIE_COLLIDER_RADIUS_INSET,
  KOOZIE_LID_COLLIDER_RADIUS_INSET,
  koozieBottomColliderY,
  koozieLidColliderY,
  koozieWallTrimeshArgs,
} from './koozieGeometry';
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
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
}

const KoozieBody = forwardRef<KoozieBodyHandle, Props>(function KoozieBody(
  {
    bodyType,
    position,
    rotation,
    visible = true,
    lid = false,
    ccd = false,
    tuning,
    onGrabStart,
    onPointerEnter,
    onPointerMove,
    onPointerLeave,
  },
  ref,
) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const wallTrimeshArgs = useMemo(
    () => koozieWallTrimeshArgs(tuning.cup),
    [tuning.cup.radius, tuning.cup.height, tuning.cup.wallThickness, tuning.cup.rimInset],
  );
  const pickGeometry = useMemo(
    () => createKooziePickGeometry(tuning.cup),
    [tuning.cup.radius, tuning.cup.height],
  );

  useImperativeHandle(ref, () => ({
    get body() {
      return bodyRef.current;
    },
  }));

  if (!visible) return null;

  const bottomY = koozieBottomColliderY(tuning.cup);
  const lidY = koozieLidColliderY(tuning.cup);

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
        args={[tuning.cup.bottomThickness * 0.5, tuning.cup.radius * KOOZIE_COLLIDER_RADIUS_INSET]}
        position={[0, bottomY, 0]}
        friction={tuning.cup.friction}
        restitution={tuning.cup.restitution}
        density={tuning.cup.density}
      />
      {lid ? (
        <CylinderCollider
          args={[
            tuning.cup.lidThickness * 0.5,
            tuning.cup.radius * KOOZIE_LID_COLLIDER_RADIUS_INSET,
          ]}
          position={[0, lidY, 0]}
          friction={tuning.cup.friction}
          restitution={tuning.cup.restitution}
          density={tuning.cup.density}
        />
      ) : null}
      <TrimeshCollider
        args={wallTrimeshArgs}
        friction={tuning.cup.friction}
        restitution={tuning.cup.restitution}
        density={tuning.cup.density}
      />
      {onGrabStart ? (
        <mesh
          onPointerDown={(event) => {
            event.stopPropagation();
            onGrabStart(event);
          }}
          onPointerEnter={(event) => {
            event.stopPropagation();
            onPointerEnter?.(event);
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
            onPointerMove?.(event);
          }}
          onPointerLeave={(event) => {
            event.stopPropagation();
            onPointerLeave?.(event);
          }}
        >
          <primitive object={pickGeometry} attach="geometry" />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
      <KoozieMesh cup={tuning.cup} />
    </RigidBody>
  );
});

export default KoozieBody;
