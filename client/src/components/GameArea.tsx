import { useEffect, useState } from 'react';
import type { RoomSnapshot, TurnState } from '@dice/shared';
import { HAND_SIZE } from '@dice/shared';
import { useApp } from '../state/context';
import type { LastRoll } from '../state/store';
import DiceRow from './DiceRow';
import GameHud from './GameHud';
import Koozie from './Koozie';
import TimerRing from './TimerRing';

interface Props {
  snapshot: RoomSnapshot;
  myId: string;
  lastRoll: LastRoll | null;
}

/**
 * The in-game table area: HUD, the current turn's dice under the koozie, and
 * roll/stand controls for the active player (PLAN.md 9.1–9.4, 9.6 — spectators
 * get the same view with all controls hidden).
 */
export default function GameArea({ snapshot, myId, lastRoll }: Props) {
  const game = snapshot.game;
  const turn = game?.currentTurn ?? null;
  const isMyTurn = turn !== null && turn.playerId === myId;

  // Dice the player intends to keep on the next roll (always includes locked ones).
  const [pendingKeep, setPendingKeep] = useState<number[]>([]);
  useEffect(() => {
    setPendingKeep(turn ? [...turn.keptIndices] : []);
  }, [turn?.playerId, turn?.rollsUsed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game) return null;

  const nameOf = (id: string) => snapshot.players.find((p) => p.id === id)?.name ?? 'unknown';

  const toggleKeep = (i: number) => {
    if (!turn || !isMyTurn || turn.rollsUsed === 0) return;
    if (turn.keptIndices.includes(i)) return; // locked
    setPendingKeep((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
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

          {isMyTurn && <TurnControls turn={turn} pendingKeep={pendingKeep} />}
          {isMyTurn && turn.rollsUsed > 0 && turn.rollsUsed < turn.rollCap && (
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
function TurnControls({ turn, pendingKeep }: { turn: TurnState; pendingKeep: number[] }) {
  const { send, state } = useApp();
  const hasRolled = turn.rollsUsed > 0;
  const keepingAll = pendingKeep.length === HAND_SIZE;
  // No queued actions while disconnected (Phase 11.1) — controls are disabled.
  const connected = state.connection === 'open';

  return (
    <div className="turn-controls">
      <button
        type="button"
        disabled={!connected}
        onClick={() => send({ type: 'turn:roll', keepIndices: pendingKeep })}
      >
        {!hasRolled ? 'Roll' : keepingAll ? 'Keep all (stand)' : 'Roll again'}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={!hasRolled || !connected}
        onClick={() => send({ type: 'turn:stand' })}
      >
        Stand
      </button>
    </div>
  );
}
