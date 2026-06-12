import { useEffect } from 'react';
import type { PlayerPublic } from '@dice/shared';
import type { BonusInfo } from '../state/store';

const AUTO_DISMISS_MS = 4_000;

interface Props {
  bonus: BonusInfo;
  players: PlayerPublic[];
  onDismiss: () => void;
}

/** Straight celebration banner: kind, amount, target, streak (PLAN.md 9.5). */
export default function BonusBanner({ bonus, players, onDismiss }: Props) {
  const playerName = players.find((p) => p.id === bonus.playerId)?.name ?? 'unknown';

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [bonus.receivedAt, onDismiss]);

  return (
    <div className={`bonus-banner bonus-${bonus.kind}`} role="status">
      <strong>{bonus.kind === 'big' ? 'BIG STRAIGHT!' : 'Little straight!'}</strong>{' '}
      {playerName} earns +{bonus.amount} {bonus.target === 'pot' ? 'to the pot' : 'chips'}
      {bonus.streak > 1 && <span className="bonus-streak"> · streak ×{bonus.streak}</span>}
      <button type="button" className="toast-close" aria-label="dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
