import { describe, expect, it } from 'vitest';
import { FELT_SCALE, RAIL_OUTER_WORLD, TABLE, TABLE_WALL_OUTER } from '../layout';
import { projectToNdc } from '../project';
import { DIE_SIZE, FELT_BOUND_X, FELT_BOUND_Z, KOOZIE } from './constants';
import {
  KEPT_DIE_SPACING,
  KOOZIE_GRAB_GUARD_POINT,
  keepSlotForIndex,
  keptDieRailPosition,
  koozieRestPosition,
} from './diceLayout';

function expectOnScreen(point: [number, number, number], label: string) {
  const ndc = projectToNdc(point);
  expect(Math.abs(ndc.x), `${label} ndc.x`).toBeLessThanOrEqual(1);
  expect(Math.abs(ndc.y), `${label} ndc.y`).toBeLessThanOrEqual(1);
  expect(ndc.z, `${label} ndc.z`).toBeLessThan(1);
}

/** Same ellipse test DicePhysics uses to decide "click teleports the cup in". */
function isOutsidePlayBounds(x: number, z: number, cupRadius: number): boolean {
  const margin = cupRadius + 0.16;
  const a = Math.max(FELT_BOUND_X - margin, 0.1);
  const b = Math.max(FELT_BOUND_Z - margin, 0.1);
  return Math.hypot(x / a, z / b) > 1;
}

describe('diceLayout', () => {
  const rest = koozieRestPosition(KOOZIE);

  it('koozie docks across the table (−Z), fully outside the containment wall', () => {
    expect(rest[0]).toBeCloseTo(0, 3);
    // The cup's near edge is beyond the wall's outer face — a settled die can
    // never touch, hide behind, or sit under the parked cup.
    expect(rest[2] + KOOZIE.radius).toBeLessThan(-(FELT_SCALE.z * TABLE_WALL_OUTER));
  });

  it('koozie dock is sunken behind the far rail with the rim peeking over', () => {
    const rimY = rest[1] + KOOZIE.height / 2;
    const railTopY = TABLE.surfaceY + TABLE.railHeight;
    expect(rimY).toBeGreaterThan(railTopY);
    // Only a band peeks over — the cup body is below the rail line.
    expect(rimY - railTopY).toBeLessThan(KOOZIE.height / 2);
  });

  it('koozie rest is outside the play bounds so a click teleports it in', () => {
    expect(isOutsidePlayBounds(rest[0], rest[2], KOOZIE.radius)).toBe(true);
  });

  it('keptDieRailPosition centers a row on the near rail toward the roller', () => {
    const count = 3;
    const positions = Array.from({ length: count }, (_, slot) => keptDieRailPosition(slot, count));
    expect(positions[0]![0]).toBeCloseTo(-KEPT_DIE_SPACING, 2);
    expect(positions[1]![0]).toBeCloseTo(0, 2);
    expect(positions[2]![0]).toBeCloseTo(KEPT_DIE_SPACING, 2);
    for (const pos of positions) {
      expect(pos[2]).toBeGreaterThan(1.5);
    }
  });

  it('keepSlotForIndex maps die index to tray slot', () => {
    expect(keepSlotForIndex(2, [1, 2, 4])).toBe(1);
    expect(keepSlotForIndex(0, [1, 2, 4])).toBe(-1);
  });
});

describe('table framing (fixed SEAT_VIEW camera)', () => {
  it('the whole docked koozie is inside the camera frame', () => {
    const [x, y, z] = koozieRestPosition(KOOZIE);
    expectOnScreen([x, y, z], 'cup center');
    expectOnScreen([x, y + KOOZIE.height / 2, z], 'cup top rim');
    expectOnScreen([x, y - KOOZIE.height / 2, z], 'cup bottom');
    expectOnScreen([x - KOOZIE.radius, y, z], 'cup left edge');
    expectOnScreen([x + KOOZIE.radius, y, z], 'cup right edge');
    // Worst case: the rim's far edge projects highest — any camera/table/cup
    // change that pushes it off-screen must fail here, loudly, not clip silently.
    expectOnScreen([x, y + KOOZIE.height / 2, z - KOOZIE.radius], 'cup far rim edge');
  });

  it('a full kept-dice row on the near rail is inside the camera frame', () => {
    for (let slot = 0; slot < 5; slot++) {
      const pos = keptDieRailPosition(slot, 5);
      expectOnScreen(pos, `kept die slot ${slot}`);
    }
  });
});

describe('koozie grab guard (fixed SEAT_VIEW camera)', () => {
  const guardNdcY = projectToNdc(KOOZIE_GRAB_GUARD_POINT).y;

  it('projects above every point a settled die stack can occupy', () => {
    // Two-die stack tops sampled along the far half of the play-bounds
    // ellipse (conservatively on the boundary itself, no die-half inset).
    const stackTopY = TABLE.surfaceY + DIE_SIZE * 2 + 0.003;
    for (let i = 0; i <= 16; i++) {
      const theta = Math.PI + (i / 16) * Math.PI; // far (−Z) arc
      const top: [number, number, number] = [
        FELT_BOUND_X * Math.cos(theta),
        stackTopY,
        FELT_BOUND_Z * Math.sin(theta),
      ];
      expect(projectToNdc(top).y, `die stack top at theta=${theta.toFixed(2)}`).toBeLessThan(
        guardNdcY,
      );
    }
  });

  it('projects below the docked cup rim, leaving a grabbable band', () => {
    const [x, y, z] = koozieRestPosition(KOOZIE);
    const rimTopNdcY = projectToNdc([x, y + KOOZIE.height / 2, z]).y;
    expect(guardNdcY).toBeLessThan(rimTopNdcY);
  });

  it('cup rim projects above the far rail silhouette (the apron occluder)', () => {
    // The rail apron mesh occludes everything behind it below its top edge;
    // the docked rim must clear that silhouette or the cup vanishes entirely.
    const railTopEdgeNdcY = projectToNdc([
      0,
      TABLE.surfaceY + TABLE.railHeight,
      -(FELT_SCALE.z * RAIL_OUTER_WORLD),
    ]).y;
    const [x, y, z] = koozieRestPosition(KOOZIE);
    const rimTopNdcY = projectToNdc([x, y + KOOZIE.height / 2, z]).y;
    expect(rimTopNdcY).toBeGreaterThan(railTopEdgeNdcY);
  });
});
