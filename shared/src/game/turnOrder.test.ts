import { describe, expect, it } from 'vitest';
import { orderPlayersFromFirstRollerSeat } from './turnOrder.js';

const seats = (...ns: number[]) => ns.map((seat) => ({ id: `p${seat}`, seat }));

describe('orderPlayersFromFirstRollerSeat', () => {
  it('starts at the lowest seat when there is no previous first roller', () => {
    expect(orderPlayersFromFirstRollerSeat(seats(2, 0, 1), null).map((p) => p.seat)).toEqual([
      0, 1, 2,
    ]);
  });

  it('rotates the first roller counter-clockwise, then plays clockwise', () => {
    // Previous first was seat 0 → CCW first is seat 2 → order 2, 0, 1.
    expect(orderPlayersFromFirstRollerSeat(seats(0, 1, 2), 0).map((p) => p.seat)).toEqual([
      2, 0, 1,
    ]);
    // Previous first was seat 2 → CCW first is seat 1 → order 1, 2, 0.
    expect(orderPlayersFromFirstRollerSeat(seats(0, 1, 2), 2).map((p) => p.seat)).toEqual([
      1, 2, 0,
    ]);
    // Previous first was seat 1 → CCW first is seat 0 → order 0, 1, 2.
    expect(orderPlayersFromFirstRollerSeat(seats(0, 1, 2), 1).map((p) => p.seat)).toEqual([
      0, 1, 2,
    ]);
  });

  it('skips absent seats when walking counter-clockwise (sit-out / non-tied)', () => {
    // Previous first seat 0 sat out; able = {1,2}. CCW from 0 wraps to 2.
    expect(orderPlayersFromFirstRollerSeat(seats(1, 2), 0).map((p) => p.seat)).toEqual([2, 1]);
    // Tie between 0 and 1 after seat 0 opened: CCW from 0 among {0,1} is 1.
    expect(orderPlayersFromFirstRollerSeat(seats(0, 1), 0).map((p) => p.seat)).toEqual([1, 0]);
    // Nested tie after seat 1 opened the sub-round: CCW among {0,1} is 0.
    expect(orderPlayersFromFirstRollerSeat(seats(0, 1), 1).map((p) => p.seat)).toEqual([0, 1]);
  });
});
