import type { HandScore } from '../types.js';

/** A first-roll Yahtzee (including wild-composed quints) qualifies for the instant payout. */
export function isFirstRollYahtzee(score: HandScore): boolean {
  return score.rollsUsed === 1 && score.count === 5;
}
