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

  it('scores the largest group, with 1s joining as wilds', () => {
    expect(scoreHand(h(3, 3, 3, 6, 1), 1)).toMatchObject({ count: 4, face: 3 });
  });

  it('breaks group-count ties with the higher face', () => {
    expect(scoreHand(h(6, 6, 3, 3, 1), 1)).toMatchObject({ count: 3, face: 6 });
    expect(scoreHand(h(2, 2, 5, 5, 1), 3)).toMatchObject({ count: 3, face: 5 });
  });

  describe('wild ones', () => {
    it('wilds join the group that maximizes count first', () => {
      expect(scoreHand(h(1, 1, 3, 3, 3), 1)).toMatchObject({ count: 5, face: 3 });
    });

    it('wilds break count ties toward the higher face', () => {
      expect(scoreHand(h(1, 4, 4, 6, 6), 1)).toMatchObject({ count: 3, face: 6 });
    });

    it('all ones score as five 6s', () => {
      expect(scoreHand(h(1, 1, 1, 1, 1), 1)).toMatchObject({ count: 5, face: 6 });
    });

    it('a hand with no ones scores exactly as before', () => {
      expect(scoreHand(h(2, 2, 4, 5, 6), 1)).toMatchObject({ count: 2, face: 2 });
    });

    it('a lone wild in a no-pair hand pairs the highest face', () => {
      expect(scoreHand(h(1, 3, 4, 5, 6), 1)).toMatchObject({
        count: 2,
        face: 6,
        straight: 'none',
      });
    });
  });

  it('detects a straight (1-2-3-4-5; the 1 is a natural 1, not a wild)', () => {
    expect(scoreHand(h(5, 3, 1, 4, 2), 2)).toMatchObject({ straight: 'straight' });
  });

  it('detects a straight (2-3-4-5-6)', () => {
    expect(scoreHand(h(6, 4, 2, 5, 3), 1)).toMatchObject({ straight: 'straight' });
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

  it('never lets a wild 1 complete a straight (1,3,4,5,6 is not a straight)', () => {
    expect(detectStraight(h(1, 3, 4, 5, 6))).toBe('none');
  });

  it('detects straights in any order', () => {
    expect(detectStraight(h(1, 2, 3, 4, 5))).toBe('straight');
    expect(detectStraight(h(6, 5, 4, 3, 2))).toBe('straight');
  });
});
