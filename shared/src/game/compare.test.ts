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

  it('any straight beats any non-straight, even five of a kind', () => {
    const little = hand(1, 5, 3, 'little');
    const fiveSixes = hand(5, 6, 1);
    expect(compareHands(little, fiveSixes)).toBe(1);
    expect(compareHands(fiveSixes, little)).toBe(-1);
  });

  it('big straight beats little straight regardless of rolls', () => {
    expect(compareHands(hand(1, 6, 3, 'big'), hand(1, 5, 1, 'little'))).toBe(1);
  });

  it('equal straights compare on rollsUsed only', () => {
    expect(compareHands(hand(1, 6, 1, 'big'), hand(1, 6, 2, 'big'))).toBe(1);
    expect(compareHands(hand(1, 5, 3, 'little'), hand(1, 5, 2, 'little'))).toBe(-1);
  });

  it('equal straights with equal rollsUsed are a full tie', () => {
    expect(compareHands(hand(1, 6, 2, 'big'), hand(1, 6, 2, 'big'))).toBe(0);
    expect(compareHands(hand(1, 5, 1, 'little'), hand(1, 5, 1, 'little'))).toBe(0);
  });
});
