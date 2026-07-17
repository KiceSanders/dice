import type { Die } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { shouldLockKoozieAfterSettledRoll } from './afterRollKoozie';

describe('shouldLockKoozieAfterSettledRoll', () => {
  it('keeps ordinary and straight rolls immediately reusable', () => {
    expect(shouldLockKoozieAfterSettledRoll([2, 2, 3, 4, 6], 1, 5, true)).toBe(false);
    expect(shouldLockKoozieAfterSettledRoll([1, 2, 3, 4, 5], 2, 5, true)).toBe(false);
  });

  it('locks capped rolls before the delayed possession change', () => {
    expect(shouldLockKoozieAfterSettledRoll([2, 2, 3, 4, 6], 3, 3, false)).toBe(true);
  });

  it('locks an enabled Yahtzee transition but not a disabled bonus', () => {
    const yahtzee: Die[] = [6, 6, 6, 6, 6];
    expect(shouldLockKoozieAfterSettledRoll(yahtzee, 1, 5, true)).toBe(true);
    expect(shouldLockKoozieAfterSettledRoll(yahtzee, 1, 5, false)).toBe(false);
  });
});
