import { describe, expect, it } from 'vitest';
import { DEFAULT_DICE_PHYSICS_TUNING } from './tuning';
import { KOOZIE } from './constants';
import {
  KEPT_DIE_SPACING,
  keepSlotForIndex,
  keptDieRailPosition,
  keptDieRailPositionForSeat,
  koozieParkedPosition,
  koozieRestPosition,
  koozieRestPositionForSeat,
} from './diceLayout';
import { seatAngle, TABLE_SEAT_COUNT } from '../layout';

describe('diceLayout', () => {
  it('koozie rests outside the far rail for seat 0 (−Z)', () => {
    const homeZ = DEFAULT_DICE_PHYSICS_TUNING.cup.homeZ;
    const floatY = DEFAULT_DICE_PHYSICS_TUNING.cup.floatCenterY;
    const [x, y, z] = koozieParkedPosition(floatY, homeZ, KOOZIE.radius, 0);
    expect(x).toBeCloseTo(0, 3);
    expect(y).toBeCloseTo(floatY, 3);
    expect(z).toBeLessThan(-2);
  });

  it('koozie rest for seat 0 is opposite the near side', () => {
    const floatY = DEFAULT_DICE_PHYSICS_TUNING.cup.floatCenterY;
    const [x0, , z0] = koozieRestPositionForSeat(0, TABLE_SEAT_COUNT, floatY);
    const angle = seatAngle(0, TABLE_SEAT_COUNT) + Math.PI;
    expect(x0).toBeCloseTo(Math.cos(angle) * Math.hypot(x0, z0), 1);
    expect(z0).toBeLessThan(0);
  });

  it('keptDieRailPosition places dice in a row toward the roller seat', () => {
    const count = 3;
    const positions = Array.from({ length: count }, (_, slot) =>
      keptDieRailPosition(slot, count, 0),
    );
    expect(positions[0]![0]).toBeCloseTo(KEPT_DIE_SPACING, 2);
    expect(positions[1]![0]).toBeCloseTo(0, 2);
    expect(positions[2]![0]).toBeCloseTo(-KEPT_DIE_SPACING, 2);
    for (const pos of positions) {
      expect(pos[2]).toBeGreaterThan(1.5);
    }
  });

  it('keptDieRailPositionForSeat aligns with seat direction', () => {
    const [x, , z] = keptDieRailPositionForSeat(1, TABLE_SEAT_COUNT, 0, 1);
    const dir = seatAngle(1, TABLE_SEAT_COUNT);
    expect(x).toBeCloseTo(Math.cos(dir) * Math.hypot(x, z), 2);
    expect(z).toBeCloseTo(Math.sin(dir) * Math.hypot(x, z), 2);
  });

  it('keepSlotForIndex maps die index to tray slot', () => {
    expect(keepSlotForIndex(2, [1, 2, 4])).toBe(1);
    expect(keepSlotForIndex(0, [1, 2, 4])).toBe(-1);
  });
});
