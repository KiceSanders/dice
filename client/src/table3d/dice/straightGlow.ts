import { type Die, detectStraight } from '@dice/shared';

/**
 * Straight celebration: when a roll settles showing a straight, the five dice
 * light up one-by-one in ascending face order. Pure timing/order helpers live
 * here; useStraightGlow drives them per frame.
 */
export const STRAIGHT_GLOW = {
  /** Warm gold matching the table's accent point light. */
  color: '#ffc94d',
  /** Peak emissiveIntensity — tuned against the dark scene + ACES tone mapping. */
  maxIntensity: 1.1,
  /** Delay between one die's onset and the next (ascending face order). */
  stepMs: 180,
  riseMs: 100,
  holdMs: 300,
  fadeMs: 450,
  /** Reduced motion: all dice rise together and hold longer — no stagger. */
  reducedHoldMs: 1200,
  /** Ignore celebration cues older than this (late joins, stale re-renders). */
  cueMaxAgeMs: 8_000,
} as const;

/**
 * Per-die glow level written by the sequencer and read by PipDie inside
 * useFrame. A mutable handle instead of React state so the animation survives
 * the DieBody dynamic→locked key remount at settle and never re-renders.
 */
export interface GlowHandle {
  current: number;
}

/**
 * Die indices in ascending face order for a straight hand, or null when the
 * dice are not a straight. Straight faces are unique, so index lookup is
 * unambiguous: e.g. [3,1,5,2,4] → [1,3,0,4,2] (the die showing 1 first).
 */
export function straightGlowOrder(dice: Die[]): number[] | null {
  if (detectStraight(dice) === 'none') return null;
  const sorted = [...dice].sort((a, b) => a - b);
  return sorted.map((face) => dice.indexOf(face));
}

/** Glow level (0..1) for a die, given ms since its own onset. */
export function glowEnvelope(msSinceOnset: number, holdMs: number = STRAIGHT_GLOW.holdMs): number {
  const { riseMs, fadeMs } = STRAIGHT_GLOW;
  if (msSinceOnset <= 0) return 0;
  if (msSinceOnset < riseMs) return msSinceOnset / riseMs;
  if (msSinceOnset < riseMs + holdMs) return 1;
  if (msSinceOnset < riseMs + holdMs + fadeMs) return 1 - (msSinceOnset - riseMs - holdMs) / fadeMs;
  return 0;
}

/** Total sequence lifetime from the first die's onset to the last die going dark. */
export function glowDurationMs(dieCount: number, reducedMotion: boolean): number {
  const { stepMs, riseMs, holdMs, fadeMs, reducedHoldMs } = STRAIGHT_GLOW;
  return reducedMotion
    ? riseMs + reducedHoldMs + fadeMs
    : (dieCount - 1) * stepMs + riseMs + holdMs + fadeMs;
}
