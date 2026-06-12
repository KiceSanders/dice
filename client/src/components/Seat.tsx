import type { PlayerPublic } from '@dice/shared';

interface Props {
  seatIndex: number;
  player: PlayerPublic | null;
  isMe: boolean;
  /** It is currently this player's turn. */
  isActive?: boolean;
  /** This player just won the round (round-end highlight). */
  isWinner?: boolean;
  /** Viewer is the host and may kick this player. */
  canKick: boolean;
  onKick: (playerId: string) => void;
}

/** One of the 8 positions around the table: a player card or an empty seat. */
export default function Seat({
  seatIndex,
  player,
  isMe,
  isActive = false,
  isWinner = false,
  canKick,
  onKick,
}: Props) {
  if (!player) {
    return (
      <div className="seat seat-empty">
        <span className="seat-number">Seat {seatIndex + 1}</span>
        <span className="seat-empty-label">empty</span>
      </div>
    );
  }

  const classes = [
    'seat',
    'seat-taken',
    isMe ? 'seat-me' : '',
    isActive ? 'seat-active' : '',
    isWinner ? 'seat-winner' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="seat-name-row">
        {isActive && <span className="seat-turn-marker" title="their turn" aria-label="current turn" />}
        <span
          className={`conn-dot ${player.connected ? 'conn-on' : 'conn-off'}`}
          title={player.connected ? 'connected' : 'disconnected'}
        />
        <span className="seat-name">{player.name}</span>
        {player.isHost && <span className="badge badge-host" title="Host">★</span>}
      </div>
      <div className="seat-chips">{player.chips} chips</div>
      {canKick && (
        <button
          type="button"
          className="kick-button"
          title={`Kick ${player.name}`}
          onClick={() => onKick(player.id)}
        >
          Kick
        </button>
      )}
    </div>
  );
}
