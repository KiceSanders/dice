import { describe, expect, it } from 'vitest';
import { DEFAULT_DICE_PHYSICS_TUNING } from './tuning';
import {
  KEPT_DIE_GAP,
  KEPT_DIE_RAIL_Y,
  KEPT_DIE_SPACING,
  keepSlotForIndex,
  keptDieRailPosition,
  koozieParkedPosition,
} from './diceLayout';

describe('diceLayout', () => {
  it('koozieParkedPosition mirrors home across the table (−Z)', () => {
    const homeZ = DEFAULT_DICE_PHYSICS_TUNING.cup.homeZ;
    const floatY = DEFAULT_DICE_PHYSICS_TUNING.cup.floatCenterY;
    const [x, y, z] = koozieParkedPosition(floatY, homeZ);
    expect(x).toBeCloseTo(0, 3);
    expect(y).toBeCloseTo(floatY, 3);
    expect(z).toBeCloseTo(-homeZ, 3);
    expect(z).toBeLessThan(0);
  });

  it('keptDieRailPosition places dice in a row on the near rail', () => {
    const count = 3;
    const positions = Array.from({ length: count }, (_, slot) => keptDieRailPosition(slot, count));
    expect(positions[0]![0]).toBeCloseTo(-KEPT_DIE_SPACING, 3);
    expect(positions[1]![0]).toBeCloseTo(0, 3);
    expect(positions[2]![0]).toBeCloseTo(KEPT_DIE_SPACING, 3);
    for (const pos of positions) {
      expect(pos[1]).toBeCloseTo(KEPT_DIE_RAIL_Y, 3);
      expect(pos[2]).toBeGreaterThan(1.5);
    }
    expect(positions[1]![0] - positions[0]![0]).toBeCloseTo(KEPT_DIE_SPACING, 3);
    expect(positions[2]![0] - positions[1]![0]).toBeCloseTo(KEPT_DIE_SPACING, 3);
  });

  it('keepSlotForIndex maps die index to tray slot', () => {
    expect(keepSlotForIndex(2, [1, 2, 4])).toBe(1);
    expect(keepSlotForIndex(0, [1, 2, 4])).toBe(-1);
  });
});
