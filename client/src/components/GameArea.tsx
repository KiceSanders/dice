import { useEffect, useState } from 'react';
import type { RoomSnapshot, TurnState } from '@dice/shared';
import { HAND_SIZE } from '@dice/shared';
import { togglePendingKeep } from '../game/keepSelection';
import { useApp } from '../state/context';
import type { LastRoll } from '../state/store';
import DiceRow from './DiceRow';
import GameHud from './GameHud';
import Koozie from './Koozie';
import TimerRing from './TimerRing';

export interface TurnActions {
  onRoll?: (keepIndices: number[]) => void;
  onStand: () => void;
  onKeepAllStand?: () => void;
  disabled?: boolean;
  /** True while the player is dragging dice before a throw. */
  aiming?: boolean;
}

interface Props {
  snapshot: RoomSnapshot;
  myId: string;
  lastRoll: LastRoll | null;
  /** When set, roll/stand use these instead of the WebSocket (dev playground). */
  turnActions?: TurnActions;
  /** Hide the 2D koozie dice — values shown on the 3D table instead. */
  hide2DDice?: boolean;
  /** Mouse-throw mode: no Roll button; click the table to throw. */
  mouseThrow?: boolean;
  pendingKeep?: number[];
  onPendingKeepChange?: (indices: number[]) => void;
}

/**
 * The in-game table area: HUD, the current turn's dice under the koozie, and
 * roll/stand controls for the active player (PLAN.md 9.1–9.4, 9.6 — spectators
 * get the same view with all controls hidden).
 */
export default function GameArea({
  snapshot,
  myId,
  lastRoll,
  turnActions,
  hide2DDice = false,
  mouseThrow = false,
  pendingKeep: pendingKeepProp,
  onPendingKeepChange,
}: Props) {
  const game = snapshot.game;
  const turn = game?.currentTurn ?? null;
  const isMyTurn = turn !== null && turn.playerId === myId;

  // Dice the player intends to keep on the next roll (always includes locked ones).
  const [pendingKeepLocal, setPendingKeepLocal] = useState<number[]>([]);
  const pendingKeep = pendingKeepProp ?? pendingKeepLocal;
  const setPendingKeep = onPendingKeepChange ?? setPendingKeepLocal;

  useEffect(() => {
    setPendingKeep(turn ? [...turn.keptIndices] : []);
  }, [turn?.playerId, turn?.rollsUsed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game) return null;

  const nameOf = (id: string) => snapshot.players.find((p) => p.id === id)?.name ?? 'unknown';

  const toggleKeep = (i: number) => {
    if (!turn || !isMyTurn) return;
    const next = togglePendingKeep(i, pendingKeep, turn.keptIndices, turn.rollsUsed > 0);
    if (next) setPendingKeep(next);
  };

  // Animate only the roll the snapshot currently shows.
  const rollId = lastRoll && turn && lastRoll.playerId === turn.playerId ? lastRoll.receivedAt : null;

  return (
    <section className="game-area" aria-label="game table">
      <GameHud game={game} players={snapshot.players} />

      {turn ? (
        <div className="turn-area">
          <div className="turn-header">
            <h3 className="turn-title">{isMyTurn ? 'Your turn' : `${nameOf(turn.playerId)}'s turn`}</h3>
            <span className="turn-rolls muted">
              roll {turn.rollsUsed} / {turn.rollCap}
            </span>
            <TimerRing deadline={turn.deadline} />
          </div>

          {hide2DDice ? (
            <div className="table-dice-controls">
              <p className="muted dice-placeholder">
                {turnActions?.aiming
                  ? 'Drag to aim — release to throw.'
                  : mouseThrow
                    ? turn.rollsUsed > 0 && turn.dice.length > 0 && !turnActions?.disabled
                      ? 'Click dice on the table to keep them. Click the koozie to roll again.'
                      : 'Click the koozie beside the table, drag it around, then release to roll.'
                    : turn.dice.length > 0 || turnActions?.disabled
                      ? 'Dice on the table…'
                      : isMyTurn
                        ? 'Dice in the cup — roll to throw onto the table.'
                        : 'Dice in the cup — waiting for the roll…'}
              </p>
            </div>
          ) : (
            <Koozie rollId={rollId}>
              {turn.dice.length > 0 ? (
                <DiceRow
                  dice={turn.dice}
                  kept={turn.keptIndices}
                  selected={pendingKeep}
                  onToggle={isMyTurn ? toggleKeep : undefined}
                />
              ) : (
                <p className="muted dice-placeholder">Dice in the cup — waiting for the first roll…</p>
              )}
            </Koozie>
          )}

          {isMyTurn && (
            <TurnControls
              turn={turn}
              pendingKeep={pendingKeep}
              turnActions={turnActions}
              mouseThrow={mouseThrow}
            />
          )}
          {isMyTurn && turn.rollsUsed > 0 && turn.rollsUsed < turn.rollCap && !hide2DDice && (
            <small className="muted keep-hint">Click dice to keep them — kept dice stay locked for the turn.</small>
          )}
        </div>
      ) : (
        <p className="muted turn-area-empty">
          {snapshot.phase === 'roundEnd' ? 'Round over — next round starting shortly…' : 'Waiting for the next turn…'}
        </p>
      )}

      {game.turnQueue.length > 0 && (
        <p className="muted turn-queue">Up next: {game.turnQueue.map(nameOf).join(', ')}</p>
      )}
    </section>
  );
}

/** Roll / Stand controls for the active player (PLAN.md 9.3). */
function TurnControls({
  turn,
  pendingKeep,
  turnActions,
  mouseThrow = false,
}: {
  turn: TurnState;
  pendingKeep: number[];
  turnActions?: TurnActions;
  mouseThrow?: boolean;
}) {
  if (turnActions) {
    return (
      <TurnControlsButtons
        turn={turn}
        pendingKeep={pendingKeep}
        disabled={turnActions.disabled ?? false}
        mouseThrow={mouseThrow}
        onRoll={turnActions.onRoll}
        onStand={turnActions.onStand}
        onKeepAllStand={turnActions.onKeepAllStand}
      />
    );
  }
  return <TurnControlsLive turn={turn} pendingKeep={pendingKeep} />;
}

function TurnControlsLive({ turn, pendingKeep }: { turn: TurnState; pendingKeep: number[] }) {
  const { send, state } = useApp();
  return (
    <TurnControlsButtons
      turn={turn}
      pendingKeep={pendingKeep}
      disabled={state.connection !== 'open'}
      onRoll={(keep) => send({ type: 'turn:roll', keepIndices: keep })}
      onStand={() => send({ type: 'turn:stand' })}
    />
  );
}

function TurnControlsButtons({
  turn,
  pendingKeep,
  disabled,
  mouseThrow = false,
  onRoll,
  onStand,
  onKeepAllStand,
}: {
  turn: TurnState;
  pendingKeep: number[];
  disabled: boolean;
  mouseThrow?: boolean;
  onRoll?: (keepIndices: number[]) => void;
  onStand: () => void;
  onKeepAllStand?: () => void;
}) {
  const hasRolled = turn.rollsUsed > 0;
  const keepingAll = pendingKeep.length === HAND_SIZE;

  if (mouseThrow) {
    return (
      <div className="turn-controls">
        {hasRolled && keepingAll && onKeepAllStand && (
          <button type="button" disabled={disabled} onClick={onKeepAllStand}>
            Keep all (stand)
          </button>
        )}
        <button type="button" className="secondary" disabled={!hasRolled || disabled} onClick={onStand}>
          Stand
        </button>
      </div>
    );
  }

  return (
    <div className="turn-controls">
      <button type="button" disabled={disabled || !onRoll} onClick={() => onRoll?.(pendingKeep)}>
        {!hasRolled ? 'Roll' : keepingAll ? 'Keep all (stand)' : 'Roll again'}
      </button>
      <button type="button" className="secondary" disabled={!hasRolled || disabled} onClick={onStand}>
        Stand
      </button>
    </div>
  );
}
