import type { HandScore } from '@dice/shared';

/** Compact roll-to-beat summary for the table overlay (digits, not spelled-out counts). */
export interface RollToBeatSummary {
  count: number;
  face: HandScore['face'];
  rollsUsed: number;
}

export function summarizeRollToBeat(score: HandScore): RollToBeatSummary {
  return {
    count: score.count,
    face: score.face,
    rollsUsed: score.rollsUsed,
  };
}

/** Accessible / text fallback, e.g. "3 6s in 1 roll". */
export function formatRollToBeatText(score: HandScore): string {
  const rolls = score.rollsUsed === 1 ? '1 roll' : `${score.rollsUsed} rolls`;
  const plural = score.count > 1 ? 's' : '';
  return `${score.count} ${score.face}${plural} in ${rolls}`;
}
