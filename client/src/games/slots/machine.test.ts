import { type Die, SLOT_DIFFICULTIES, SLOT_TARGETS } from '@dice/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSlotReel, drawSlotDice, drawSlotTargets } from './machine';

afterEach(() => vi.unstubAllGlobals());

describe('slot machine presentation and draws', () => {
  it('every reel starts and ends on the correct face, including wrapping and unchanged values', () => {
    for (let from = 1; from <= 6; from += 1) {
      for (let to = 1; to <= 6; to += 1) {
        const reel = buildSlotReel(from as Die, to as Die);
        expect(reel.faces[1]).toBe(from);
        expect(reel.faces[reel.stopIndex]).toBe(to);
        expect(reel.faces[reel.stopIndex + 1]).toBe((to % 6) + 1);
        expect(reel.stopIndex).toBeGreaterThan(18);
      }
    }
  });

  it('draws one target per difficulty and changes every target for the next round', () => {
    vi.stubGlobal('crypto', { getRandomValues: (values: Uint32Array) => values.fill(0) });
    const first = drawSlotTargets();
    const next = drawSlotTargets(first);
    expect(first.map((target) => target.difficulty)).toEqual(SLOT_DIFFICULTIES);
    expect(next.map((target) => target.difficulty)).toEqual(SLOT_DIFFICULTIES);
    for (const target of next) {
      expect(first.some((previous) => previous.id === target.id)).toBe(false);
      expect(SLOT_TARGETS[target.difficulty]).toContain(target);
    }
  });

  it('samples exactly five valid faces and rejects the biased end of the uint32 range', () => {
    const values = [2 ** 32 - 1, 0, 1, 2, 3, 5];
    const getRandomValues = vi.fn((out: Uint32Array) => {
      out[0] = values.shift()!;
      return out;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    expect(drawSlotDice()).toEqual([1, 2, 3, 4, 6]);
    expect(getRandomValues).toHaveBeenCalledTimes(6);
  });
});
