import { describe, expect, it } from 'vitest';
import { layoutPotChips, potChipRows } from './potChipLayout';

describe('potChipRows', () => {
  it('forms the requested three-chip pyramid', () => {
    expect(potChipRows(3)).toEqual([2, 1]);
  });

  it('keeps one row per descending triangular capacity', () => {
    expect(potChipRows(1)).toEqual([1]);
    expect(potChipRows(5)).toEqual([3, 2]);
    expect(potChipRows(6)).toEqual([3, 2, 1]);
  });
});

describe('layoutPotChips', () => {
  it('returns exactly one in-bounds point per chip', () => {
    for (const count of [1, 2, 3, 10, 100, 1_000, 3_000]) {
      const layout = layoutPotChips(count, 76, 55);
      expect(layout.points).toHaveLength(count);
      for (const point of layout.points) {
        expect(point.x - point.radius).toBeGreaterThanOrEqual(-1e-9);
        expect(point.x + point.radius).toBeLessThanOrEqual(layout.width + 1e-9);
        expect(point.y - point.radius).toBeGreaterThanOrEqual(-1e-9);
        expect(point.y + point.radius).toBeLessThanOrEqual(layout.height + 1e-9);
      }
    }
  });

  it('places two chips on the bottom and one centered above for a pot of three', () => {
    const [left, right, top] = layoutPotChips(3, 76, 55).points;
    expect(left?.y).toBeCloseTo(right?.y ?? 0);
    expect(top?.y).toBeLessThan(left?.y ?? 0);
    expect((left?.x ?? 0) + (right?.x ?? 0)).toBeCloseTo(76);
    expect(top?.x).toBeCloseTo(38);
  });
});
