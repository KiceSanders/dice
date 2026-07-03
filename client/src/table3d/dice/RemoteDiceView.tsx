import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import KoozieMesh from './KoozieMesh';
import PipDie from './PipDie';
import { DICE_COUNT } from './constants';
import type { RemoteRollFeed } from './remoteFeed';
import { useDicePhysicsTuning } from './tuning';

/**
 * Spectator playback of a remote roller's throw (ADR 004): the same cup and
 * die meshes as the live sim, but plain groups driven from the streamed pose
 * feed — no rigid bodies, no simulation, nothing to diverge. Hidden whenever
 * the feed is empty.
 */
export default function RemoteDiceView({ feed }: { feed: RemoteRollFeed }) {
  const tuning = useDicePhysicsTuning();
  const rootRef = useRef<THREE.Group>(null);
  const cupRef = useRef<THREE.Group>(null);
  const dieRefs = useRef<(THREE.Group | null)[]>(Array(DICE_COUNT).fill(null));

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    const sampled = feed.sample();
    if (!sampled) {
      root.visible = false;
      return;
    }
    root.visible = true;

    const [cupPose, ...dicePoses] = sampled.bodies;
    const cup = cupRef.current;
    if (cup && cupPose) {
      cup.visible = sampled.cupVisible;
      cup.position.set(cupPose[0], cupPose[1], cupPose[2]);
      cup.quaternion.set(cupPose[3], cupPose[4], cupPose[5], cupPose[6]);
    }
    for (let i = 0; i < DICE_COUNT; i++) {
      const die = dieRefs.current[i];
      if (!die) continue;
      const pose = dicePoses[i];
      if (!pose) {
        die.visible = false;
        continue;
      }
      die.visible = true;
      die.position.set(pose[0], pose[1], pose[2]);
      die.quaternion.set(pose[3], pose[4], pose[5], pose[6]);
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      <group ref={cupRef}>
        <KoozieMesh cup={tuning.cup} />
      </group>
      {Array.from({ length: DICE_COUNT }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            dieRefs.current[i] = el;
          }}
        >
          <PipDie />
        </group>
      ))}
    </group>
  );
}
