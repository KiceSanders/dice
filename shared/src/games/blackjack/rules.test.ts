import { describe, expect, it } from 'vitest';
import type { BlackjackHand } from '../../types.js';
import { blackjackOutcome, blackjackPayout, isBlackjackDie } from './rules.js';

const hand = (playerId: string, total: number, stood = false): BlackjackHand => ({
  playerId,
  total,
  stood,
  dice: [],
});
describe('blackjack rules', () => {
  it('continues until a stand or bust makes the result certain', () => {
    expect(blackjackOutcome([hand('a', 20), hand('b', 3)])).toEqual({ type: 'play' });
    expect(blackjackOutcome([hand('a', 20, true), hand('b', 20)])).toEqual({ type: 'play' });
    expect(blackjackOutcome([hand('a', 20, true), hand('b', 21)])).toMatchObject({
      type: 'winner',
      winnerId: 'b',
    });
  });
  it('bust loses even if it is higher than a standing score', () => {
    expect(blackjackOutcome([hand('a', 22), hand('b', 2, true)])).toEqual({
      type: 'winner',
      winnerId: 'b',
      loserId: 'a',
      reason: 'bust',
    });
  });
  it('both standing ties and a lower voluntary stand resolve correctly', () => {
    expect(blackjackOutcome([hand('a', 18, true), hand('b', 18, true)])).toEqual({ type: 'tie' });
    expect(blackjackOutcome([hand('a', 18, true), hand('b', 17, true)])).toMatchObject({
      type: 'winner',
      winnerId: 'a',
    });
  });
  it('doubles again on every tie, without exceeding safe integer precision', () => {
    expect([0, 1, 2, 3, 4].map(blackjackPayout)).toEqual([10, 20, 40, 80, 160]);
    expect(Number.isSafeInteger(blackjackPayout(10_000))).toBe(true);
  });
  it('accepts only whole faces on the current die', () => {
    expect(isBlackjackDie(12, 12)).toBe(true);
    for (const face of [0, 7, 1.5, NaN, Infinity]) expect(isBlackjackDie(face, 6)).toBe(false);
  });
});
