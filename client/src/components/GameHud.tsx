import type { GameStatePublic, HandScore, PlayerPublic } from '@dice/shared';
import DiceRow from './DiceRow';

/** Human-readable hand summary, e.g. "three 4s" or "Big straight". */
export function describeScore(score: HandScore): string {
  if (score.straight === 'big') return 'Big straight';
  if (score.straight === 'little') return 'Little straight';
  const words = ['', 'one', 'two', 'three', 'four', 'five'];
  return `${words[score.count] ?? score.count} ${score.face}${score.count > 1 ? 's' : ''}`;
}

interface Props {
  game: GameStatePublic;
  players: PlayerPublic[];
}

/** Pot, round number, roll-to-beat, and sub-round banner (PLAN.md 9.4). */
export default function GameHud({ game, players }: Props) {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'unknown';

  return (
    <div className="game-hud">
      {game.subRound && (
        <div className="subround-banner">
          <strong>Tie-breaker!</strong> Sub-round depth {game.subRound.depth} ·{' '}
          {game.subRound.anteAmount > 0 ? `ante ${game.subRound.anteAmount} chips` : 'sudden death'} ·{' '}
          {game.subRound.participantIds.map(nameOf).join(' vs ')}
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

        <div className="hud-cell hud-to-beat">
          <span className="hud-label">Roll to beat</span>
          {game.rollToBeat ? (
            <span className="to-beat">
              <DiceRow dice={game.rollToBeat.dice} small />
              <span className="to-beat-meta">
                {describeScore(game.rollToBeat.score)} in {game.rollToBeat.score.rollsUsed}{' '}
                {game.rollToBeat.score.rollsUsed === 1 ? 'roll' : 'rolls'} —{' '}
                {nameOf(game.rollToBeat.playerId)}
              </span>
            </span>
          ) : (
            <span className="muted">none yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
