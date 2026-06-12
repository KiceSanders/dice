import type { PlayerPublic, RoomSnapshot } from '@dice/shared';
import Seat from './Seat';

interface Props {
  snapshot: RoomSnapshot;
  myId: string | null;
  onKick: (playerId: string) => void;
  /** Highlighted as the round winner during the round-end recap. */
  winnerId?: string | null;
}

/** Oval table with up to 8 seats arranged around it; stacks vertically on narrow screens. */
export default function Table({ snapshot, myId, onKick, winnerId = null }: Props) {
  const isHost = myId !== null && snapshot.hostId === myId;
  const activeId = snapshot.game?.currentTurn?.playerId ?? null;
  const bySeat = new Map<number, PlayerPublic>();
  for (const p of snapshot.players) {
    if (p.seat !== null) bySeat.set(p.seat, p);
  }

  const seatCount = Math.min(Math.max(snapshot.settings.maxPlayers, 2), 8);
  const seats = Array.from({ length: seatCount }, (_, i) => {
    // Distribute seats around an ellipse, seat 0 at the bottom.
    const angle = (Math.PI / 2) + (i / seatCount) * Math.PI * 2;
    const x = 50 + 44 * Math.cos(angle);
    const y = 50 + 40 * Math.sin(angle);
    const player = bySeat.get(i) ?? null;
    return (
      <div
        key={i}
        className="seat-anchor"
        style={{ '--x': `${x}%`, '--y': `${y}%` } as React.CSSProperties}
      >
        <Seat
          seatIndex={i}
          player={player}
          isMe={player !== null && player.id === myId}
          isActive={player !== null && player.id === activeId}
          isWinner={player !== null && player.id === winnerId}
          canKick={isHost && player !== null && player.id !== myId}
          onKick={onKick}
        />
      </div>
    );
  });

  return (
    <div className="table">
      <div className="table-felt">
        <div className="table-center">
          {snapshot.game ? (
            <>
              <span className="table-pot">Pot {snapshot.game.pot}</span>
              <span className="table-phase">round {snapshot.game.roundNumber}</span>
            </>
          ) : (
            <>
              <span className="table-room-id">{snapshot.roomId}</span>
              <span className="table-phase">waiting to start</span>
            </>
          )}
        </div>
      </div>
      <div className="seats">{seats}</div>
    </div>
  );
}
