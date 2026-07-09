import { describe, expect, it } from 'vitest';
import { FELT_SCALE, RAIL_OUTER_WORLD, TABLE, TABLE_SEAT_COUNT, TABLE_WALL_OUTER } from '../layout';
import { projectToNdc } from '../project';
import { DIE_SIZE, FELT_BOUND_X, FELT_BOUND_Z, KOOZIE } from './constants';
import {
  KEPT_DIE_SPACING,
  KOOZIE_NEAR_DOCK_GUARD_POINT,
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

function wallOuterRadius(): number {
  // Isotropic felt → circular wall; radial distance of the wall outer face.
  return FELT_SCALE.x * TABLE_WALL_OUTER;
}

describe('diceLayout', () => {
  const rest = koozieRestPosition(KOOZIE);

  it('koozie docks at +Z (display seat 0), fully outside the containment wall', () => {
    expect(rest[0]).toBeCloseTo(0, 3);
    expect(rest[2]).toBeGreaterThan(0);
    // The cup's near edge is beyond the wall's outer face — a settled die can
    // never touch, hide behind, or sit under the parked cup.
    expect(rest[2] - KOOZIE.radius).toBeGreaterThan(FELT_SCALE.z * TABLE_WALL_OUTER);
  });

  it('koozie docks at every display seat outside the containment wall', () => {
    for (let seat = 0; seat < TABLE_SEAT_COUNT; seat++) {
      const [x, , z] = koozieRestPosition(KOOZIE, seat);
      const radial = Math.hypot(x, z);
      expect(radial - KOOZIE.radius, `seat ${seat} near edge`).toBeGreaterThan(wallOuterRadius());
      expect(isOutsidePlayBounds(x, z, KOOZIE.radius), `seat ${seat} outside play`).toBe(true);
    }
  });

  it('koozie dock is sunken behind the rail with the rim peeking over', () => {
    const rimY = rest[1] + KOOZIE.height / 2;
    const railTopY = TABLE.surfaceY + TABLE.railHeight;
    expect(rimY).toBeGreaterThan(railTopY);
    // Only a band peeks over — the cup body is below the rail line so it
    // does not paint over kept dice (seat 0) or float onto the felt (sides).
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
  it('display seat 0: rim band is on-screen below kept dice (body may clip under NDC −1)', () => {
    const [x, y, z] = koozieRestPosition(KOOZIE, 0);
    // Near-camera fringe: only the peeking rim must stay in frame.
    expectOnScreen([x, y + KOOZIE.height / 2, z], 'seat 0 cup top rim');
    expectOnScreen([x - KOOZIE.radius, y + KOOZIE.height / 2, z], 'seat 0 rim left');
    expectOnScreen([x + KOOZIE.radius, y + KOOZIE.height / 2, z], 'seat 0 rim right');
    const rimNdcY = projectToNdc([x, y + KOOZIE.height / 2, z]).y;
    for (let slot = 0; slot < 2; slot++) {
      const kept = keptDieRailPosition(slot, 2);
      expect(rimNdcY, `rim below kept slot ${slot}`).toBeLessThan(projectToNdc(kept).y);
    }
  });

  for (const seat of [1, 2]) {
    it(`display seat ${seat} docked koozie is inside the camera frame`, () => {
      const [x, y, z] = koozieRestPosition(KOOZIE, seat);
      expectOnScreen([x, y, z], `seat ${seat} cup center`);
      expectOnScreen([x, y + KOOZIE.height / 2, z], `seat ${seat} cup top rim`);
      expectOnScreen([x, y - KOOZIE.height / 2, z], `seat ${seat} cup bottom`);
      expectOnScreen([x - KOOZIE.radius, y, z], `seat ${seat} cup left edge`);
      expectOnScreen([x + KOOZIE.radius, y, z], `seat ${seat} cup right edge`);
      const radial = Math.hypot(x, z) || 1;
      const ox = (x / radial) * KOOZIE.radius;
      const oz = (z / radial) * KOOZIE.radius;
      expectOnScreen([x + ox, y + KOOZIE.height / 2, z + oz], `seat ${seat} cup outward rim edge`);
    });
  }

  it('a full kept-dice row on the near rail is inside the camera frame', () => {
    for (let slot = 0; slot < 5; slot++) {
      const pos = keptDieRailPosition(slot, 5);
      expectOnScreen(pos, `kept die slot ${slot}`);
    }
  });
});

describe('koozie near-dock grab guard (fixed SEAT_VIEW camera)', () => {
  const guardNdcY = projectToNdc(KOOZIE_NEAR_DOCK_GUARD_POINT).y;

  it('projects above the docked cup rim, leaving a grabbable band below kept dice', () => {
    // Screen y grows downward; higher NDC y = higher on screen = toward far rail.
    // Guard sits at kept-rail die bottoms; docked rim must project *below* it
    // (lower NDC y) so there is a band of screen space where dock grabs are honored.
    const [x, y, z] = koozieRestPosition(KOOZIE);
    const rimTopNdcY = projectToNdc([x, y + KOOZIE.height / 2, z]).y;
    expect(rimTopNdcY).toBeLessThan(guardNdcY);
  });

  it('projects at or below every kept-die bottom so keep/unkeep clicks stay above the guard', () => {
    for (let slot = 0; slot < 5; slot++) {
      const [x, y, z] = keptDieRailPosition(slot, 5);
      const bottom: [number, number, number] = [x, y - DIE_SIZE / 2, z];
      // Kept die bottoms are at/above the guard (higher NDC y) → pointerBelow
      // rejects cup grabs there and die handlers receive the click.
      expect(projectToNdc(bottom).y, `kept die ${slot} bottom`).toBeGreaterThanOrEqual(
        guardNdcY - 1e-6,
      );
    }
  });

  it('cup rim projects above the side-rail silhouette (apron occluder)', () => {
    // Side docks sit behind the rail from the camera; the rim must clear the
    // apron silhouette or the cup vanishes. (Seat 0 is in front of the near
    // rail — apron occlusion does not apply the same way.)
    for (const seat of [1, 2]) {
      const [x, y, z] = koozieRestPosition(KOOZIE, seat);
      const radial = Math.hypot(x, z) || 1;
      const railEdge: [number, number, number] = [
        (x / radial) * FELT_SCALE.x * RAIL_OUTER_WORLD,
        TABLE.surfaceY + TABLE.railHeight,
        (z / radial) * FELT_SCALE.z * RAIL_OUTER_WORLD,
      ];
      const railTopEdgeNdcY = projectToNdc(railEdge).y;
      const rimTopNdcY = projectToNdc([x, y + KOOZIE.height / 2, z]).y;
      expect(rimTopNdcY, `seat ${seat} rim above apron`).toBeGreaterThan(railTopEdgeNdcY);
    }
  });
});
