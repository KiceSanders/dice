import type { HandScore } from '../types.js';

/** First-roll donation trigger: exactly four of a kind (wilds OK; Yahtzee does not qualify). */
export function isClassicDonation(score: HandScore): boolean {
  return score.count === 4;
}

/**
 * Classic win: three 6s on the first roll of the turn (wilds OK).
 * Engine only pays out while roll-to-beat is still unset.
 */
export function isClassicWin(score: HandScore): boolean {
  return score.rollsUsed === 1 && score.count === 3 && score.face === 6;
}
