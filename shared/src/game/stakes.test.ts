import { describe, expect, it } from 'vitest';
import { effectiveMultiplier } from './stakes.js';

const settings = (betMultiplier: number, enabled: boolean, everyRounds: number) => ({
  betMultiplier,
  autoIncrement: { enabled, everyRounds },
});

describe('effectiveMultiplier', () => {
  it('returns the base multiplier while auto-increment is off', () => {
    expect(effectiveMultiplier(settings(1, false, 7), 1)).toBe(1);
    expect(effectiveMultiplier(settings(3, false, 7), 50)).toBe(3);
  });

  it('bumps +1 every everyRounds rounds (defaults: every 7)', () => {
    const s = settings(1, true, 7);
    expect(effectiveMultiplier(s, 1)).toBe(1);
    expect(effectiveMultiplier(s, 7)).toBe(1);
    expect(effectiveMultiplier(s, 8)).toBe(2);
    expect(effectiveMultiplier(s, 14)).toBe(2);
    expect(effectiveMultiplier(s, 15)).toBe(3);
    expect(effectiveMultiplier(s, 22)).toBe(4);
  });

  it('steps by the base multiplier when it is raised', () => {
    const s = settings(3, true, 2);
    expect(effectiveMultiplier(s, 1)).toBe(3);
    expect(effectiveMultiplier(s, 2)).toBe(3);
    expect(effectiveMultiplier(s, 3)).toBe(6);
    expect(effectiveMultiplier(s, 5)).toBe(9);
  });

  it('never returns below 1 and tolerates bad inputs', () => {
    expect(effectiveMultiplier(settings(0, false, 7), 1)).toBe(1);
    expect(effectiveMultiplier(settings(-5, true, 7), 8)).toBe(2);
    expect(effectiveMultiplier(settings(1, true, 0), 100)).toBe(1);
    expect(effectiveMultiplier(settings(1, true, 7), 0)).toBe(1);
  });

  it('walks whole periods: base 2 every 3 rounds → 2, 2, 2, 4, 4, 4, 6', () => {
    const s = settings(2, true, 3);
    expect([1, 3, 4, 6, 7].map((n) => effectiveMultiplier(s, n))).toEqual([2, 2, 4, 4, 6]);
  });
});
