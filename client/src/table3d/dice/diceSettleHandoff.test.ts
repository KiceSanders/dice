import type { Die } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { DICE_COUNT } from './constants';
import { buildSelectingRuntime, type DiePose } from './diceSettleHandoff';

describe('buildSelectingRuntime', () => {
  it('rails kept dice and freezes unkept at live poses', () => {
    const values = [1, 2, 3, 4, 5] as Die[];
    const live: (DiePose | null)[] = Array.from({ length: DICE_COUNT }, (_, i) =>
      i === 2 ? { position: [0.1, 0.05, -0.2], rotation: [0.1, 0.2, 0.3] } : null,
    );
    const { runtime, feltPoses } = buildSelectingRuntime(values, [0, 1], live, values);

    expect(runtime[0]?.locked).toBe(true);
    expect(runtime[0]?.inCup).toBe(false);
    expect(runtime[0]?.visible).toBe(true);
    expect(runtime[2]?.position).toEqual([0.1, 0.05, -0.2]);
    expect(feltPoses[2]?.position).toEqual([0.1, 0.05, -0.2]);
    expect(feltPoses[0]).toBeNull();
  });

  it('falls back to slot layout when an unkept die has no live pose', () => {
    const values = [6, 6, 6, 6, 6] as Die[];
    const live = Array(DICE_COUNT).fill(null);
    const { runtime } = buildSelectingRuntime(values, [], live, values);
    expect(runtime.every((r) => r.visible && r.locked)).toBe(true);
  });

  it('preserves remembered felt poses for dice kept across rolls', () => {
    const values = [1, 2, 3, 4, 5] as Die[];
    const oldPose: DiePose = { position: [0.4, 0.06, 0.25], rotation: [0.2, 0.3, 0.4] };
    const previous = Array<DiePose | null>(DICE_COUNT).fill(null);
    previous[0] = oldPose;
    const live = Array<DiePose | null>(DICE_COUNT).fill(null);
    live[1] = { position: [-0.2, 0.06, -0.1], rotation: [0.5, 0.6, 0.7] };

    const { feltPoses } = buildSelectingRuntime(values, [0], live, values, previous);

    expect(feltPoses[0]).toEqual(oldPose);
    expect(feltPoses[1]).toEqual(live[1]);
  });
});
