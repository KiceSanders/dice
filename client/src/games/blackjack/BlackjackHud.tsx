import { isBlackjackState, type RoomSnapshot } from '@dice/shared';
import { useApp } from '../../state/context';

export function BlackjackRoundStatus({ snapshot }: { snapshot: RoomSnapshot }) {
  const game = isBlackjackState(snapshot.game) ? snapshot.game : null;
  if (!game) return null;
  const name = snapshot.players.find((p) => p.id === game.currentPlayerId)?.name ?? 'Player';
  const winner = snapshot.players.find((p) => p.id === game.result?.winnerId)?.name ?? 'Player';
  return (
    <div className="blackjack-round-status" role="status">
      <span className="hud-label">Dice Blackjack · Round {game.roundNumber}</span>
      <strong>
        {game.result
          ? `${winner} wins ${game.result.amount} chips`
          : game.overtime
            ? `Overtime ${game.overtime} · ${game.payout} chips`
            : `${game.payout} chips to win`}
      </strong>
      <span>
        {game.result
          ? game.result.reason === 'bust'
            ? 'Opponent busts'
            : game.result.reason === 'forfeit'
              ? 'Opponent forfeits'
              : 'Higher score wins'
          : `${game.dieSides}-sided die · Target 21`}
      </span>
      <small>
        {!game.result &&
          (game.resolving
            ? 'Inspect the die…'
            : game.awaitingDecision
              ? `${name}: stand or continue`
              : `${name} to roll`)}
      </small>
    </div>
  );
}

/** Decisions stay in the table's existing control gutter, outside the felt. */
export function BlackjackControls({
  snapshot,
  myId,
}: {
  snapshot: RoomSnapshot;
  myId: string | null;
}) {
  const { send, state } = useApp();
  if (!isBlackjackState(snapshot.game)) return null;
  const game = snapshot.game;
  const connected = state.connection === 'open';
  const seated = snapshot.players.some((p) => p.id === myId && p.seat !== null);
  if (game.result && seated)
    return (
      <div className="table-stand blackjack-controls">
        <button
          type="button"
          disabled={!connected}
          onClick={() => send({ type: 'round:continue' })}
        >
          Next round
        </button>
      </div>
    );
  if (game.currentPlayerId !== myId || !game.awaitingDecision) return null;
  return (
    <div className="table-stand blackjack-controls">
      <button
        type="button"
        className="table-stand-button"
        disabled={!connected || game.resolving}
        onClick={() => send({ type: 'blackjack:decide', decision: 'stand' })}
      >
        Stand
      </button>
      <button
        type="button"
        disabled={!connected || game.resolving}
        onClick={() => send({ type: 'blackjack:decide', decision: 'continue' })}
      >
        Continue
      </button>
    </div>
  );
}
