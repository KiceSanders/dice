import type { GameStatePublic, PlayerPublic } from '@dice/shared';
import Die from '../components/Die';
import { summarizeRollToBeat } from './rollToBeatFormat';

interface Props {
  game: GameStatePublic;
  players: PlayerPublic[];
}

/** Compact roll-to-beat chip — rendered in the top game-state band. */
export default function RollToBeatOverlay({ game, players }: Props) {
  const toBeat = game.rollToBeat;
  if (!toBeat) return null;

  const summary = summarizeRollToBeat(toBeat.score);
  const names = toBeat.playerIds
    .map((id) => players.find((p) => p.id === id)?.name ?? 'unknown')
    .join(', ');

  return (
    <div className="roll-to-beat-overlay">
      <div className="roll-to-beat-hand">
        {summary.kind === 'classic' ? (
          <span className="roll-to-beat-classic">Classic</span>
        ) : summary.kind === 'yahtzee' ? (
          <>
            <span className="roll-to-beat-count">Yahtzee</span>
            <span className="roll-to-beat-rolls">
              in {summary.rollsUsed === 1 ? '1 roll' : `${summary.rollsUsed} rolls`}
            </span>
          </>
        ) : (
          <>
            <span className="roll-to-beat-count">{summary.count}</span>
            <Die value={summary.face} small />
            <span className="roll-to-beat-rolls">
              in {summary.rollsUsed === 1 ? '1 roll' : `${summary.rollsUsed} rolls`}
            </span>
          </>
        )}
      </div>
      <div className="roll-to-beat-names">{names}</div>
    </div>
  );
}
