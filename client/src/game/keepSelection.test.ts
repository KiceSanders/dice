import type { TurnState } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { pendingKeepForTurn, pendingKeepSelection, togglePendingKeep } from './keepSelection';

function turn(
  playerId: string,
  rollsUsed: number,
  keptIndices: number[] = [],
): Pick<TurnState, 'playerId' | 'rollsUsed' | 'keptIndices'> {
  return { playerId, rollsUsed, keptIndices };
}

describe('pending keep ownership', () => {
  it('uses authoritative keeps immediately when the turn owner changes', () => {
    const outgoing = pendingKeepSelection(turn('player-a', 4, [0, 1, 2, 3]));
    const incoming = turn('player-b', 0);

    expect(pendingKeepForTurn(outgoing, incoming)).toEqual([]);
  });

  it('uses local choices only for their exact turn version', () => {
    const current = turn('player-a', 2, [1]);
    const local = pendingKeepSelection(current, [1, 3]);

    expect(pendingKeepForTurn(local, current)).toEqual([1, 3]);
    expect(pendingKeepForTurn(local, turn('player-a', 3, [1]))).toEqual([1]);
  });

  it('returns no keeps without an active turn', () => {
    expect(pendingKeepForTurn(pendingKeepSelection(turn('player-a', 1), [2]), null)).toEqual([]);
  });
});

describe('togglePendingKeep', () => {
  it('returns null before the first roll', () => {
    expect(togglePendingKeep(0, [], false)).toBeNull();
  });

  it('adds and removes dice after the first roll', () => {
    expect(togglePendingKeep(3, [1], true)).toEqual([1, 3]);
    expect(togglePendingKeep(3, [1, 3], true)).toEqual([1]);
  });

  it('allows releasing a previously kept index', () => {
    expect(togglePendingKeep(0, [0], true)).toEqual([]);
  });
});
