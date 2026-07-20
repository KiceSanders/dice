import type { HandScore } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { isYahtzeeBonusSpecialMoment, specialMomentsForRoll } from './specialMoments.js';

const score = (patch: Partial<HandScore>): HandScore => ({
  count: 2,
  face: 3,
  rollsUsed: 1,
  straight: 'none',
  ...patch,
});

describe('specialMomentsForRoll', () => {
  it('recognizes enabled instant bets even when their chip amount is zero', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      straightPayout: { enabled: true, amountPerPlayer: 0 },
      classicPot: { enabled: true, donationAmount: 0 },
      firstRollYahtzeePayout: { enabled: true, amountPerPlayer: 0 },
    };
    expect(
      specialMomentsForRoll({
        settings,
        score: score({ straight: 'straight' }),
        straightKind: 'straight',
        straightAwarded: true,
        classicWinEligible: true,
      }),
    ).toEqual(['straight']);
    expect(
      specialMomentsForRoll({
        settings,
        score: score({ count: 3, face: 6 }),
        straightKind: 'none',
        straightAwarded: false,
        classicWinEligible: true,
      }),
    ).toEqual(['classic']);
    expect(
      specialMomentsForRoll({
        settings,
        score: score({ count: 5, face: 6 }),
        straightKind: 'none',
        straightAwarded: false,
        classicWinEligible: true,
      }),
    ).toEqual(['first-roll-yahtzee']);
  });

  it('requires the matching bet to be enabled and Classic eligibility to hold', () => {
    expect(
      specialMomentsForRoll({
        settings: { ...DEFAULT_SETTINGS, classicPot: { enabled: false, donationAmount: 1 } },
        score: score({ count: 3, face: 6 }),
        straightKind: 'none',
        straightAwarded: false,
        classicWinEligible: true,
      }),
    ).toEqual([]);
    expect(
      specialMomentsForRoll({
        settings: DEFAULT_SETTINGS,
        score: score({ count: 3, face: 6 }),
        straightKind: 'none',
        straightAwarded: false,
        classicWinEligible: false,
      }),
    ).toEqual([]);
  });
});

describe('isYahtzeeBonusSpecialMoment', () => {
  it('requires an enabled literal match, not a positive payout', () => {
    expect(isYahtzeeBonusSpecialMoment(DEFAULT_SETTINGS, true)).toBe(true);
    expect(isYahtzeeBonusSpecialMoment(DEFAULT_SETTINGS, false)).toBe(false);
    expect(
      isYahtzeeBonusSpecialMoment(
        { ...DEFAULT_SETTINGS, yahtzeeBonus: { enabled: false, amountPerPlayer: 3 } },
        true,
      ),
    ).toBe(false);
  });
});
