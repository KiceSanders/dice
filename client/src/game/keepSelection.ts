import type { TurnState } from '@dice/shared';

type KeepTurn = Pick<TurnState, 'playerId' | 'rollsUsed' | 'keptIndices'>;

/**
 * Local keep choices belong to one exact server turn version. Keeping the
 * owner beside the indices prevents a turn-change render from handing the
 * outgoing player's choices to the incoming roller before effects can reset.
 */
export interface PendingKeepSelection {
  playerId: string | null;
  rollsUsed: number;
  indices: number[];
}

export function pendingKeepSelection(
  turn: KeepTurn | null,
  indices: number[] = turn?.keptIndices ?? [],
): PendingKeepSelection {
  return {
    playerId: turn?.playerId ?? null,
    rollsUsed: turn?.rollsUsed ?? -1,
    indices: [...indices],
  };
}

/**
 * Resolve keeps during render. A stale local selection never wins over a new
 * turn's authoritative keeps, even before the synchronization effect runs.
 */
export function pendingKeepForTurn(
  selection: PendingKeepSelection,
  turn: KeepTurn | null,
): number[] {
  if (!turn) return [];
  if (selection.playerId !== turn.playerId || selection.rollsUsed !== turn.rollsUsed) {
    return turn.keptIndices;
  }
  return selection.indices;
}

/** Toggle a die in/out of the pending keep list (pre-roll selection only). */
export function togglePendingKeep(
  index: number,
  pendingKeep: number[],
  lockedKeep: number[],
  hasRolled: boolean,
): number[] | null {
  if (!hasRolled) return null;
  if (lockedKeep.includes(index)) return null;
  const next = pendingKeep.includes(index)
    ? pendingKeep.filter((x) => x !== index)
    : [...pendingKeep, index];
  return [...next].sort((a, b) => a - b);
}
