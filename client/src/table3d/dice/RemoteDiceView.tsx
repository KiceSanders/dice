import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { useTableEvent } from '../tableEvents';
import { DICE_COUNT } from './constants';
import KoozieMesh from './KoozieMesh';
import PipDie from './PipDie';
import type { RemoteRollFeed } from './remoteFeed';
import { STRAIGHT_GLOW } from './straightGlow';
import { useDicePhysicsTuning } from './tuning';
import { useStraightGlow } from './useStraightGlow';

/**
 * Playback runs ~150ms in the past and the roller flushes the final frames
 * before reporting the result, so hold the celebration until the streamed
 * dice have visually finished snapping into place.
 */
const REMOTE_GLOW_DELAY_MS = 250;

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
  const glowTimerRef = useRef<number | null>(null);
  const { glow, start: startStraightGlow, clear: clearStraightGlow } = useStraightGlow();

  // Straight celebration: pose stream index i is die index i, the same index
  // space as the event's dice array, so the glow handles line up 1:1. Replay
  // covers mounting just after the roll settled (feed goes live late).
  useTableEvent(
    'straight',
    (event) => {
      if (glowTimerRef.current !== null) window.clearTimeout(glowTimerRef.current);
      glowTimerRef.current = window.setTimeout(() => {
        glowTimerRef.current = null;
        startStraightGlow(event.dice);
      }, REMOTE_GLOW_DELAY_MS);
    },
    { replayLastMs: STRAIGHT_GLOW.cueMaxAgeMs },
  );

  useEffect(
    () => () => {
      if (glowTimerRef.current !== null) window.clearTimeout(glowTimerRef.current);
      clearStraightGlow();
    },
    [clearStraightGlow],
  );

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
          <PipDie glow={glow[i]} />
        </group>
      ))}
    </group>
  );
}
