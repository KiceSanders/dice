import { describe, expect, it } from 'vitest';
import { isFirstRollYahtzee } from './firstRollYahtzee.js';
import { scoreHand } from './score.js';

describe('isFirstRollYahtzee', () => {
  it('accepts natural and wild-composed Yahtzees on the first roll', () => {
    expect(isFirstRollYahtzee(scoreHand([6, 6, 6, 6, 6], 1))).toBe(true);
    expect(isFirstRollYahtzee(scoreHand([6, 6, 6, 1, 1], 1))).toBe(true);
    expect(isFirstRollYahtzee(scoreHand([1, 1, 1, 1, 1], 1))).toBe(true);
  });

  it('rejects non-Yahtzees and later Yahtzees', () => {
    expect(isFirstRollYahtzee(scoreHand([6, 6, 6, 6, 5], 1))).toBe(false);
    expect(isFirstRollYahtzee(scoreHand([6, 6, 6, 1, 1], 2))).toBe(false);
  });
});
