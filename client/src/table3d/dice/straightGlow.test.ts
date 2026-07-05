import type { Die } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { glowDurationMs, glowEnvelope, STRAIGHT_GLOW, straightGlowOrder } from './straightGlow';

const h = (...dice: Die[]): Die[] => dice;

describe('straightGlowOrder', () => {
  it('orders a little straight by ascending face', () => {
    // [3,1,5,2,4]: face 1 is at index 1, face 2 at 3, 3 at 0, 4 at 4, 5 at 2.
    expect(straightGlowOrder(h(3, 1, 5, 2, 4))).toEqual([1, 3, 0, 4, 2]);
  });

  it('orders a big straight starting from face 2', () => {
    expect(straightGlowOrder(h(6, 5, 4, 3, 2))).toEqual([4, 3, 2, 1, 0]);
  });

  it('returns null for non-straights and wrong-sized hands', () => {
    expect(straightGlowOrder(h(1, 1, 3, 4, 5))).toBeNull();
    expect(straightGlowOrder(h(1, 3, 4, 5, 6))).toBeNull(); // wilds never fake a straight
    expect(straightGlowOrder(h(1, 2, 3, 4))).toBeNull();
    expect(straightGlowOrder([])).toBeNull();
  });
});

describe('glowEnvelope', () => {
  const { riseMs, holdMs, fadeMs } = STRAIGHT_GLOW;

  it('is dark before onset', () => {
    expect(glowEnvelope(-100)).toBe(0);
    expect(glowEnvelope(0)).toBe(0);
  });

  it('rises to full, holds, then fades to zero', () => {
    expect(glowEnvelope(riseMs / 2)).toBeCloseTo(0.5);
    expect(glowEnvelope(riseMs)).toBe(1);
    expect(glowEnvelope(riseMs + holdMs / 2)).toBe(1);
    expect(glowEnvelope(riseMs + holdMs + fadeMs / 2)).toBeCloseTo(0.5);
    expect(glowEnvelope(riseMs + holdMs + fadeMs)).toBe(0);
    expect(glowEnvelope(riseMs + holdMs + fadeMs + 1_000)).toBe(0);
  });

  it('honors a custom hold (reduced-motion path)', () => {
    const hold = STRAIGHT_GLOW.reducedHoldMs;
    expect(glowEnvelope(riseMs + hold - 1, hold)).toBe(1);
    expect(glowEnvelope(riseMs + hold + fadeMs, hold)).toBe(0);
  });
});

describe('glowDurationMs', () => {
  const { stepMs, riseMs, holdMs, fadeMs, reducedHoldMs } = STRAIGHT_GLOW;

  it('spans the last die of a staggered sequence', () => {
    expect(glowDurationMs(5, false)).toBe(4 * stepMs + riseMs + holdMs + fadeMs);
  });

  it('is a single shared window under reduced motion', () => {
    expect(glowDurationMs(5, true)).toBe(riseMs + reducedHoldMs + fadeMs);
  });
});
