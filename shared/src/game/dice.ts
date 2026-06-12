import type { Die } from '../types.js';

/** Uniform random source in [0, 1). Injected so tests can script dice. */
export type Rng = () => number;

export const HAND_SIZE = 5;

function toDie(rng: Rng): Die {
  const v = Math.floor(rng() * 6) + 1;
  if (v < 1 || v > 6) {
    throw new Error(`rng produced out-of-range die: ${v}`);
  }
  return v as Die;
}

/** Roll `count` fresh dice. */
export function rollDice(count: number, rng: Rng): Die[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`invalid dice count: ${count}`);
  }
  return Array.from({ length: count }, () => toDie(rng));
}

/**
 * Re-roll every die not listed in `keepIndices`, preserving positions.
 * Throws on out-of-range or duplicate indices.
 */
export function keepAndReroll(hand: Die[], keepIndices: number[], rng: Rng): Die[] {
  const keep = new Set<number>();
  for (const i of keepIndices) {
    if (!Number.isInteger(i) || i < 0 || i >= hand.length) {
      throw new Error(`invalid keep index: ${i}`);
    }
    if (keep.has(i)) {
      throw new Error(`duplicate keep index: ${i}`);
    }
    keep.add(i);
  }
  return hand.map((die, i) => (keep.has(i) ? die : toDie(rng)));
}
