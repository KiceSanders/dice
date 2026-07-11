import type { HandScore } from '../types.js';

/** First-roll donation trigger: exactly four of a kind (wilds OK; Yahtzee does not qualify). */
export function isClassicDonation(score: HandScore): boolean {
  return score.count === 4;
}

/** Classic win: three 6s (wilds OK) — only paid out while roll-to-beat is unset. */
export function isClassicWin(score: HandScore): boolean {
  return score.count === 3 && score.face === 6;
}
