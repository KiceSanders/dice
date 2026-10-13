import {
  type Die,
  SLOT_DICE_COUNT,
  SLOT_DIFFICULTIES,
  SLOT_TARGETS,
  type SlotTarget,
} from '@dice/shared';

export { SLOT_REEL_BASE_MS, SLOT_REEL_STAGGER_MS, SLOT_REVEAL_MS } from '@dice/shared';

/** Rejection sampling keeps the six faces equally likely. Practice-only browser randomness. */
function randomIndex(size: number): number {
  const sample = new Uint32Array(1);
  const ceiling = 2 ** 32 - (2 ** 32 % size);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0]! >= ceiling);
  return sample[0]! % size;
}

export function drawSlotDice(): Die[] {
  return Array.from({ length: SLOT_DICE_COUNT }, () => (randomIndex(6) + 1) as Die);
}

export function drawSlotTargets(previous: readonly SlotTarget[] = []): SlotTarget[] {
  return SLOT_DIFFICULTIES.map((difficulty) => {
    const pool = SLOT_TARGETS[difficulty].filter(
      (target) => !previous.some((old) => old.id === target.id),
    );
    return pool[randomIndex(pool.length)]!;
  });
}

/** The strip passes real 1–6 faces, then stops exactly on the sampled face. */
export function buildSlotReel(from: Die, to: Die): { faces: Die[]; stopIndex: number } {
  const stopIndex = 19 + ((to - from + 6) % 6);
  return {
    faces: Array.from(
      { length: stopIndex + 2 },
      (_, index) => ((from + index + 4) % 6) + 1,
    ) as Die[],
    stopIndex,
  };
}
