import type { Die } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { viewRotationY } from '../layout';
import { rotateBodyPoseY } from '../seatTransform';
import { DICE_COUNT, dieSlotPosition } from './constants';
import { keptDieRailPosition } from './diceLayout';
import { poseFrameMatchesDice, staticPoseFromDice } from './staticPose';

describe('staticPoseFromDice', () => {
  it('places kept dice on the rail and unkept dice on felt slots', () => {
    const pose = staticPoseFromDice([1, 2, 3, 4, 5], [1, 3]);
    expect(pose?.cupVisible).toBe(false);
    expect(pose?.bodies).toHaveLength(DICE_COUNT + 1);

    const die0 = pose!.bodies[1]!;
    const die1 = pose!.bodies[2]!;
    const die3 = pose!.bodies[4]!;
    expect(die0.slice(0, 3)).toEqual(dieSlotPosition(0));
    expect(die1.slice(0, 3)).toEqual(keptDieRailPosition(0, 2));
    expect(die3.slice(0, 3)).toEqual(keptDieRailPosition(1, 2));
  });
});

describe('poseFrameMatchesDice', () => {
  const dice: Die[] = [3, 1, 4, 6, 2];
  const frame = staticPoseFromDice(dice, [1, 3])!;

  it('accepts a frame showing exactly the authoritative dice', () => {
    expect(poseFrameMatchesDice(frame, dice)).toBe(true);
  });

  it('rejects a frame from a different roll', () => {
    expect(poseFrameMatchesDice(frame, [3, 1, 4, 6, 5])).toBe(false);
    expect(poseFrameMatchesDice(frame, [])).toBe(false);
  });

  it('still matches after a seat-localizing Y rotation (top faces preserved)', () => {
    for (const seat of [1, 2]) {
      const rotated = {
        ...frame,
        bodies: frame.bodies.map((b) => rotateBodyPoseY(b, viewRotationY(seat))),
      };
      expect(poseFrameMatchesDice(rotated, dice)).toBe(true);
    }
  });
});
