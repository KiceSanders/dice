import { describe, expect, it } from 'vitest';
import { effectiveStakeAmount, isAutoRaiseRound } from './stakes.js';

const settings = (betMultiplier: number, enabled = true, everyRounds = 7) => ({
  betMultiplier,
  autoIncrement: { enabled, everyRounds },
});

describe('isAutoRaiseRound', () => {
  it('fires only when an enabled period completes', () => {
    const s = settings(1);
    expect([1, 7, 8, 14, 15, 22].map((round) => isAutoRaiseRound(s, round))).toEqual([
      false,
      false,
      true,
      false,
      true,
      true,
    ]);
    expect(isAutoRaiseRound(settings(1, false), 8)).toBe(false);
  });
});

describe('effectiveStakeAmount', () => {
  it('uses configured amounts with multiplier 1 for rounds 1–7', () => {
    expect(effectiveStakeAmount(1, settings(1), 1)).toBe(1);
    expect(effectiveStakeAmount(4, settings(1), 7)).toBe(4);
  });

  it('adds 1 to every configured amount after each 7-round period at multiplier 1', () => {
    const s = settings(1);
    expect([1, 7, 8, 14, 15, 22].map((round) => effectiveStakeAmount(4, s, round))).toEqual([
      4, 4, 5, 5, 6, 7,
    ]);
  });

  it('scales the initial amount and each additive step by multiplier 2', () => {
    const s = settings(2);
    expect(effectiveStakeAmount(1, s, 1)).toBe(2);
    expect(effectiveStakeAmount(4, s, 1)).toBe(8);
    expect(effectiveStakeAmount(1, s, 8)).toBe(4);
    expect(effectiveStakeAmount(4, s, 8)).toBe(10);
    expect(effectiveStakeAmount(4, s, 15)).toBe(12);
  });

  it('scales the initial amount even when auto-raise is disabled', () => {
    expect(effectiveStakeAmount(4, settings(2, false), 50)).toBe(8);
  });

  it('clamps bad amount and multiplier inputs without inventing a bad interval', () => {
    expect(effectiveStakeAmount(-4, settings(0, true, 7), 1)).toBe(0);
    expect(effectiveStakeAmount(4, settings(0, true, 7), 8)).toBe(5);
    expect(effectiveStakeAmount(4, settings(2, true, 0), 100)).toBe(8);
  });
});
