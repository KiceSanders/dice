import type { BodyPose, PoseFrame } from '@dice/shared';
import { type ReactNode, useMemo } from 'react';
import * as THREE from 'three';
import { useTableEvent } from '../tableEvents';
import { DICE_COUNT } from './constants';
import KoozieMesh from './KoozieMesh';
import PipDie from './PipDie';
import { STRAIGHT_GLOW } from './straightGlow';
import { useDicePhysicsTuning } from './tuning';
import { useStraightGlow } from './useStraightGlow';

function posePosition(pose: BodyPose): [number, number, number] {
  return [pose[0], pose[1], pose[2]];
}

function StaticBody({ pose, children }: { pose: BodyPose; children: ReactNode }) {
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
  const { glow, start: startStraightGlow, clear: clearStraightGlow } = useStraightGlow();

  // Same celebration bus as DicePhysics / RemoteDiceView (three-renderer rule).
  useTableEvent(
    'straight',
    (event) => {
      clearStraightGlow();
      startStraightGlow(event.dice);
    },
    { replayLastMs: STRAIGHT_GLOW.cueMaxAgeMs },
  );

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
            <PipDie glow={glow[i]} />
          </StaticBody>
        );
      })}
    </group>
  );
}
