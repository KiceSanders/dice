import type { HandScore, StraightKind } from '../types.js';

const STRAIGHT_RANK: Record<StraightKind, number> = { none: 0, little: 1, big: 2 };

/**
 * Canonical hand ordering (PLAN.md):
 *   1. straights beat non-straights; big > little
 *   2. larger group count
 *   3. higher face
 *   4. fewer rolls used
 * Returns 1 if a beats b, -1 if b beats a, 0 on a full tie.
 */
export function compareHands(a: HandScore, b: HandScore): -1 | 0 | 1 {
  const straightDiff = STRAIGHT_RANK[a.straight] - STRAIGHT_RANK[b.straight];
  if (straightDiff !== 0) return straightDiff > 0 ? 1 : -1;

  // Equal straights compare only on rollsUsed; non-straights use count → face first.
  if (a.straight === 'none') {
    if (a.count !== b.count) return a.count > b.count ? 1 : -1;
    if (a.face !== b.face) return a.face > b.face ? 1 : -1;
  }

  if (a.rollsUsed !== b.rollsUsed) return a.rollsUsed < b.rollsUsed ? 1 : -1;
  return 0;
}
