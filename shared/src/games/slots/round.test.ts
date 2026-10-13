import { describe, expect, it } from 'vitest';
import type { Die } from '../../types.js';
import { canSpinSlots, createSlotRound, type SlotRound, slotRoundReducer } from './round.js';
import { SLOT_TARGETS } from './targets.js';

const targets = [SLOT_TARGETS.easy[5]!, SLOT_TARGETS.medium[5]!, SLOT_TARGETS.hard[5]!];
const start = () => createSlotRound(targets);
const roll = (round: SlotRound, dice: Die[]) =>
  slotRoundReducer(slotRoundReducer(round, { type: 'spin', dice }), { type: 'settle' });

describe('Hit List round', () => {
  it('begins with five available spins and no lockable or collectible hand', () => {
    const round = start();
    expect(canSpinSlots(round)).toBe(true);
    expect(round.spinsUsed).toBe(0);
    expect(round.dice).toEqual([]);
    expect(slotRoundReducer(round, { type: 'toggle-lock', index: 0 })).toBe(round);
    expect(slotRoundReducer(round, { type: 'collect' })).toBe(round);
    expect(slotRoundReducer(round, { type: 'settle' })).toBe(round);
  });

  it('keeps locked positions across multiple spins and lets the player release them', () => {
    let round = roll(start(), [6, 1, 6, 2, 3]);
    round = slotRoundReducer(round, { type: 'toggle-lock', index: 0 });
    round = slotRoundReducer(round, { type: 'toggle-lock', index: 2 });
    round = roll(round, [1, 4, 2, 5, 6]);
    expect(round.dice).toEqual([6, 4, 6, 5, 6]);
    expect(round.locked).toEqual([true, false, true, false, false]);
    round = slotRoundReducer(round, { type: 'toggle-lock', index: 0 });
    round = roll(round, [2, 3, 4, 5, 6]);
    expect(round.dice).toEqual([2, 3, 6, 5, 6]);
    expect(round.spinsUsed).toBe(3);
  });

  it('freezes controls and the outcome until animation settlement', () => {
    const previous = roll(start(), [1, 2, 3, 4, 5]);
    const spinning = slotRoundReducer(previous, { type: 'spin', dice: [6, 6, 6, 6, 6] });
    expect(spinning.dice).toEqual(previous.dice);
    expect(spinning.spinsUsed).toBe(2);
    expect(canSpinSlots(spinning)).toBe(false);
    expect(slotRoundReducer(spinning, { type: 'spin', dice: [1, 1, 1, 1, 1] })).toBe(spinning);
    expect(slotRoundReducer(spinning, { type: 'toggle-lock', index: 0 })).toBe(spinning);
    expect(slotRoundReducer(spinning, { type: 'collect' })).toBe(spinning);
    expect(slotRoundReducer(spinning, { type: 'new-round', targets })).toBe(spinning);
    const settled = slotRoundReducer(spinning, { type: 'settle' });
    expect(settled.dice).toEqual([6, 6, 6, 6, 6]);
    expect(slotRoundReducer(settled, { type: 'settle' })).toBe(settled);
  });

  it('automatically pays the highest final match on spin five, never on spin six', () => {
    let round = start();
    for (let spin = 1; spin <= 4; spin += 1) {
      round = roll(round, [6, 6, 1, 2, 3]);
      expect(round.phase).toBe('choosing');
      expect(round.spinsUsed).toBe(spin);
      expect(round.payout).toBe(0);
    }
    round = roll(round, [6, 6, 6, 6, 2]);
    expect(round.phase).toBe('complete');
    expect(round.payout).toBe(30);
    expect(round.spinsUsed).toBe(5);
    expect(canSpinSlots(round)).toBe(false);
    expect(slotRoundReducer(round, { type: 'spin', dice: [1, 2, 3, 4, 5] })).toBe(round);
    expect(slotRoundReducer(round, { type: 'collect' })).toBe(round);
    expect(slotRoundReducer(round, { type: 'toggle-lock', index: 0 })).toBe(round);
  });

  it('allows an early collection and resets only after completion', () => {
    const round = roll(start(), [6, 6, 6, 1, 2]);
    expect(slotRoundReducer(round, { type: 'new-round', targets })).toBe(round);
    const complete = slotRoundReducer(round, { type: 'collect' });
    expect(complete.phase).toBe('complete');
    expect(complete.payout).toBe(10);
    const nextTargets = [SLOT_TARGETS.easy[0]!, SLOT_TARGETS.medium[0]!, SLOT_TARGETS.hard[0]!];
    const fresh = slotRoundReducer(complete, { type: 'new-round', targets: nextTargets });
    expect(fresh).toEqual(createSlotRound(nextTargets));
  });

  it('does not retain prizes from a previous, uncollected hand', () => {
    let round = roll(start(), [6, 6, 6, 6, 6]);
    round = roll(round, [1, 2, 3, 4, 5]);
    expect(slotRoundReducer(round, { type: 'collect' }).payout).toBe(0);
  });

  it('does not spend a spin when all five dice are locked', () => {
    let round = roll(start(), [6, 6, 6, 6, 6]);
    for (let index = 0; index < 5; index += 1) {
      round = slotRoundReducer(round, { type: 'toggle-lock', index });
    }
    expect(canSpinSlots(round)).toBe(false);
    expect(slotRoundReducer(round, { type: 'spin', dice: [1, 2, 3, 4, 5] })).toBe(round);
    expect(slotRoundReducer(round, { type: 'collect' }).payout).toBe(30);
    expect(canSpinSlots(slotRoundReducer(round, { type: 'toggle-lock', index: 4 }))).toBe(true);
  });

  it.each([-1, 5, 1.5, Number.NaN])('ignores invalid lock index %s', (index) => {
    const round = roll(start(), [1, 2, 3, 4, 5]);
    expect(slotRoundReducer(round, { type: 'toggle-lock', index })).toBe(round);
  });

  it.each([
    [],
    [1, 2, 3, 4],
    [1, 2, 3, 4, 7],
    [0, 2, 3, 4, 5],
    [1.5, 2, 3, 4, 5],
  ])('ignores invalid die results %s', (...dice) => {
    const round = start();
    expect(slotRoundReducer(round, { type: 'spin', dice: dice as Die[] })).toBe(round);
  });
});
