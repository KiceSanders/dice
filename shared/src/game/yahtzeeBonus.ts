import type { Die, HandScore } from '../types.js';
import { HAND_SIZE } from './dice.js';

/**
 * Face the Yahtzee bonus die must literally match (a rolled 1 is NOT wild
 * here), or null when the hand is not a Yahtzee. Wild-composed quints count:
 * 6,6,6,1,1 scores five 6s → target 6; 1,1,1,1,1 scores five 6s → target 6.
 * See docs/GAME_RULES.md "Yahtzee bonus".
 */
export function yahtzeeBonusTarget(score: HandScore): Die | null {
  return score.count === HAND_SIZE ? score.face : null;
}
