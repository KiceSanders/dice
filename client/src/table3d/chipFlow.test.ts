import { describe, expect, it } from 'vitest';
import {
  animationProgress,
  CHIP_ANTE_STAGGER_MS,
  chipAnimationsEnabled,
  chipFlightPoint,
  lerpPoint,
  staggerDelay,
} from './chipFlow';

describe('chip flow timing', () => {
  it('disables motion when the user requests reduced motion', () => {
    expect(chipAnimationsEnabled(false)).toBe(true);
    expect(chipAnimationsEnabled(true)).toBe(false);
  });

  it('clamps progress before and after the animation window', () => {
    expect(animationProgress(900, 1_000, 500)).toBe(0);
    expect(animationProgress(1_250, 1_000, 500)).toBe(0.5);
    expect(animationProgress(2_000, 1_000, 500)).toBe(1);
  });

  it('spreads any number of coins across a bounded stagger window', () => {
    expect(staggerDelay(0, 3)).toBe(0);
    expect(staggerDelay(1, 3)).toBe(CHIP_ANTE_STAGGER_MS / 2);
    expect(staggerDelay(2, 3)).toBe(CHIP_ANTE_STAGGER_MS);
    expect(staggerDelay(2_999, 3_000)).toBe(CHIP_ANTE_STAGGER_MS);
  });
});

describe('chip flow paths', () => {
  const from = { x: 10, y: 80 };
  const to = { x: 90, y: 20 };

  it('starts and ends at the requested coordinates', () => {
    expect(chipFlightPoint(from, to, 0)).toEqual(from);
    expect(chipFlightPoint(from, to, 1)).toEqual(to);
    expect(lerpPoint(from, to, 0)).toEqual(from);
    expect(lerpPoint(from, to, 1)).toEqual(to);
  });

  it('arcs above the eased straight-line path while in flight', () => {
    const straightMidpoint = lerpPoint(from, to, 0.5);
    const flightMidpoint = chipFlightPoint(from, to, 0.5);
    expect(flightMidpoint.x).toBeCloseTo(straightMidpoint.x);
    expect(flightMidpoint.y).toBeLessThan(straightMidpoint.y);
  });
});
