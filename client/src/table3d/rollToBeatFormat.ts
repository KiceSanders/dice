import type { HandScore } from '@dice/shared';

/** Compact roll-to-beat summary for the table overlay (digits, not spelled-out counts). */
export interface RollToBeatSummary {
  /** Null for straights (no face die). */
  count: number | null;
  /** Null for straights. */
  face: HandScore['face'] | null;
  rollsUsed: number;
  straight: boolean;
}

export function summarizeRollToBeat(score: HandScore): RollToBeatSummary {
  if (score.straight === 'straight') {
    return { count: null, face: null, rollsUsed: score.rollsUsed, straight: true };
  }
  return {
    count: score.count,
    face: score.face,
    rollsUsed: score.rollsUsed,
    straight: false,
  };
}

/** Accessible / text fallback, e.g. "3 6s in 1 roll" or "Straight in 2 rolls". */
export function formatRollToBeatText(score: HandScore): string {
  const rolls = score.rollsUsed === 1 ? '1 roll' : `${score.rollsUsed} rolls`;
  if (score.straight === 'straight') return `Straight in ${rolls}`;
  const plural = score.count > 1 ? 's' : '';
  return `${score.count} ${score.face}${plural} in ${rolls}`;
}
