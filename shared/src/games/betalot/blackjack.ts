export const BETALOT_BLACKJACK_INTERVAL = 10;

/** Called only at a completed ladder boundary; the served marker prevents repeats. */
export function isBlackjackBonusDue(completedRound: number, lastBonusRound: number): boolean {
  return (
    completedRound > 0 &&
    completedRound % BETALOT_BLACKJACK_INTERVAL === 0 &&
    completedRound > lastBonusRound
  );
}
