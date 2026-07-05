import type { BodyPose, Die, PoseFrame } from '@dice/shared';
import { DICE_COUNT, dieSlotPosition } from './constants';
import { keepSlotForIndex, keptDieRailPosition } from './diceLayout';
import { quaternionForFace } from './faceValue';

const HIDDEN_CUP_POSE: BodyPose = [0, 0, 0, 0, 0, 0, 1];

function diePose(position: [number, number, number], value: Die): BodyPose {
  const q = quaternionForFace(value);
  return [position[0], position[1], position[2], q.x, q.y, q.z, q.w];
}

/** Build a stable non-physics table pose from committed dice values. */
export function staticPoseFromDice(dice: Die[], keepIndices: number[] = []): PoseFrame | null {
  if (dice.length < DICE_COUNT) return null;

  const kept = new Set(keepIndices);
  const keptSorted = [...keepIndices].sort((a, b) => a - b);
  const bodies: BodyPose[] = [HIDDEN_CUP_POSE];

  for (let i = 0; i < DICE_COUNT; i++) {
    const value = dice[i];
    if (value === undefined) return null;
    const position = kept.has(i)
      ? keptDieRailPosition(keepSlotForIndex(i, keptSorted), keptSorted.length)
      : dieSlotPosition(i);
    bodies.push(diePose(position, value));
  }

  return { t: 0, bodies, cupVisible: false };
}
