import { type Die, type DieSides, type Quat, readPolyhedralTopFace } from '@dice/shared';

export function isSixSidedDice(dice: number[]): dice is Die[] {
  return dice.every((value) => Number.isInteger(value) && value >= 1 && value <= 6);
}

/** Read physics orientations; dev overrides and missing-body fallbacks use the same side count. */
export function sampleDieValues(input: {
  diceCount: number;
  runtimeCount: number;
  sides: DieSides;
  kept: number[];
  committed: number[];
  fallback?: number[];
  forced?: number[];
  rotation: (index: number) => Quat | null;
}): number[] {
  const forced =
    input.forced?.length === input.diceCount &&
    input.forced.every((d) => Number.isInteger(d) && d >= 1 && d <= input.sides)
      ? input.forced
      : null;
  return Array.from({ length: input.runtimeCount }, (_, i) => {
    if (input.kept.includes(i) && input.committed[i]) return input.committed[i]!;
    if (forced && i < input.diceCount) return forced[i]!;
    const rotation = input.rotation(i);
    return rotation
      ? readPolyhedralTopFace(rotation, input.sides)
      : (input.fallback?.[i] ?? input.committed[i] ?? 1);
  });
}
