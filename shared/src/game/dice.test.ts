import { describe, expect, it } from 'vitest';
import type { Die } from '../types.js';
import { keepAndReroll, rollDice, type Rng } from './dice.js';

/** Rng stub that yields the given die faces in order. */
function rngFor(faces: Die[]): Rng {
  let i = 0;
  return () => {
    const face = faces[i++];
    if (face === undefined) throw new Error('rng stub exhausted');
    return (face - 1) / 6;
  };
}

describe('rollDice', () => {
  it('is deterministic with a seeded rng', () => {
    expect(rollDice(5, rngFor([1, 2, 3, 4, 5]))).toEqual([1, 2, 3, 4, 5]);
    expect(rollDice(5, rngFor([6, 6, 6, 6, 6]))).toEqual([6, 6, 6, 6, 6]);
  });

  it('rolls the requested number of dice', () => {
    expect(rollDice(0, rngFor([]))).toEqual([]);
    expect(rollDice(2, rngFor([3, 4]))).toHaveLength(2);
  });

  it('only ever produces faces 1-6 with a real rng', () => {
    const dice = rollDice(1000, Math.random);
    expect(dice.every((d) => d >= 1 && d <= 6)).toBe(true);
  });

  it('throws on invalid count', () => {
    expect(() => rollDice(-1, Math.random)).toThrow();
    expect(() => rollDice(2.5, Math.random)).toThrow();
  });
});

describe('keepAndReroll', () => {
  const hand: Die[] = [6, 6, 2, 3, 1];

  it('preserves kept dice and re-rolls the rest in place', () => {
    const next = keepAndReroll(hand, [0, 1], rngFor([5, 5, 5]));
    expect(next).toEqual([6, 6, 5, 5, 5]);
  });

  it('keeps everything when all indices are kept', () => {
    expect(keepAndReroll(hand, [0, 1, 2, 3, 4], rngFor([]))).toEqual(hand);
  });

  it('re-rolls everything when nothing is kept', () => {
    expect(keepAndReroll(hand, [], rngFor([1, 1, 1, 1, 1]))).toEqual([1, 1, 1, 1, 1]);
  });

  it('throws on out-of-range indices', () => {
    expect(() => keepAndReroll(hand, [5], Math.random)).toThrow();
    expect(() => keepAndReroll(hand, [-1], Math.random)).toThrow();
    expect(() => keepAndReroll(hand, [1.5], Math.random)).toThrow();
  });

  it('throws on duplicate indices', () => {
    expect(() => keepAndReroll(hand, [2, 2], Math.random)).toThrow();
  });

  it('does not mutate the input hand', () => {
    keepAndReroll(hand, [0], rngFor([1, 1, 1, 1]));
    expect(hand).toEqual([6, 6, 2, 3, 1]);
  });
});
