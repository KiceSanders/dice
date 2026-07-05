import { useEffect } from 'react';
import type { PlayerPublic } from '@dice/shared';
import type { RoundEndInfo } from '../state/store';
import { describeScore } from './GameHud';

/** Mounted after a 3s reveal delay; clear just before the server's 5s next-round timer. */
const AUTO_DISMISS_MS = 1_800;

interface Props {
  roundEnd: RoundEndInfo;
  players: PlayerPublic[];
  onDismiss: () => void;
}

/** Winner highlight + pot-slide + scores recap after each round (PLAN.md 9.5). */
export default function RoundEndModal({ roundEnd, players, onDismiss }: Props) {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'unknown';

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [roundEnd.receivedAt, onDismiss]);

  // Best hand first, mirroring the canonical ordering loosely for display.
  const scores = [...roundEnd.scores].sort((a, b) =>
    a.playerId === roundEnd.winnerId ? -1 : b.playerId === roundEnd.winnerId ? 1 : 0,
  );

  return (
    <div className="modal-backdrop" onClick={onDismiss} role="presentation">
      <div
        className="modal round-end-modal"
        role="dialog"
        aria-label="round results"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pot-slide" aria-hidden>
          <span className="chip-stack">
            <span className="chip" />
            <span className="chip" />
            <span className="chip" />
          </span>
        </div>
        <h2 className="round-end-title">
          {roundEnd.winnerId === null
            ? 'No hands stood — the pot carries over'
            : `${nameOf(roundEnd.winnerId)} wins ${roundEnd.potWon} ${roundEnd.potWon === 1 ? 'chip' : 'chips'}!`}
        </h2>
        <ul className="round-end-scores">
          {scores.map(({ playerId, score }) => (
            <li key={playerId} className={playerId === roundEnd.winnerId ? 'round-end-winner' : ''}>
              <span className="round-end-name">{nameOf(playerId)}</span>
              <span className="round-end-hand">
                {describeScore(score)} · {score.rollsUsed} {score.rollsUsed === 1 ? 'roll' : 'rolls'}
              </span>
            </li>
          ))}
        </ul>
        <small className="muted">Next round starting…</small>
      </div>
    </div>
  );
}
