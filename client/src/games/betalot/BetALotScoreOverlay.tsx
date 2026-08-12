import type { BetALotStatePublic, PlayerPublic } from '@dice/shared';

/** Current ladder total in the shared top-band score lane. */
export default function BetALotScoreOverlay({
  game,
  players,
}: {
  game: BetALotStatePublic;
  players: PlayerPublic[];
}) {
  const latest = game.ladder.at(-1);
  const currentName =
    players.find((player) => player.id === game.currentPlayerId)?.name ?? 'Waiting';
  const turnLabel = game.awaitingCall
    ? `${currentName} · call a face`
    : game.extraRoll
      ? `${currentName} · extra die, match ${game.extraRoll.face}`
      : `${currentName} · ${game.currentDiceCount} ${game.currentDiceCount === 1 ? 'die' : 'dice'}`;

  return (
    <div className="roll-to-beat-overlay">
      <div className="roll-to-beat-hand">
        <span className="roll-to-beat-rolls">Round {game.roundNumber}</span>
        {latest && (
          <>
            <span className="roll-to-beat-rolls">Score to beat</span>
            <span className="roll-to-beat-count">{latest.score}</span>
          </>
        )}
      </div>
      <div className="roll-to-beat-names">{turnLabel}</div>
    </div>
  );
}
