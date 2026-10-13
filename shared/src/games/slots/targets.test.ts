import { describe, expect, it } from 'vitest';
import type { Die } from '../../types.js';
import {
  highestSlotTarget,
  SLOT_DIFFICULTIES,
  SLOT_TARGETS,
  slotTargetMatches,
} from './targets.js';

const targets = SLOT_DIFFICULTIES.flatMap((difficulty) => SLOT_TARGETS[difficulty]);
const target = (id: string) => targets.find((item) => item.id === id)!;

describe('Hit List targets', () => {
  it.each<{ id: string; dice: Die[]; matches: boolean }>([
    { id: 'pair-6', dice: [6, 6, 2, 3, 4], matches: true },
    { id: 'pair-6', dice: [6, 6, 6, 6, 6], matches: true },
    { id: 'pair-6', dice: [1, 6, 2, 3, 4], matches: false },
    { id: 'pair-1', dice: [1, 1, 2, 3, 4], matches: true },
    { id: 'triple-4', dice: [4, 4, 2, 3, 4], matches: true },
    { id: 'triple-4', dice: [4, 4, 1, 3, 6], matches: false },
    { id: 'four-2', dice: [2, 2, 2, 2, 5], matches: true },
    { id: 'four-2', dice: [2, 2, 2, 1, 5], matches: false },
    { id: 'straight', dice: [5, 1, 3, 4, 2], matches: true },
    { id: 'straight', dice: [6, 3, 2, 4, 5], matches: true },
    { id: 'straight', dice: [1, 2, 3, 4, 6], matches: false },
    { id: 'straight', dice: [1, 2, 3, 4, 4], matches: false },
    { id: 'full-house', dice: [5, 2, 5, 2, 5], matches: true },
    { id: 'full-house', dice: [5, 5, 5, 5, 5], matches: false },
    { id: 'full-house', dice: [5, 5, 5, 5, 2], matches: false },
    { id: 'five-alike', dice: [1, 1, 1, 1, 1], matches: true },
    { id: 'five-alike', dice: [6, 6, 6, 6, 1], matches: false },
    { id: 'five-sixes', dice: [6, 6, 6, 6, 6], matches: true },
    { id: 'five-sixes', dice: [5, 5, 5, 5, 5], matches: false },
  ])('$id on $dice matches: $matches', ({ id, dice, matches }) => {
    expect(slotTargetMatches(target(id), dice)).toBe(matches);
  });

  it('requires all five dice before any target can pay', () => {
    expect(slotTargetMatches(target('pair-6'), [])).toBe(false);
    expect(slotTargetMatches(target('pair-6'), [6, 6])).toBe(false);
  });

  it('pays only the highest match, independently of target order', () => {
    const list = [target('four-6'), target('pair-6'), target('triple-6')];
    expect(highestSlotTarget(list, [6, 6, 6, 6, 1])?.payout).toBe(30);
    expect(highestSlotTarget(list, [2, 3, 4, 5, 6])).toBeNull();
  });

  it('gives every unique contract a reachable five-dice hand and positive prize', () => {
    const unreached = new Set(targets.map((item) => item.id));
    expect(unreached.size).toBe(targets.length);
    for (let code = 0; code < 6 ** 5 && unreached.size > 0; code += 1) {
      const dice = Array.from(
        { length: 5 },
        (_, i) => (Math.floor(code / 6 ** i) % 6) + 1,
      ) as Die[];
      for (const item of targets) {
        if (slotTargetMatches(item, dice)) unreached.delete(item.id);
      }
    }
    expect([...unreached]).toEqual([]);
    for (const difficulty of SLOT_DIFFICULTIES) {
      expect(SLOT_TARGETS[difficulty].length).toBeGreaterThan(1);
      for (const item of SLOT_TARGETS[difficulty]) {
        expect(item.difficulty).toBe(difficulty);
        expect(item.payout).toBeGreaterThan(0);
      }
    }
  });
});
