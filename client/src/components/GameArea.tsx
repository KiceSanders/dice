import type { RoomSnapshot, TurnState } from '@dice/shared';
import { HAND_SIZE } from '@dice/shared';
import GameHud from './GameHud';

export interface TurnActions {
  onRoll?: (keepIndices: number[]) => void;
  onStand: () => void;
  /** Voluntary-stand legality (shared rule vs the roll-to-beat). Default true. */
  canStand?: boolean;
  /** Why standing is blocked, e.g. the roll-to-beat to match. */
  standHint?: string;
  disabled?: boolean;
  /** True while the player is dragging dice before a throw. */
  aiming?: boolean;
}

interface Props {
  snapshot: RoomSnapshot;
  myId: string;
  /** When set, roll/stand use these instead of the WebSocket (dev playground). */
  turnActions?: TurnActions;
  /** Mouse-throw mode: no Roll button; click the table to throw. */
  mouseThrow?: boolean;
  pendingKeep?: number[];
}

/**
 * In-game HUD and turn chrome. Dice live on the 3D table (DicePhysics /
 * RemoteDiceView / StaticDiceView); this component only shows status text and
 * optional stand controls when not using mouse-throw.
 */
export default function GameArea({
  snapshot,
  myId,
  turnActions,
  mouseThrow = false,
  pendingKeep: pendingKeepProp = [],
}: Props) {
  const game = snapshot.game;
  if (!game) return null;

  const turn = game.currentTurn ?? null;
  const isMyTurn = turn !== null && turn.playerId === myId;
  const pendingKeep = pendingKeepProp;
  const nameOf = (id: string) => snapshot.players.find((p) => p.id === id)?.name ?? 'unknown';

  return (
    <section className="game-area" aria-label="game table">
      <GameHud game={game} players={snapshot.players} />

      {turn ? (
        <div className="turn-area">
          <div className="turn-header">
            <h3 className="turn-title">
              {isMyTurn ? 'Your turn' : `${nameOf(turn.playerId)}'s turn`}
            </h3>
            <span className="turn-rolls muted">
              roll {turn.rollsUsed} / {turn.rollCap}
            </span>
          </div>

          <div className="table-dice-controls">
            <p className="muted dice-placeholder">
              {turn.resolving && turn.koozieLocked
                ? 'Inspect the dice — results in a moment…'
                : turnActions?.aiming
                  ? 'Drag to aim — release to throw.'
                  : mouseThrow
                    ? turn.rollsUsed > 0 && turn.dice.length > 0 && !turnActions?.disabled
                      ? 'Click dice on the table to keep them. Click the koozie in front of you to roll again.'
                      : 'Grab the koozie in front of you, drag it around, then release to roll.'
                    : turn.dice.length > 0 || turnActions?.disabled
                      ? 'Dice on the table…'
                      : isMyTurn
                        ? 'Dice in the cup — roll to throw onto the table.'
                        : 'Dice in the cup — waiting for the roll…'}
            </p>
          </div>

          {isMyTurn && !mouseThrow && (
            <TurnControls turn={turn} pendingKeep={pendingKeep} turnActions={turnActions} />
          )}
        </div>
      ) : (
        <p className="muted turn-area-empty">
          {snapshot.phase === 'roundEnd'
            ? 'Round over — next round starting shortly…'
            : 'Waiting for the next turn…'}
        </p>
      )}

      {game.turnQueue.length > 0 && (
        <p className="muted turn-queue">Up next: {game.turnQueue.map(nameOf).join(', ')}</p>
      )}
    </section>
  );
}

function TurnControls({
  turn,
  pendingKeep,
  turnActions,
}: {
  turn: TurnState;
  pendingKeep: number[];
  turnActions?: TurnActions;
}) {
  if (!turnActions) return null;
  return (
    <TurnControlsButtons
      turn={turn}
      pendingKeep={pendingKeep}
      disabled={turnActions.disabled ?? false}
      canStand={turnActions.canStand ?? true}
      onRoll={turnActions.onRoll}
      onStand={turnActions.onStand}
    />
  );
}

function TurnControlsButtons({
  turn,
  pendingKeep,
  disabled,
  canStand = true,
  onRoll,
  onStand,
}: {
  turn: TurnState;
  pendingKeep: number[];
  disabled: boolean;
  canStand?: boolean;
  onRoll?: (keepIndices: number[]) => void;
  onStand: () => void;
}) {
  const hasRolled = turn.rollsUsed > 0;
  const keepingAll = pendingKeep.length === HAND_SIZE;

  return (
    <div className="turn-controls">
      <button type="button" disabled={disabled || !onRoll} onClick={() => onRoll?.(pendingKeep)}>
        {!hasRolled ? 'Roll' : keepingAll ? 'Keep all (stand)' : 'Roll again'}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={!hasRolled || disabled || !canStand}
        onClick={onStand}
      >
        Stand
      </button>
    </div>
  );
}
