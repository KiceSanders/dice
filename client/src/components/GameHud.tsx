import type { GameStatePublic, HandScore, PlayerPublic } from '@dice/shared';

/** Human-readable hand summary, e.g. "three 4s" or "Yahtzee" (straight flag ignored). */
export function describeScore(score: HandScore): string {
  if (score.count === 5) return 'Yahtzee';
  const words = ['', 'one', 'two', 'three', 'four', 'five'];
  return `${words[score.count] ?? score.count} ${score.face}${score.count > 1 ? 's' : ''}`;
}

interface Props {
  game: GameStatePublic;
  players: PlayerPublic[];
}

/** Round / pot / sub-round banner (roll-to-beat lives on the table overlay). */
export default function GameHud({ game, players }: Props) {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'unknown';

  return (
    <div className="game-hud">
      {game.subRound && (
        <div className="subround-banner">
          <strong>Tie-breaker!</strong> Sub-round depth {game.subRound.depth} ·{' '}
          {game.subRound.anteAmount > 0 ? `ante ${game.subRound.anteAmount} chips` : 'sudden death'}{' '}
          · {game.subRound.participantIds.map(nameOf).join(' vs ')}
        </div>
      )}

      <div className="hud-row">
        <div className="hud-cell hud-round">
          <span className="hud-label">Round</span>
          <span className="hud-value">{game.roundNumber}</span>
        </div>

        <div className="hud-cell hud-pot">
          <span className="hud-label">Pot</span>
          <span className="hud-pot-display">
            <span className="chip-stack" aria-hidden>
              <span className="chip" />
              <span className="chip" />
              <span className="chip" />
            </span>
            <span className="hud-value">{game.pot}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
