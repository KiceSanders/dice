import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../types.js';
import { raiseStakes, shouldRaiseStakes } from './stakes.js';

describe('shouldRaiseStakes', () => {
  it('fires on the round after each full period (defaults: every 7)', () => {
    const auto = { enabled: true, everyRounds: 7 };
    expect([1, 2, 7, 8, 9, 14, 15, 22].map((n) => shouldRaiseStakes(auto, n))).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      true,
      true,
    ]);
  });

  it('never fires when disabled or with a bad interval', () => {
    expect(shouldRaiseStakes({ enabled: false, everyRounds: 7 }, 8)).toBe(false);
    expect(shouldRaiseStakes({ enabled: true, everyRounds: 0 }, 8)).toBe(false);
  });
});

describe('raiseStakes', () => {
  it('multiplies the ante and all four instant bet amounts by betMultiplier', () => {
    const raised = raiseStakes({ ...DEFAULT_SETTINGS, betMultiplier: 2 });
    expect(raised.chipsPerRound).toBe(2);
    expect(raised.straightPayout.amountPerPlayer).toBe(6);
    expect(raised.classicPot.donationAmount).toBe(2);
    expect(raised.yahtzeeBonus.amountPerPlayer).toBe(6);
    expect(raised.firstRollYahtzeePayout.amountPerPlayer).toBe(8);
  });

  it('leaves everything else untouched and does not mutate the input', () => {
    const input = { ...DEFAULT_SETTINGS, betMultiplier: 3 };
    const raised = raiseStakes(input);
    expect(raised.maxRolls).toBe(input.maxRolls);
    expect(raised.minBuyIn).toBe(input.minBuyIn);
    expect(raised.betMultiplier).toBe(3);
    expect(raised.autoIncrement).toEqual(input.autoIncrement);
    expect(input.chipsPerRound).toBe(DEFAULT_SETTINGS.chipsPerRound);
  });

  it('compounds when applied repeatedly (next raise builds on stored values)', () => {
    const once = raiseStakes({ ...DEFAULT_SETTINGS, betMultiplier: 2 });
    const twice = raiseStakes(once);
    expect(twice.chipsPerRound).toBe(4);
    expect(twice.straightPayout.amountPerPlayer).toBe(12);
  });

  it('is a no-op at multiplier 1 and clamps a bad multiplier up to 1', () => {
    expect(raiseStakes({ ...DEFAULT_SETTINGS, betMultiplier: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      betMultiplier: 1,
    });
    expect(raiseStakes({ ...DEFAULT_SETTINGS, betMultiplier: 0 }).chipsPerRound).toBe(1);
  });

  it('caps raised amounts at the clamp ceilings', () => {
    const raised = raiseStakes({
      ...DEFAULT_SETTINGS,
      betMultiplier: 1000,
      chipsPerRound: 1000,
      straightPayout: { enabled: true, amountPerPlayer: 100_000 },
    });
    expect(raised.chipsPerRound).toBe(1000);
    expect(raised.straightPayout.amountPerPlayer).toBe(100_000);
  });
});
