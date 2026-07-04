import { useMemo, type ReactNode } from 'react';
import type { BodyPose, PoseFrame } from '@dice/shared';
import * as THREE from 'three';
import KoozieMesh from './KoozieMesh';
import PipDie from './PipDie';
import { DICE_COUNT } from './constants';
import { useDicePhysicsTuning } from './tuning';

function posePosition(pose: BodyPose): [number, number, number] {
  return [pose[0], pose[1], pose[2]];
}

function StaticBody({
  pose,
  children,
}: {
  pose: BodyPose;
  children: ReactNode;
}) {
  const quaternion = useMemo(
    () => new THREE.Quaternion(pose[3], pose[4], pose[5], pose[6]),
    [pose],
  );
  return (
    <group position={posePosition(pose)} quaternion={quaternion}>
      {children}
    </group>
  );
}

/** Frozen table pose used between turns and before the delayed winner reveal. */
export default function StaticDiceView({ frame }: { frame: PoseFrame }) {
  const tuning = useDicePhysicsTuning();
  const [cupPose, ...dicePoses] = frame.bodies;

  return (
    <group>
      {frame.cupVisible && cupPose ? (
        <StaticBody pose={cupPose}>
          <KoozieMesh cup={tuning.cup} />
        </StaticBody>
      ) : null}
      {Array.from({ length: DICE_COUNT }, (_, i) => {
        const pose = dicePoses[i];
        if (!pose) return null;
        return (
          <StaticBody key={i} pose={pose}>
            <PipDie />
          </StaticBody>
        );
      })}
    </group>
  );
}
