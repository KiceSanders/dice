import { describe, expect, it } from 'vitest';
import type { HandScore } from '../types.js';
import { scoreHand } from './score.js';
import { yahtzeeBonusTarget } from './yahtzeeBonus.js';

const score = (partial: Partial<HandScore> & Pick<HandScore, 'count' | 'face'>): HandScore => ({
  rollsUsed: 1,
  straight: 'none',
  ...partial,
});

describe('yahtzeeBonusTarget', () => {
  it('targets the quint face for a natural Yahtzee', () => {
    expect(yahtzeeBonusTarget(score({ count: 5, face: 5 }))).toBe(5);
    expect(yahtzeeBonusTarget(score({ count: 5, face: 2 }))).toBe(2);
  });

  it('is null for anything below five of a kind', () => {
    expect(yahtzeeBonusTarget(score({ count: 4, face: 6 }))).toBeNull();
    expect(yahtzeeBonusTarget(score({ count: 3, face: 6 }))).toBeNull();
    expect(yahtzeeBonusTarget(score({ count: 2, face: 4 }))).toBeNull();
  });

  it('counts wild-composed quints, targeting the scored face', () => {
    expect(yahtzeeBonusTarget(scoreHand([6, 6, 6, 1, 1], 1))).toBe(6);
    expect(yahtzeeBonusTarget(scoreHand([1, 3, 3, 3, 1], 1))).toBe(3);
    // All wilds score as five 6s (docs/GAME_RULES.md "wilds").
    expect(yahtzeeBonusTarget(scoreHand([1, 1, 1, 1, 1], 1))).toBe(6);
  });

  it('is null for a wild-assisted four of a kind', () => {
    expect(yahtzeeBonusTarget(scoreHand([1, 5, 5, 5, 2], 1))).toBeNull();
  });
});
