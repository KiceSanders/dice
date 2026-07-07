import type { Die } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { DICE_COUNT, dieSlotPosition, KOOZIE } from './constants';
import { KEPT_DIE_RAIL_Y, koozieRestPosition } from './diceLayout';
import { buildRuntime } from './diceRuntime';
import { DEFAULT_DICE_PHYSICS_TUNING } from './tuning';

const TUNING = DEFAULT_DICE_PHYSICS_TUNING;
const HAND: Die[] = [3, 1, 4, 6, 2];

function distanceToDock(position: [number, number, number]): number {
  const [dx, dy, dz] = koozieRestPosition(KOOZIE);
  return Math.hypot(position[0] - dx, position[1] - dy, position[2] - dz);
}

describe('buildRuntime — cup mode (the roller)', () => {
  it('hides all dice inside the docked cup before the first roll', () => {
    const runtime = buildRuntime([], [], true, TUNING);
    expect(runtime).toHaveLength(DICE_COUNT);
    for (const rt of runtime) {
      expect(rt.visible).toBe(true);
      expect(rt.meshVisible).toBe(false);
      expect(rt.inCup).toBe(true);
      expect(rt.locked).toBe(false);
      expect(rt.rotation).toBeDefined();
      // Spawned within the cup's interior around the dock position.
      expect(distanceToDock(rt.position)).toBeLessThan(KOOZIE.radius + KOOZIE.height);
    }
  });

  it('puts kept dice on the near rail after a mid-turn remount, unkept visible in the cup', () => {
    const keep = [1, 3];
    const runtime = buildRuntime(HAND, keep, true, TUNING);

    for (const i of keep) {
      const rt = runtime[i]!;
      expect(rt.locked).toBe(true);
      expect(rt.inCup).toBe(false);
      expect(rt.meshVisible).toBe(true);
      // On the kept rail toward the roller — never mid-felt.
      expect(rt.position[1]).toBeCloseTo(KEPT_DIE_RAIL_Y, 5);
      expect(rt.position[2]).toBeGreaterThan(1.5);
      expect(rt.rotation).toBeDefined();
    }

    for (const i of [0, 2, 4]) {
      const rt = runtime[i]!;
      expect(rt.inCup).toBe(true);
      expect(rt.meshVisible).toBe(true); // values exist → dice are shown in the cup
      expect(rt.locked).toBe(false);
      expect(distanceToDock(rt.position)).toBeLessThan(KOOZIE.radius + KOOZIE.height);
    }
  });

  it('centers the kept row: two keeps sit symmetrically about x = 0', () => {
    const runtime = buildRuntime(HAND, [0, 4], true, TUNING);
    expect(runtime[0]!.position[0]).toBeCloseTo(-runtime[4]!.position[0], 5);
  });
});

describe('buildRuntime — passive mode (spectator fallback)', () => {
  it('shows committed dice locked at fixed felt slots', () => {
    const runtime = buildRuntime(HAND, [], false, TUNING);
    for (let i = 0; i < DICE_COUNT; i++) {
      const rt = runtime[i]!;
      expect(rt.visible).toBe(true);
      expect(rt.locked).toBe(true);
      expect(rt.inCup).toBe(false);
      expect(rt.position).toEqual(dieSlotPosition(i));
      expect(rt.rotation).toBeDefined();
    }
  });

  it('hides dice without values', () => {
    const runtime = buildRuntime([], [], false, TUNING);
    for (const rt of runtime) {
      expect(rt.visible).toBe(false);
    }
  });
});
