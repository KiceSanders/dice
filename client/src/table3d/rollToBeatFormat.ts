import { type HandScore, isClassicWin } from '@dice/shared';

/** Compact roll-to-beat summary for the table overlay (digits, not spelled-out counts). */
export type RollToBeatSummary =
  | { kind: 'classic' }
  | { kind: 'yahtzee'; rollsUsed: number }
  | { kind: 'group'; count: number; face: HandScore['face']; rollsUsed: number };

export function summarizeRollToBeat(score: HandScore): RollToBeatSummary {
  if (isClassicWin(score)) {
    return { kind: 'classic' };
  }
  if (score.count === 5) {
    return { kind: 'yahtzee', rollsUsed: score.rollsUsed };
  }
  return {
    kind: 'group',
    count: score.count,
    face: score.face,
    rollsUsed: score.rollsUsed,
  };
}

function rollsLabel(rollsUsed: number): string {
  return rollsUsed === 1 ? '1 roll' : `${rollsUsed} rolls`;
}

/** Accessible / text fallback, e.g. "3 6s in 1 roll" or "Yahtzee in 2 rolls". */
export function formatRollToBeatText(score: HandScore): string {
  if (isClassicWin(score)) return 'Classic';
  const rolls = rollsLabel(score.rollsUsed);
  if (score.count === 5) return `Yahtzee in ${rolls}`;
  const plural = score.count > 1 ? 's' : '';
  return `${score.count} ${score.face}${plural} in ${rolls}`;
}
