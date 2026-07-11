import { describe, expect, it } from 'vitest';
import { formatRollToBeatText, summarizeRollToBeat } from './rollToBeatFormat';

describe('summarizeRollToBeat', () => {
  it('exposes digit count and face for a group hand', () => {
    expect(summarizeRollToBeat({ count: 3, face: 6, rollsUsed: 1, straight: 'none' })).toEqual({
      count: 3,
      face: 6,
      rollsUsed: 1,
      straight: false,
    });
  });

  it('omits count/face for a straight', () => {
    expect(summarizeRollToBeat({ count: 0, face: 1, rollsUsed: 2, straight: 'straight' })).toEqual({
      count: null,
      face: null,
      rollsUsed: 2,
      straight: true,
    });
  });
});

describe('formatRollToBeatText', () => {
  it('uses digits for count and rollsUsed', () => {
    expect(formatRollToBeatText({ count: 3, face: 6, rollsUsed: 1, straight: 'none' })).toBe(
      '3 6s in 1 roll',
    );
    expect(formatRollToBeatText({ count: 1, face: 4, rollsUsed: 2, straight: 'none' })).toBe(
      '1 4 in 2 rolls',
    );
  });

  it('formats straights without a face', () => {
    expect(formatRollToBeatText({ count: 0, face: 1, rollsUsed: 1, straight: 'straight' })).toBe(
      'Straight in 1 roll',
    );
  });
});
