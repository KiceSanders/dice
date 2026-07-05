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
 * Score a finished hand. Ones are wild: each 1 joins whatever group gives the
 * strongest hand — largest group first, then higher face (e.g. 1,1,3,3,3 →
 * five 3s; 1,4,4,6,6 → three 6s; 1,1,1,1,1 → five 6s). Wilds never count
 * toward straights: detectStraight matches the literal faces only.
 */
export function scoreHand(dice: Die[], rollsUsed: number): HandScore {
  if (dice.length !== HAND_SIZE) {
    throw new Error(`hand must have ${HAND_SIZE} dice, got ${dice.length}`);
  }
  if (!Number.isInteger(rollsUsed) || rollsUsed < 1) {
    throw new Error(`invalid rollsUsed: ${rollsUsed}`);
  }

  const counts = new Map<Die, number>();
  let wilds = 0;
  for (const die of dice) {
    if (die === 1) wilds += 1;
    else counts.set(die, (counts.get(die) ?? 0) + 1);
  }

  const wildableFaces: Die[] = [2, 3, 4, 5, 6];
  let count = 0;
  let face: Die = 1;
  for (const d of wildableFaces) {
    const c = (counts.get(d) ?? 0) + wilds;
    if (c > count || (c === count && d > face)) {
      count = c;
      face = d;
    }
  }

  return { count, face, rollsUsed, straight: detectStraight(dice) };
}
