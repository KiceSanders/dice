import type { TurnState } from '@dice/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type PendingKeepSelection,
  pendingKeepForTurn,
  pendingKeepSelection,
  togglePendingKeep,
} from './keepSelection';

type KeepTurn = Pick<TurnState, 'playerId' | 'rollsUsed' | 'keptIndices'>;

export interface UsePendingKeepOptions {
  /** Fired when the turn version (playerId / rollsUsed) changes and keeps reset. */
  onReset?: () => void;
}

/**
 * Owns local keep choices for one exact server turn version. Resolves
 * ownership during render so an outgoing player's selection never reaches
 * the incoming roller before effects run.
 */
export function usePendingKeep(turn: KeepTurn | null, options?: UsePendingKeepOptions) {
  const [selection, setSelection] = useState<PendingKeepSelection>(() =>
    pendingKeepSelection(null),
  );
  const pendingKeep = pendingKeepForTurn(selection, turn);
  const pendingKeepRef = useRef(pendingKeep);
  pendingKeepRef.current = pendingKeep;

  const turnRef = useRef(turn);
  turnRef.current = turn;
  const onResetRef = useRef(options?.onReset);
  onResetRef.current = options?.onReset;

  // Keyed only on turn version — indices may change without resetting local choice.
  const turnVersion = turn ? `${turn.playerId}:${turn.rollsUsed}` : '';

  useEffect(() => {
    const next = pendingKeepSelection(turnRef.current);
    pendingKeepRef.current = next.indices;
    setSelection(next);
    onResetRef.current?.();
  }, [turnVersion]);

  const setPendingKeep = useCallback((indices: number[]) => {
    const next = pendingKeepSelection(turnRef.current, indices);
    pendingKeepRef.current = next.indices;
    setSelection(next);
  }, []);

  const toggleKeep = useCallback((index: number, hasRolled: boolean) => {
    const next = togglePendingKeep(index, pendingKeepRef.current, hasRolled);
    if (!next) return null;
    pendingKeepRef.current = next;
    setSelection(pendingKeepSelection(turnRef.current, next));
    return next;
  }, []);

  return {
    pendingKeep,
    pendingKeepRef,
    setPendingKeep,
    toggleKeep,
    selection,
  };
}
