import { describe, expect, it } from 'vitest';
import { calledFaceLeftPct, shouldShowBetALotCalledFace } from './BetALotCalledFace';

describe('called face placement', () => {
  it('keeps both heads-up seat variants inside the frame', () => {
    expect(calledFaceLeftPct(50, 0)).toBe(62);
    expect(calledFaceLeftPct(4, 1)).toBe(12);
    expect(calledFaceLeftPct(96, 1)).toBe(91);
  });

  it('stays through the chooser throw and hides on the next player pickup', () => {
    expect(shouldShowBetALotCalledFace('chooser', 'chooser', true)).toBe(true);
    expect(shouldShowBetALotCalledFace('chooser', 'next', false)).toBe(true);
    expect(shouldShowBetALotCalledFace('chooser', 'next', true)).toBe(false);
  });
});
