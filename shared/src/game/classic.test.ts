import { describe, expect, it } from 'vitest';
import type { HandScore } from '../types.js';
import { isClassicDonation, isClassicWin } from './classic.js';

const score = (partial: Partial<HandScore> & Pick<HandScore, 'count' | 'face'>): HandScore => ({
  rollsUsed: 1,
  straight: 'none',
  ...partial,
});

describe('isClassicDonation', () => {
  it('is true for exactly four of a kind', () => {
    expect(isClassicDonation(score({ count: 4, face: 3 }))).toBe(true);
    expect(isClassicDonation(score({ count: 4, face: 6 }))).toBe(true);
  });

  it('is false for Yahtzee and weaker groups', () => {
    expect(isClassicDonation(score({ count: 5, face: 6 }))).toBe(false);
    expect(isClassicDonation(score({ count: 3, face: 6 }))).toBe(false);
    expect(isClassicDonation(score({ count: 2, face: 4 }))).toBe(false);
  });
});

describe('isClassicWin', () => {
  it('is true for three 6s', () => {
    expect(isClassicWin(score({ count: 3, face: 6 }))).toBe(true);
  });

  it('is false for other triples, fours, or Yahtzees of 6', () => {
    expect(isClassicWin(score({ count: 3, face: 5 }))).toBe(false);
    expect(isClassicWin(score({ count: 4, face: 6 }))).toBe(false);
    expect(isClassicWin(score({ count: 5, face: 6 }))).toBe(false);
    expect(isClassicWin(score({ count: 2, face: 6 }))).toBe(false);
  });
});
