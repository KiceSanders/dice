import type { Die, HandScore } from '../types.js';
import { HAND_SIZE } from './dice.js';
import { compareHands } from './compare.js';
import { scoreHand } from './score.js';

/**
 * Voluntary stand rule: a player may end their turn after any roll, unless a
 * roll-to-beat exists and their current hand loses to it — then they must keep
 * rolling until they beat it, tie it (ties force a sub-round), or run out of
 * rolls. Forced stands (roll cap, keep-all, timeout, disconnect, kick) bypass
 * this rule.
 */
export function canStandVoluntarily(
  dice: Die[],
  rollsUsed: number,
  rollToBeat: HandScore | null,
): boolean {
  if (rollsUsed < 1 || dice.length !== HAND_SIZE) return false;
  if (rollToBeat === null) return true;
  return compareHands(scoreHand(dice, rollsUsed), rollToBeat) >= 0;
}
