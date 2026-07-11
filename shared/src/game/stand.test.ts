import { describe, expect, it } from 'vitest';
import type { Die } from '../types.js';
import { scoreHand } from './score.js';
import { canStandVoluntarily } from './stand.js';

const hand = (...dice: number[]) => dice as Die[];

describe('canStandVoluntarily', () => {
  it('rejects before the first roll', () => {
    expect(canStandVoluntarily(hand(), 0, null)).toBe(false);
    expect(canStandVoluntarily(hand(1, 2, 3, 4, 6), 0, null)).toBe(false);
  });

  it('allows standing after any roll when there is no roll to beat', () => {
    expect(canStandVoluntarily(hand(1, 2, 3, 4, 6), 1, null)).toBe(true);
  });

  it('allows standing when beating the roll to beat', () => {
    const toBeat = scoreHand(hand(3, 3, 1, 2, 4), 1); // three 3s (1 is wild)
    expect(canStandVoluntarily(hand(5, 5, 5, 1, 2), 2, toBeat)).toBe(true); // four 5s
  });

  it('allows standing on a full tie (forces the sub-round)', () => {
    const toBeat = scoreHand(hand(4, 4, 4, 1, 2), 2); // four 4s in 2 rolls
    expect(canStandVoluntarily(hand(4, 4, 4, 2, 1), 2, toBeat)).toBe(true);
  });

  it('allows standing on a Yahtzee that ties or beats another Yahtzee on rolls', () => {
    const toBeat = scoreHand(hand(5, 5, 5, 5, 5), 2); // five 5s in 2 rolls
    expect(canStandVoluntarily(hand(2, 2, 2, 2, 2), 2, toBeat)).toBe(true); // face-agnostic tie
    expect(canStandVoluntarily(hand(2, 2, 2, 2, 2), 1, toBeat)).toBe(true); // fewer rolls
    expect(canStandVoluntarily(hand(2, 2, 2, 2, 2), 3, toBeat)).toBe(false); // more rolls
  });

  it('rejects standing while losing to the roll to beat', () => {
    const toBeat = scoreHand(hand(6, 6, 6, 1, 2), 1); // four 6s
    expect(canStandVoluntarily(hand(5, 5, 1, 2, 3), 1, toBeat)).toBe(false); // three 5s
  });

  it('treats a slower equal hand as losing (rollsUsed tiebreak)', () => {
    const toBeat = scoreHand(hand(4, 4, 4, 1, 2), 1); // four 4s in 1 roll
    expect(canStandVoluntarily(hand(4, 4, 4, 2, 1), 2, toBeat)).toBe(false);
  });

  it('treats a stood straight as its weak group (not a super-rank)', () => {
    const toBeat = scoreHand(hand(2, 3, 4, 5, 6), 1); // high straight → one 6
    expect(toBeat).toMatchObject({ count: 1, face: 6, straight: 'straight' });
    expect(canStandVoluntarily(hand(6, 6, 6, 6, 6), 2, toBeat)).toBe(true); // five 6s
    expect(canStandVoluntarily(hand(5, 5, 2, 3, 4), 1, toBeat)).toBe(true); // two 5s
    expect(canStandVoluntarily(hand(2, 3, 4, 5, 6), 1, toBeat)).toBe(true); // tie on one 6
    expect(canStandVoluntarily(hand(2, 3, 4, 5, 6), 2, toBeat)).toBe(false); // same group, more rolls
  });
});
