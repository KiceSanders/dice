import { describe, expect, it } from 'vitest';
import type { Die } from '../types.js';
import { detectStraight, scoreHand } from './score.js';

const h = (...dice: Die[]): Die[] => dice;

describe('scoreHand', () => {
  it('scores five of a kind', () => {
    expect(scoreHand(h(4, 4, 4, 4, 4), 2)).toEqual({
      count: 5,
      face: 4,
      rollsUsed: 2,
      straight: 'none',
    });
  });

  it('scores the largest group', () => {
    expect(scoreHand(h(3, 3, 3, 6, 1), 1)).toMatchObject({ count: 3, face: 3 });
  });

  it('breaks group-count ties with the higher face (6,6,3,3,1 → two 6s)', () => {
    expect(scoreHand(h(6, 6, 3, 3, 1), 1)).toMatchObject({ count: 2, face: 6 });
    expect(scoreHand(h(2, 2, 5, 5, 1), 3)).toMatchObject({ count: 2, face: 5 });
  });

  it('scores a no-pair hand as count 1, highest face', () => {
    expect(scoreHand(h(1, 3, 4, 5, 6) /* not a straight */, 1)).toMatchObject({
      count: 1,
      face: 6,
      straight: 'none',
    });
  });

  it('detects a little straight', () => {
    expect(scoreHand(h(5, 3, 1, 4, 2), 2)).toMatchObject({ straight: 'little' });
  });

  it('detects a big straight', () => {
    expect(scoreHand(h(6, 4, 2, 5, 3), 1)).toMatchObject({ straight: 'big' });
  });

  it('throws on a wrong-sized hand or bad rollsUsed', () => {
    expect(() => scoreHand(h(1, 2, 3, 4), 1)).toThrow();
    expect(() => scoreHand(h(1, 2, 3, 4, 5, 6), 1)).toThrow();
    expect(() => scoreHand(h(1, 2, 3, 4, 5), 0)).toThrow();
  });
});

describe('detectStraight', () => {
  it('returns none for non-straights', () => {
    expect(detectStraight(h(1, 1, 3, 4, 5))).toBe('none');
    expect(detectStraight(h(1, 2, 3, 4, 6))).toBe('none');
  });

  it('detects straights in any order', () => {
    expect(detectStraight(h(1, 2, 3, 4, 5))).toBe('little');
    expect(detectStraight(h(6, 5, 4, 3, 2))).toBe('big');
  });
});
