import type { BetALotStatePublic, PlayerPublic, RoomSnapshot } from '@dice/shared';

/** Stable column colors; logical seat numbers may be any two of the eight slots. */
export const BETALOT_HISTORY_COLORS = [
  'betalot-history-dot--blue',
  'betalot-history-dot--red',
] as const;

/**
 * Last 10 round winners as colored dots in two columns on the right of the
 * table (empty-seat side in heads-up). Newest wins sit at the top; each row
 * has a dot only in the winner's column.
 */
export default function BetALotRoundHistory({ snapshot }: { snapshot: RoomSnapshot }) {
  const game = snapshot.game as BetALotStatePublic | null;
  if (!game) return null;

  const seated = snapshot.players
    .filter((player): player is PlayerPublic & { seat: number } => player.seat !== null)
    .sort((a, b) => a.seat - b.seat)
    .slice(0, 2);
  if (seated.length !== 2) return null;

  return (
    <aside className="betalot-round-history" aria-label="Last 10 rounds">
      <div className="betalot-round-history-headers">
        {seated.map((player) => (
          <div key={player.id} className="betalot-round-history-header">
            {player.name}
          </div>
        ))}
      </div>
      <div className="betalot-round-history-rows">
        {game.roundHistory.map((entry) => (
          <div key={entry.roundNumber} className="betalot-round-history-row">
            {seated.map((player, column) => {
              const won = entry.winnerId === player.id;
              return (
                <span
                  key={player.id}
                  className={`betalot-history-dot${won ? ` ${BETALOT_HISTORY_COLORS[column]}` : ' betalot-history-dot--empty'}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
