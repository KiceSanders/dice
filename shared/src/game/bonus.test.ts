import { describe, expect, it } from 'vitest';
import type { StraightBonusConfig } from '../types.js';
import { calcStraightBonus } from './bonus.js';

const base: StraightBonusConfig = {
  enabled: true,
  type: 'pot',
  baseAmount: 5,
  multiplier: 2,
  incremental: false,
  maxBonus: 50,
};

describe('calcStraightBonus', () => {
  it('returns 0 when disabled', () => {
    expect(calcStraightBonus({ ...base, enabled: false }, 'big', 3)).toBe(0);
  });

  it('pays baseAmount for a little straight', () => {
    expect(calcStraightBonus(base, 'little', 1)).toBe(5);
  });

  it('applies the multiplier for a big straight', () => {
    expect(calcStraightBonus(base, 'big', 1)).toBe(10);
  });

  it('ignores streak when incremental is off', () => {
    expect(calcStraightBonus(base, 'little', 4)).toBe(5);
  });

  it('scales by streak length when incremental is on', () => {
    const cfg = { ...base, incremental: true };
    expect(calcStraightBonus(cfg, 'little', 1)).toBe(5);
    expect(calcStraightBonus(cfg, 'little', 3)).toBe(15);
    expect(calcStraightBonus(cfg, 'big', 2)).toBe(20); // 5 * 2 (big) * 2 (streak)
  });

  it('clips to maxBonus after all scaling', () => {
    const cfg = { ...base, incremental: true, maxBonus: 18 };
    expect(calcStraightBonus(cfg, 'big', 5)).toBe(18); // would be 50
    expect(calcStraightBonus({ ...base, maxBonus: 7 }, 'big', 1)).toBe(7);
  });

  it('never pays negative even with a pathological config', () => {
    expect(calcStraightBonus({ ...base, baseAmount: -5 }, 'little', 1)).toBe(0);
  });

  it('throws on an invalid streak length', () => {
    expect(() => calcStraightBonus(base, 'little', 0)).toThrow();
    expect(() => calcStraightBonus(base, 'little', 1.5)).toThrow();
  });
});
