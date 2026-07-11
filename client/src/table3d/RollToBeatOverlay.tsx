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
  const rollsLabel = summary.rollsUsed === 1 ? '1 roll' : `${summary.rollsUsed} rolls`;

  return (
    <div className="roll-to-beat-overlay">
      <span className="roll-to-beat-label">Roll to beat</span>
      <div className="roll-to-beat-hand">
        {summary.straight ? (
          <span className="roll-to-beat-straight">Straight</span>
        ) : (
          <>
            <span className="roll-to-beat-count">{summary.count}</span>
            {summary.face !== null && <Die value={summary.face} small />}
          </>
        )}
        <span className="roll-to-beat-rolls">in {rollsLabel}</span>
      </div>
      <div className="roll-to-beat-names">{names}</div>
    </div>
  );
}
