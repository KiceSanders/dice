import type { Die } from '@dice/shared';
import * as THREE from 'three';
import { DICE_COUNT, dieSlotPosition } from './constants';
import { keepSlotForIndex, keptDieRailPosition } from './diceLayout';
import { quaternionForFace } from './faceValue';
import { spawnDiceInCupLocal } from './koozieColliders';
import { createHomePose } from './koozieMotion';
import type { DicePhysicsTuning } from './tuning';

/**
 * Declarative per-die layout state consumed by DicePhysics. Pure data — the
 * physics component turns it into rigid bodies, so layout rules live here
 * where they are unit-testable (diceRuntime.test.ts) instead of inside the
 * simulation orchestration.
 */
export type DieRuntime = {
  visible: boolean;
  meshVisible?: boolean;
  locked: boolean;
  inCup: boolean;
  position: [number, number, number];
  rotation?: [number, number, number];
};

const _euler = new THREE.Euler();
const _vec = new THREE.Vector3();

export function quatToEuler(q: THREE.Quaternion): [number, number, number] {
  _euler.setFromQuaternion(q);
  return [_euler.x, _euler.y, _euler.z];
}

export function eulerToQuat(euler: [number, number, number]): THREE.Quaternion {
  _euler.set(euler[0], euler[1], euler[2]);
  return new THREE.Quaternion().setFromEuler(_euler);
}

export function cupLocalToWorld(
  local: [number, number, number],
  cupPos: THREE.Vector3,
  cupQuat: THREE.Quaternion,
): [number, number, number] {
  _vec.set(local[0], local[1], local[2]).applyQuaternion(cupQuat).add(cupPos);
  return [_vec.x, _vec.y, _vec.z];
}

/**
 * Initial dice layout for a (re)mount. Cup mode (the roller): kept dice sit
 * locked on the near rail, unkept dice spawn inside the parked cup — hidden
 * before the first roll (no values yet), visible after a mid-turn remount.
 * Non-cup mode (passive views): committed values at fixed felt slots.
 */
export function buildRuntime(
  dice: Die[],
  keepIndices: number[],
  cupMode: boolean,
  tuning: DicePhysicsTuning,
): DieRuntime[] {
  if (!cupMode) {
    return Array.from({ length: DICE_COUNT }, (_, i) => {
      const value = dice[i];
      if (value === undefined) {
        return {
          visible: false,
          locked: true,
          inCup: false,
          position: dieSlotPosition(i),
        };
      }
      return {
        visible: true,
        meshVisible: true,
        locked: true,
        inCup: false,
        position: dieSlotPosition(i),
        rotation: quatToEuler(quaternionForFace(value)),
      };
    });
  }

  // A keep without a committed value is stale/invalid input (most notably the
  // one-render turn-switch lag this module must fail closed against). Never
  // turn it into a visible identity-rotation die on the near rail.
  const keptSorted = keepIndices
    .filter((i) => i >= 0 && i < DICE_COUNT && dice[i] !== undefined)
    .sort((a, b) => a - b);
  const kept = new Set(keptSorted);
  const unkeptIndices = Array.from({ length: DICE_COUNT }, (_, i) => i).filter((i) => !kept.has(i));
  const home = createHomePose(tuning);

  return Array.from({ length: DICE_COUNT }, (_, i) => {
    if (kept.has(i)) {
      const value = dice[i];
      // Kept dice live on the near rail (same slot math as enterSelectingPhase /
      // applyKeepLayout) — a mid-turn remount must not drop them mid-felt.
      return {
        visible: true,
        meshVisible: true,
        locked: true,
        inCup: false,
        position: keptDieRailPosition(keepSlotForIndex(i, keptSorted), keptSorted.length),
        rotation: value ? quatToEuler(quaternionForFace(value)) : undefined,
      };
    }

    const cupSlot = unkeptIndices.indexOf(i);
    const local = spawnDiceInCupLocal(cupSlot, unkeptIndices.length, tuning.cup);
    return {
      visible: true,
      // Full hands are visible on a mid-turn remount; empty first-roll hands
      // remain physical but hidden. Partial malformed hands also fail closed.
      meshVisible: dice[i] !== undefined,
      locked: false,
      inCup: true,
      position: cupLocalToWorld(local.position, home.position, home.quaternion),
      rotation: local.rotation,
    };
  });
}
