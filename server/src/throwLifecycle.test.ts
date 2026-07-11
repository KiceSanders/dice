import type { BodyPose, Die } from '@dice/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  softGateRestPose,
  validateCommitDice,
  validateKeepIndices,
  validateKeptUnchanged,
} from './throwLifecycle';

describe('validateKeepIndices', () => {
  it('accepts unique in-range indices', () => {
    expect(validateKeepIndices([0, 2, 4])).toBeNull();
  });

  it('rejects duplicates and out-of-range', () => {
    expect(validateKeepIndices([1, 1])?.message).toMatch(/duplicate/);
    expect(validateKeepIndices([5])?.message).toMatch(/invalid/);
  });
});

describe('validateCommitDice', () => {
  it('requires five faces in 1..6', () => {
    expect(validateCommitDice([1, 2, 3, 4, 5])).toBeNull();
    expect(validateCommitDice([1, 2, 3])?.message).toMatch(/expected/);
    expect(validateCommitDice([1, 2, 3, 4, 7])?.message).toMatch(/integers/);
  });
});

describe('validateKeptUnchanged', () => {
  it('rejects value changes at kept indices', () => {
    expect(validateKeptUnchanged([1, 2, 3, 4, 5], [1, 9, 3, 4, 5], [0, 1])?.message).toMatch(
      /cannot change/,
    );
    expect(validateKeptUnchanged([1, 2, 3, 4, 5], [1, 2, 9, 4, 5], [0, 1])).toBeNull();
  });
});

describe('softGateRestPose', () => {
  it('returns null when omitted', () => {
    expect(softGateRestPose(undefined, [1, 2, 3, 4, 5])).toBeNull();
  });

  it('drops invalid poses and notifies', () => {
    const onDrop = vi.fn();
    const bad: BodyPose[] = Array.from({ length: 5 }, () => [0, 0.05, 0, 0, 0, 0, 1]);
    expect(softGateRestPose(bad, [1, 2, 3, 4, 5] as Die[], onDrop)).toBeNull();
    expect(onDrop).toHaveBeenCalledOnce();
  });
});
