import type { Die, HandScore, StraightKind } from '../types.js';
import { HAND_SIZE } from './dice.js';

const LITTLE = '12345';
const BIG = '23456';

/** Detect a 5-die straight in the final hand. */
export function detectStraight(dice: Die[]): StraightKind {
  if (dice.length !== HAND_SIZE) return 'none';
  const sorted = [...dice].sort((a, b) => a - b).join('');
  if (sorted === LITTLE) return 'little';
  if (sorted === BIG) return 'big';
  return 'none';
}

/**
 * Score a finished hand: largest group of identical dice wins; group-count
 * ties within the hand resolve to the higher face (e.g. 6,6,3,3,1 → two 6s).
 */
export function scoreHand(dice: Die[], rollsUsed: number): HandScore {
  if (dice.length !== HAND_SIZE) {
    throw new Error(`hand must have ${HAND_SIZE} dice, got ${dice.length}`);
  }
  if (!Number.isInteger(rollsUsed) || rollsUsed < 1) {
    throw new Error(`invalid rollsUsed: ${rollsUsed}`);
  }

  const counts = new Map<Die, number>();
  for (const die of dice) {
    counts.set(die, (counts.get(die) ?? 0) + 1);
  }

  let count = 0;
  let face: Die = 1;
  for (const [d, c] of counts) {
    if (c > count || (c === count && d > face)) {
      count = c;
      face = d;
    }
  }

  return { count, face, rollsUsed, straight: detectStraight(dice) };
}
