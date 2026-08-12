import { describe, expect, it } from 'vitest';
import { shouldShowBetALotHeldPose } from './useBetALotTableRoll';

const idleHandoff = {
  hasHeldPose: true,
  extraRoll: false,
  throwing: false,
  dragging: false,
  rolling: false,
  localSimShowsLatestRoll: false,
};

describe('Bet-a-lot held pose handoff', () => {
  it('shows the previous player hand before the incoming roller grabs', () => {
    expect(shouldShowBetALotHeldPose(idleHandoff)).toBe(true);
  });

  it('does not duplicate the local physics hand after that same roll settles', () => {
    expect(shouldShowBetALotHeldPose({ ...idleHandoff, localSimShowsLatestRoll: true })).toBe(
      false,
    );
  });
});
