import type { BodyPose, Die } from '@dice/shared';
import { HAND_SIZE, validateRestPose } from '@dice/shared';

export type ThrowValidationError = {
  code: 'BAD_REQUEST';
  message: string;
};

const bad = (message: string): ThrowValidationError => ({ code: 'BAD_REQUEST', message });

/** Keep indices: unique integers in [0, HAND_SIZE). */
export function validateKeepIndices(keepIndices: number[]): ThrowValidationError | null {
  const unique = new Set(keepIndices);
  if (unique.size !== keepIndices.length) return bad('duplicate keep indices');
  for (const i of keepIndices) {
    if (!Number.isInteger(i) || i < 0 || i >= HAND_SIZE) {
      return bad(`invalid keep index: ${i}`);
    }
  }
  return null;
}

/** Reported physics faces: exactly HAND_SIZE integers in [1, 6]. */
export function validateCommitDice(dice: readonly number[]): ThrowValidationError | null {
  if (dice.length !== HAND_SIZE) return bad(`expected ${HAND_SIZE} dice`);
  if (!dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) {
    return bad('dice must be integers in [1, 6]');
  }
  return null;
}

/** Kept positions must be unchanged from the previous hand. */
export function validateKeptUnchanged(
  previous: readonly number[],
  next: readonly number[],
  keepIndices: number[],
): ThrowValidationError | null {
  for (const i of keepIndices) {
    if (next[i] !== previous[i]) return bad('kept dice cannot change value');
  }
  return null;
}

/**
 * Soft gate (ADR 005): a bad pose is dropped, never the throw. Returns the
 * validated pose or null (and optionally logs why).
 */
export function softGateRestPose(
  restPose: BodyPose[] | undefined,
  dice: Die[],
  onDrop?: (reason: string) => void,
): BodyPose[] | null {
  if (!restPose) return null;
  const reason = validateRestPose(restPose, dice);
  if (reason === null) return restPose;
  onDrop?.(reason);
  return null;
}
