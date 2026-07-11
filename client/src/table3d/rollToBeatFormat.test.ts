import { describe, expect, it } from 'vitest';
import { formatRollToBeatText, summarizeRollToBeat } from './rollToBeatFormat';

describe('summarizeRollToBeat', () => {
  it('exposes digit count and face for a group hand', () => {
    expect(summarizeRollToBeat({ count: 3, face: 6, rollsUsed: 1, straight: 'none' })).toEqual({
      kind: 'group',
      count: 3,
      face: 6,
      rollsUsed: 1,
    });
  });

  it('uses the group score under a straight (not a Straight label)', () => {
    expect(summarizeRollToBeat({ count: 1, face: 6, rollsUsed: 2, straight: 'straight' })).toEqual({
      kind: 'group',
      count: 1,
      face: 6,
      rollsUsed: 2,
    });
    expect(summarizeRollToBeat({ count: 2, face: 5, rollsUsed: 1, straight: 'straight' })).toEqual({
      kind: 'group',
      count: 2,
      face: 5,
      rollsUsed: 1,
    });
  });

  it('labels five of a kind as Yahtzee (face omitted)', () => {
    expect(summarizeRollToBeat({ count: 5, face: 2, rollsUsed: 1, straight: 'none' })).toEqual({
      kind: 'yahtzee',
      rollsUsed: 1,
    });
    expect(summarizeRollToBeat({ count: 5, face: 6, rollsUsed: 3, straight: 'none' })).toEqual({
      kind: 'yahtzee',
      rollsUsed: 3,
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

  it('formats straight groups as count + face', () => {
    expect(formatRollToBeatText({ count: 1, face: 6, rollsUsed: 1, straight: 'straight' })).toBe(
      '1 6 in 1 roll',
    );
    expect(formatRollToBeatText({ count: 2, face: 5, rollsUsed: 3, straight: 'straight' })).toBe(
      '2 5s in 3 rolls',
    );
  });

  it('formats five of a kind as Yahtzee', () => {
    expect(formatRollToBeatText({ count: 5, face: 2, rollsUsed: 1, straight: 'none' })).toBe(
      'Yahtzee in 1 roll',
    );
    expect(formatRollToBeatText({ count: 5, face: 6, rollsUsed: 3, straight: 'none' })).toBe(
      'Yahtzee in 3 rolls',
    );
  });
});
