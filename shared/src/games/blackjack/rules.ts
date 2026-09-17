import type { BlackjackHand, DieSides } from '../../types.js';

export const BLACKJACK_TARGET = 21;
export const BLACKJACK_BASE_PAYOUT = 10;

export function blackjackPayout(overtime: number): number {
  // Beyond safe integer precision, every possible room stack is already all-in.
  return Math.min(Number.MAX_SAFE_INTEGER, BLACKJACK_BASE_PAYOUT * 2 ** Math.min(overtime, 50));
}

export function isBlackjackDie(value: number, sides: DieSides): boolean {
  return Number.isInteger(value) && value >= 1 && value <= sides;
}

export type BlackjackOutcome =
  | { type: 'winner'; winnerId: string; loserId: string; reason: 'bust' | 'higher' }
  | { type: 'tie' }
  | { type: 'play' };

/** Also checks an already-standing opponent immediately after a new roll. */
export function blackjackOutcome(hands: readonly BlackjackHand[]): BlackjackOutcome {
  const [a, b] = hands;
  if (!a || !b) return { type: 'play' };
  for (const [hand, other] of [
    [a, b],
    [b, a],
  ] as const) {
    if (hand.total > BLACKJACK_TARGET) {
      return { type: 'winner', winnerId: other.playerId, loserId: hand.playerId, reason: 'bust' };
    }
  }
  for (const [hand, other] of [
    [a, b],
    [b, a],
  ] as const) {
    if (other.stood && hand.total > other.total) {
      return { type: 'winner', winnerId: hand.playerId, loserId: other.playerId, reason: 'higher' };
    }
  }
  return a.stood && b.stood ? { type: 'tie' } : { type: 'play' };
}
