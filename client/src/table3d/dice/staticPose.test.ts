import type { Die } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { viewRotationY } from '../layout';
import { rotateBodyPoseY } from '../seatTransform';
import { DICE_COUNT, dieSlotPosition } from './constants';
import { keptDieRailPosition } from './diceLayout';
import {
  type CapturedRollPose,
  poseFrameMatchesDice,
  resolveLastRollPose,
  rollIdentityMatches,
  staticPoseFromDice,
} from './staticPose';

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

describe('rollIdentityMatches', () => {
  it('matches player and roll number exactly', () => {
    expect(
      rollIdentityMatches({ playerId: 'p1', rollNumber: 2 }, { playerId: 'p1', rollNumber: 2 }),
    ).toBe(true);
    expect(
      rollIdentityMatches({ playerId: 'p1', rollNumber: 2 }, { playerId: 'p1', rollNumber: 3 }),
    ).toBe(false);
  });
});

describe('resolveLastRollPose', () => {
  const dice: Die[] = [3, 1, 4, 6, 2];
  const lastRoll = { playerId: 'p1', rollNumber: 2, dice, kept: [1, 3] as number[] };
  const capturedFrame = staticPoseFromDice([3, 1, 4, 6, 5], [1, 3])!;
  const matchingFrame = staticPoseFromDice(dice, [1, 3])!;

  function capture(frame: typeof capturedFrame, rollNumber: number): CapturedRollPose {
    return {
      frame,
      at: 100,
      rollId: { playerId: 'p1', rollNumber },
    };
  }

  it('prefers a tagged capture whose roll id and faces both match', () => {
    const resolved = resolveLastRollPose(
      lastRoll,
      capture(matchingFrame, 2),
      capture(matchingFrame, 2),
    );
    expect(resolved).toBe(matchingFrame);
  });

  it('rejects a stale capture with matching faces but the wrong roll number', () => {
    const resolved = resolveLastRollPose(lastRoll, capture(matchingFrame, 1), null);
    expect(resolved).not.toBe(matchingFrame);
    expect(resolved).toEqual(staticPoseFromDice(dice, [1, 3]));
  });

  it('rejects a capture with the right roll id but wrong faces', () => {
    const resolved = resolveLastRollPose(lastRoll, capture(capturedFrame, 2), null);
    expect(resolved).toEqual(staticPoseFromDice(dice, [1, 3]));
  });

  it('picks the newest matching capture between local and remote sources', () => {
    const older = { ...capture(matchingFrame, 2), at: 50 };
    const newer = { ...capture(matchingFrame, 2), at: 200 };
    const resolved = resolveLastRollPose(lastRoll, older, newer);
    expect(resolved).toBe(newer.frame);
  });
});
