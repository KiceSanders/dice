import type { Die, HandScore } from '../types.js';
import { compareHands } from './compare.js';
import { HAND_SIZE } from './dice.js';
import { scoreHand } from './score.js';

/**
 * Voluntary stand rule: a player may end their turn after any roll, unless a
 * roll-to-beat exists and their current hand loses to it — then they must keep
 * rolling until they beat it, tie it (ties force a sub-round), or run out of
 * rolls. Forced stands (roll cap, last-player beat, keep-all, disconnect, kick)
 * bypass this rule.
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

/**
 * Forced stand: the last remaining player in the round/sub-round has already
 * beaten the roll-to-beat, so further rolls cannot change who wins the pot.
 * Ties do not trigger this — the last player may keep rolling to try to win
 * outright instead of forcing a sub-round.
 */
export function mustAutoStandLastPlayerBeat(
  dice: Die[],
  rollsUsed: number,
  rollToBeat: HandScore | null,
  isLastPlayer: boolean,
): boolean {
  if (!isLastPlayer || rollToBeat === null) return false;
  if (rollsUsed < 1 || dice.length !== HAND_SIZE) return false;
  return compareHands(scoreHand(dice, rollsUsed), rollToBeat) > 0;
}
