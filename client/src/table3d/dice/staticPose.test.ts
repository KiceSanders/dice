import { describe, expect, it } from 'vitest';
import { DICE_COUNT, dieSlotPosition } from './constants';
import { keptDieRailPosition } from './diceLayout';
import { staticPoseFromDice } from './staticPose';

describe('staticPoseFromDice', () => {
  it('places kept dice on the rail and unkept dice on felt slots', () => {
    const pose = staticPoseFromDice([1, 2, 3, 4, 5], [1, 3]);
    expect(pose?.cupVisible).toBe(false);
    expect(pose?.bodies).toHaveLength(DICE_COUNT + 1);

    const die0 = pose!.bodies[1]!;
    const die1 = pose!.bodies[2]!;
    const die3 = pose!.bodies[4]!;
    expect(die0.slice(0, 3)).toEqual(dieSlotPosition(0));
    expect(die1.slice(0, 3)).toEqual(keptDieRailPosition(0, 2));
    expect(die3.slice(0, 3)).toEqual(keptDieRailPosition(1, 2));
  });
});
