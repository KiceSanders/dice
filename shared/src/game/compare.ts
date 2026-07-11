import type { HandScore } from '../types.js';

/**
 * Canonical hand ordering (docs/GAME_RULES.md):
 *   1. larger group count
 *   2. higher face (skipped when both hands are Yahtzees — count === 5)
 *   3. fewer rolls used
 * Returns 1 if a beats b, -1 if b beats a, 0 on a full tie.
 *
 * `HandScore.straight` is ignored — straights are a payout-only modifier, not a rank.
 */
export function compareHands(a: HandScore, b: HandScore): -1 | 0 | 1 {
  if (a.count !== b.count) return a.count > b.count ? 1 : -1;
  if (a.count !== 5 && a.face !== b.face) return a.face > b.face ? 1 : -1;
  if (a.rollsUsed !== b.rollsUsed) return a.rollsUsed < b.rollsUsed ? 1 : -1;
  return 0;
}
