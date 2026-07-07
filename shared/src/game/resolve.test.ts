import { describe, expect, it } from 'vitest';
import type { Die, HandScore, PlayerId, StraightKind } from '../types.js';
import { resolveRound } from './resolve.js';

function hand(count: number, face: Die, rollsUsed = 1, straight: StraightKind = 'none'): HandScore {
  return { count, face, rollsUsed, straight };
}

const hands = (entries: [PlayerId, HandScore][]) => new Map(entries);

describe('resolveRound', () => {
  it('finds a clear winner', () => {
    const { winners } = resolveRound(
      hands([
        ['a', hand(2, 6)],
        ['b', hand(4, 3)],
        ['c', hand(3, 5)],
      ]),
    );
    expect(winners).toEqual(['b']);
  });

  it('returns a 2-way tie', () => {
    const { winners } = resolveRound(
      hands([
        ['a', hand(3, 5, 2)],
        ['b', hand(3, 5, 2)],
        ['c', hand(2, 6, 1)],
      ]),
    );
    expect(winners.sort()).toEqual(['a', 'b']);
  });

  it('returns a 3-way tie', () => {
    const { winners } = resolveRound(
      hands([
        ['a', hand(2, 4, 1)],
        ['b', hand(2, 4, 1)],
        ['c', hand(2, 4, 1)],
      ]),
    );
    expect(winners.sort()).toEqual(['a', 'b', 'c']);
  });

  it('breaks would-be ties on rollsUsed', () => {
    const { winners } = resolveRound(
      hands([
        ['a', hand(3, 5, 3)],
        ['b', hand(3, 5, 2)],
      ]),
    );
    expect(winners).toEqual(['b']);
  });

  it('a late straight steals the round', () => {
    const { winners } = resolveRound(
      hands([
        ['a', hand(5, 6, 1)],
        ['b', hand(1, 5, 3, 'straight')],
      ]),
    );
    expect(winners).toEqual(['b']);
  });

  it('handles a single hand', () => {
    expect(resolveRound(hands([['solo', hand(1, 2)]])).winners).toEqual(['solo']);
  });

  it('throws on no hands', () => {
    expect(() => resolveRound(new Map())).toThrow();
  });
});
