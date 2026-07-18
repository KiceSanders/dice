import { DEFAULT_SETTINGS } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { fillEmptySettings } from './SettingsFields';

describe('fillEmptySettings', () => {
  it('leaves finite values alone', () => {
    expect(fillEmptySettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('replaces empty (NaN) number fields with 0', () => {
    const draft = {
      ...DEFAULT_SETTINGS,
      chipsPerRound: Number.NaN,
      afterRollDelayMs: Number.NaN,
      straightPayout: { ...DEFAULT_SETTINGS.straightPayout, amountPerPlayer: Number.NaN },
      classicPot: { ...DEFAULT_SETTINGS.classicPot, donationAmount: Number.NaN },
    };
    const filled = fillEmptySettings(draft);
    expect(filled.chipsPerRound).toBe(0);
    expect(filled.afterRollDelayMs).toBe(0);
    expect(filled.straightPayout.amountPerPlayer).toBe(0);
    expect(filled.classicPot.donationAmount).toBe(0);
    expect(filled.maxRolls).toBe(DEFAULT_SETTINGS.maxRolls);
  });
});
