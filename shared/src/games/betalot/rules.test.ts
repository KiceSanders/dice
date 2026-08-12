import { describe, expect, it } from 'vitest';
import { DEFAULT_BETALOT_SETTINGS, type Die } from '../../types.js';
import {
  allSameExtraPayoutForDiceCount,
  allSamePayoutForDiceCount,
  BETALOT_FIRE_WINS,
  firePaymentAmount,
  isAllSame,
  isFullHouse,
  isStraight,
  lossPayoutForDiceCount,
  onFireAfterWin,
  overTwentyFivePayout,
  requiresExtraRoll,
  straightPayoutForDiceCount,
  sumDice,
} from './rules.js';

describe('Bet-a-lot rules', () => {
  it('sums literal dice', () => {
    expect(sumDice([1, 2, 3] as Die[])).toBe(6);
  });

  it('recognizes literal consecutive straights only', () => {
    expect(isStraight([1, 2, 3])).toBe(true);
    expect(isStraight([2, 3, 4, 5, 6])).toBe(true);
    expect(isStraight([1, 2, 2])).toBe(false);
  });

  it('recognizes all-same and its extra-roll threshold', () => {
    expect(isAllSame([4, 4] as Die[])).toBe(true);
    expect(requiresExtraRoll([4, 4] as Die[])).toBe(false);
    expect(requiresExtraRoll([4, 4, 4] as Die[])).toBe(true);
  });

  it('recognizes exactly a five-die full house', () => {
    expect(isFullHouse([2, 2, 3, 3, 3] as Die[])).toBe(true);
    expect(isFullHouse([2, 2, 2, 2, 3] as Die[])).toBe(false);
  });

  it('uses the configured payout ladders', () => {
    expect(lossPayoutForDiceCount(DEFAULT_BETALOT_SETTINGS, 2)).toBe(5);
    expect(lossPayoutForDiceCount(DEFAULT_BETALOT_SETTINGS, 6)).toBe(1);
    expect(straightPayoutForDiceCount(DEFAULT_BETALOT_SETTINGS, 6)).toBe(20);
    expect(allSamePayoutForDiceCount(DEFAULT_BETALOT_SETTINGS, 5)).toBe(5);
    expect(allSameExtraPayoutForDiceCount(DEFAULT_BETALOT_SETTINGS, 4)).toBe(20);
  });

  it('pays two chips per point over twenty-five by default', () => {
    expect(overTwentyFivePayout(DEFAULT_BETALOT_SETTINGS, 25)).toBe(0);
    expect(overTwentyFivePayout(DEFAULT_BETALOT_SETTINGS, 28)).toBe(6);
  });

  it('arms fire after three consecutive round wins', () => {
    expect(BETALOT_FIRE_WINS).toBe(3);
    expect(onFireAfterWin(2)).toBe(false);
    expect(onFireAfterWin(3)).toBe(true);
    expect(onFireAfterWin(4)).toBe(true);
  });

  it('doubles opponent payments owed to the on-fire player', () => {
    expect(firePaymentAmount(5, 'b', 'a')).toBe(10);
    expect(firePaymentAmount(5, 'a', 'a')).toBe(5);
    expect(firePaymentAmount(5, 'b', null)).toBe(5);
  });
});
