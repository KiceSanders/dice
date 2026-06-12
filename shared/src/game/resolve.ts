import type { HandScore, PlayerId } from '../types.js';
import { compareHands } from './compare.js';

/**
 * Find the best hand(s) of a (sub-)round.
 * `winners.length > 1` means a tie → the caller starts a sub-round.
 */
export function resolveRound(hands: Map<PlayerId, HandScore>): { winners: PlayerId[] } {
  if (hands.size === 0) {
    throw new Error('resolveRound called with no hands');
  }

  let best: HandScore | null = null;
  let winners: PlayerId[] = [];

  for (const [playerId, score] of hands) {
    if (best === null) {
      best = score;
      winners = [playerId];
      continue;
    }
    const cmp = compareHands(score, best);
    if (cmp > 0) {
      best = score;
      winners = [playerId];
    } else if (cmp === 0) {
      winners.push(playerId);
    }
  }

  return { winners };
}
