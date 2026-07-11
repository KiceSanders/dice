import type { Die } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { restPoseForThrowResult } from '../../game/throwProtocol';
import { DICE_COUNT } from './constants';
import { poseFrameFromRuntime } from './diceDisplayPose';
import { keepSlotForIndex, keptDieRailPosition } from './diceLayout';
import { quatToEuler } from './diceRuntime';
import { buildSelectingRuntime, type DiePose } from './diceSettleHandoff';
import { quaternionForFace } from './faceValue';

describe('poseFrameFromRuntime', () => {
  it('captures newly kept dice on the rail for a final stand pose', () => {
    const dice = [1, 2, 3, 4, 5] as Die[];
    const live: (DiePose | null)[] = Array.from({ length: DICE_COUNT }, (_, i) => ({
      position: [i * 0.1 - 0.2, 0.06, -0.15],
      rotation: quatToEuler(quaternionForFace(dice[i]!)),
    }));
    const kept = [0, 2, 4];
    const { runtime } = buildSelectingRuntime(dice, kept, live, dice);

    const frame = poseFrameFromRuntime(runtime, [0, 0, 0, 0, 0, 0, 1]);
    expect(frame).not.toBeNull();
    const restPose = restPoseForThrowResult(frame!.bodies, dice);

    expect(restPose).not.toBeNull();
    for (const index of kept) {
      const slot = keepSlotForIndex(index, kept);
      const rail = keptDieRailPosition(slot, kept.length);
      expect(restPose![index]![0]).toBeCloseTo(rail[0], 3);
      expect(restPose![index]![1]).toBeCloseTo(rail[1], 3);
      expect(restPose![index]![2]).toBeCloseTo(rail[2], 3);
    }
  });
});
