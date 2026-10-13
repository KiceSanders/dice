import { assertNever } from '../../assert.js';
import type { Die } from '../../types.js';

export type SlotDifficulty = 'easy' | 'medium' | 'hard';
export type SlotCondition =
  | { kind: 'matching'; count: number; face: Die | null }
  | { kind: 'straight' }
  | { kind: 'full-house' };

export interface SlotTarget {
  id: string;
  difficulty: SlotDifficulty;
  label: string;
  description: string;
  payout: number;
  condition: SlotCondition;
}

const FACES: readonly Die[] = [1, 2, 3, 4, 5, 6];
export const SLOT_DIFFICULTIES: readonly SlotDifficulty[] = ['easy', 'medium', 'hard'];

/** Curated contracts: literal faces, unordered dice, no wilds. */
export const SLOT_TARGETS: Record<SlotDifficulty, readonly SlotTarget[]> = {
  easy: FACES.map((face) => ({
    id: `pair-${face}`,
    difficulty: 'easy',
    label: `Pair of ${face}s`,
    description: `At least two dice showing ${face}`,
    payout: 3,
    condition: { kind: 'matching', count: 2, face },
  })),
  medium: [
    ...FACES.map(
      (face): SlotTarget => ({
        id: `triple-${face}`,
        difficulty: 'medium',
        label: `Three ${face}s`,
        description: `At least three dice showing ${face}`,
        payout: 10,
        condition: { kind: 'matching', count: 3, face },
      }),
    ),
    {
      id: 'full-house',
      difficulty: 'medium',
      label: 'Full house',
      description: 'Three of one face + two of another',
      payout: 12,
      condition: { kind: 'full-house' },
    },
    {
      id: 'straight',
      difficulty: 'medium',
      label: 'Five-dice straight',
      description: '1–2–3–4–5 or 2–3–4–5–6, in any order',
      payout: 15,
      condition: { kind: 'straight' },
    },
  ],
  hard: [
    ...FACES.map(
      (face): SlotTarget => ({
        id: `four-${face}`,
        difficulty: 'hard',
        label: `Four ${face}s`,
        description: `At least four dice showing ${face}`,
        payout: 30,
        condition: { kind: 'matching', count: 4, face },
      }),
    ),
    {
      id: 'five-alike',
      difficulty: 'hard',
      label: 'Five of a kind',
      description: 'All five dice showing the same face',
      payout: 75,
      condition: { kind: 'matching', count: 5, face: null },
    },
    {
      id: 'five-sixes',
      difficulty: 'hard',
      label: 'Five sixes',
      description: '6–6–6–6–6',
      payout: 100,
      condition: { kind: 'matching', count: 5, face: 6 },
    },
  ],
};

export function slotTargetMatches(target: SlotTarget, dice: readonly Die[]): boolean {
  if (dice.length !== 5) return false;
  const counts = FACES.map((face) => dice.filter((value) => value === face).length);
  const condition = target.condition;
  switch (condition.kind) {
    case 'matching':
      return condition.face === null
        ? counts.some((count) => count >= condition.count)
        : counts[condition.face - 1]! >= condition.count;
    case 'straight': {
      const sorted = [...dice].sort((a, b) => a - b);
      return sorted.every((face, index) => face === sorted[0]! + index);
    }
    case 'full-house':
      return counts.includes(3) && counts.includes(2);
    default:
      return assertNever(condition, 'slot condition');
  }
}

export function highestSlotTarget(
  targets: readonly SlotTarget[],
  dice: readonly Die[],
): SlotTarget | null {
  return targets.reduce<SlotTarget | null>(
    (best, target) =>
      slotTargetMatches(target, dice) && target.payout > (best?.payout ?? 0) ? target : best,
    null,
  );
}
