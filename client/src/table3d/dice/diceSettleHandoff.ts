import type { Die } from '@dice/shared';
import { DICE_COUNT, type DiceCount, dieSlotPosition } from './constants';
import { keepSlotForIndex, keptDieRailPosition } from './diceLayout';
import { type DieRuntime, quatToEuler } from './diceRuntime';
import { quaternionForFace } from './faceValue';

export type DiePose = {
  position: [number, number, number];
  rotation: [number, number, number];
};

/**
 * Build the declarative selecting-phase runtime from settled face values and
 * optional live poses (unkept dice). Pure — DicePhysics supplies body reads
 * as `livePoses` (null → slot fallback).
 */
export function buildSelectingRuntime(
  values: Die[],
  kept: number[],
  livePoses: (DiePose | null)[],
  committedDice: Die[],
  previousFeltPoses: (DiePose | null)[] = [],
  diceCount: DiceCount = DICE_COUNT,
): { runtime: DieRuntime[]; feltPoses: (DiePose | null)[] } {
  const keptSorted = [...kept].sort((a, b) => a - b);
  const nextFelt: (DiePose | null)[] = Array(diceCount).fill(null);
  const runtime: DieRuntime[] = Array.from({ length: diceCount }, (_, i) => ({
    visible: false,
    locked: true,
    inCup: false,
    position: dieSlotPosition(i, diceCount),
  }));

  for (let i = 0; i < diceCount; i++) {
    const value = values[i] ?? committedDice[i];
    if (value === undefined && !kept.includes(i)) continue;

    if (kept.includes(i)) {
      nextFelt[i] = previousFeltPoses[i] ?? null;
      const slot = keepSlotForIndex(i, keptSorted);
      runtime[i] = {
        visible: true,
        locked: true,
        inCup: false,
        position: keptDieRailPosition(slot, keptSorted.length),
        rotation: value ? quatToEuler(quaternionForFace(value)) : undefined,
      };
      continue;
    }

    const pose: DiePose = livePoses[i] ?? {
      position: dieSlotPosition(i, diceCount),
      rotation: [0, 0, 0],
    };
    nextFelt[i] = pose;
    runtime[i] = {
      visible: true,
      locked: true,
      inCup: false,
      position: pose.position,
      rotation: pose.rotation,
    };
  }

  return { runtime, feltPoses: nextFelt };
}
