import { describe, expect, it } from 'vitest';
import type { Die, HandScore, StraightKind } from '../types.js';
import { compareHands } from './compare.js';

function hand(count: number, face: Die, rollsUsed = 1, straight: StraightKind = 'none'): HandScore {
  return { count, face, rollsUsed, straight };
}

describe('compareHands', () => {
  // Tiebreak level 1: count
  it('more of a kind wins', () => {
    expect(compareHands(hand(4, 2), hand(3, 6))).toBe(1);
    expect(compareHands(hand(2, 6), hand(5, 1))).toBe(-1);
  });

  // Tiebreak level 2: face
  it('equal counts: higher face wins', () => {
    expect(compareHands(hand(3, 6), hand(3, 5))).toBe(1);
    expect(compareHands(hand(2, 2), hand(2, 4))).toBe(-1);
  });

  // Tiebreak level 3: rollsUsed
  it('equal count and face: fewer rolls wins', () => {
    expect(compareHands(hand(3, 4, 1), hand(3, 4, 2))).toBe(1);
    expect(compareHands(hand(3, 4, 3), hand(3, 4, 2))).toBe(-1);
  });

  // Tiebreak level 4: full tie
  it('identical scores tie', () => {
    expect(compareHands(hand(3, 4, 2), hand(3, 4, 2))).toBe(0);
  });

  it('ignores the straight flag — five of a kind beats a stood straight group', () => {
    const highStraight = hand(1, 6, 1, 'straight'); // 2-3-4-5-6
    const lowStraight = hand(2, 5, 1, 'straight'); // 1-2-3-4-5
    const fiveSixes = hand(5, 6, 1);
    expect(compareHands(fiveSixes, highStraight)).toBe(1);
    expect(compareHands(highStraight, fiveSixes)).toBe(-1);
    expect(compareHands(fiveSixes, lowStraight)).toBe(1);
  });

  it('straight groups compare on count → face → rolls like any hand', () => {
    // Low straight (2 fives) beats high straight (1 six) on count.
    expect(compareHands(hand(2, 5, 1, 'straight'), hand(1, 6, 1, 'straight'))).toBe(1);
    expect(compareHands(hand(1, 6, 1, 'straight'), hand(2, 5, 2, 'straight'))).toBe(-1);
    // Equal groups: fewer rolls wins.
    expect(compareHands(hand(1, 6, 1, 'straight'), hand(1, 6, 2, 'straight'))).toBe(1);
  });

  it('equal straight groups with equal rollsUsed are a full tie', () => {
    expect(compareHands(hand(1, 6, 2, 'straight'), hand(1, 6, 2, 'none'))).toBe(0);
    expect(compareHands(hand(2, 5, 1, 'straight'), hand(2, 5, 1, 'straight'))).toBe(0);
  });
});
