import { REST_POSE_BOUNDS } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import {
  FELT_SCALE,
  RAIL_OUTER_WORLD,
  seatAngle,
  TABLE,
  TABLE_SEAT_COUNT,
  TABLE_WALL_OUTER,
} from '../layout';
import { projectToNdc } from '../project';
import {
  DICE_COUNT,
  DICE_FELT_Y,
  DIE_SIZE,
  dieSlotPosition,
  FELT_BOUND_X,
  FELT_BOUND_Z,
  KOOZIE,
} from './constants';
import {
  KEPT_DIE_SPACING,
  KOOZIE_NEAR_DOCK_GUARD_POINT,
  keepSlotForIndex,
  keptDieRailPosition,
  koozieRestPosition,
  koozieRestPositionAtAngle,
  resolveUnkeepPose,
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

  it('spectator koozie docks at the exact occupied-card angle', () => {
    for (let count = 1; count <= TABLE_SEAT_COUNT; count++) {
      for (let slot = 0; slot < count; slot++) {
        const angle = seatAngle(slot, count);
        const [x, , z] = koozieRestPositionAtAngle(KOOZIE, angle);
        const radial = Math.hypot(x, z);
        expect(x / radial, `slot ${slot}/${count} x`).toBeCloseTo(Math.cos(angle), 10);
        expect(z / radial, `slot ${slot}/${count} z`).toBeCloseTo(Math.sin(angle), 10);
        expect(radial - KOOZIE.radius).toBeGreaterThan(wallOuterRadius());
      }
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

describe('layout stays inside REST_POSE_BOUNDS (ADR 005)', () => {
  // The server rejects rest poses outside the shared envelope. Every position
  // this layout can legitimately produce — felt slots, the kept-dice rail, and
  // anywhere inside the containment wall — must pass, or honest rollers would
  // silently drop into the slot-layout fallback after a layout tweak.
  function expectInsideBounds([x, y, z]: [number, number, number], label: string) {
    expect(Math.hypot(x, z), `${label} radius`).toBeLessThanOrEqual(REST_POSE_BOUNDS.maxRadius);
    expect(y, `${label} y`).toBeGreaterThanOrEqual(REST_POSE_BOUNDS.minY);
    expect(y, `${label} y`).toBeLessThanOrEqual(REST_POSE_BOUNDS.maxY);
  }

  it('felt slots are inside the bounds', () => {
    for (let i = 0; i < DICE_COUNT; i++) {
      expectInsideBounds(dieSlotPosition(i), `felt slot ${i}`);
    }
  });

  it('a full kept row on the rail is inside the bounds', () => {
    for (let slot = 0; slot < DICE_COUNT; slot++) {
      expectInsideBounds(keptDieRailPosition(slot, DICE_COUNT), `kept slot ${slot}`);
    }
  });

  it('the containment wall (max scatter) and die heights are inside the bounds', () => {
    // A die resting against the wall's inner face is the farthest a settled
    // die can physically be; a die stacked on another is the highest.
    expect(FELT_SCALE.x * TABLE_WALL_OUTER).toBeLessThanOrEqual(REST_POSE_BOUNDS.maxRadius);
    expectInsideBounds([0, DICE_FELT_Y, 0], 'die on felt');
    expectInsideBounds([0, DICE_FELT_Y + DIE_SIZE, 0], 'die stacked on a die');
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

  for (const seat of Array.from({ length: TABLE_SEAT_COUNT - 1 }, (_, index) => index + 1)) {
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

  it('keeps spectator cup rims on-screen at every occupied-card angle', () => {
    for (let count = 1; count <= TABLE_SEAT_COUNT; count++) {
      for (let slot = 0; slot < count; slot++) {
        const [x, y, z] = koozieRestPositionAtAngle(KOOZIE, seatAngle(slot, count));
        expectOnScreen([x, y + KOOZIE.height / 2, z], `slot ${slot}/${count} rim`);
        expectOnScreen([x - KOOZIE.radius, y + KOOZIE.height / 2, z], `slot ${slot}/${count} left`);
        expectOnScreen(
          [x + KOOZIE.radius, y + KOOZIE.height / 2, z],
          `slot ${slot}/${count} right`,
        );
      }
    }
  });

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
    for (const seat of Array.from({ length: TABLE_SEAT_COUNT - 1 }, (_, index) => index + 1)) {
      const [x, y, z] = koozieRestPosition(KOOZIE, seat);
      const radial = Math.hypot(x, z) || 1;
      const railEdge: [number, number, number] = [
        (x / radial) * FELT_SCALE.x * RAIL_OUTER_WORLD,
        TABLE.surfaceY + TABLE.railHeight,
        (z / radial) * FELT_SCALE.z * RAIL_OUTER_WORLD,
      ];
      const railTopEdgeNdcY = projectToNdc(railEdge).y;
      // The inward rim edge is the first visible part of a cup parked behind
      // the apron; its center may remain occluded while this band still makes
      // the active-seat marker readable.
      const rimTopNdcY = projectToNdc([
        x - (x / radial) * KOOZIE.radius,
        y + KOOZIE.height / 2,
        z - (z / radial) * KOOZIE.radius,
      ]).y;
      expect(rimTopNdcY, `seat ${seat} inward rim above apron`).toBeGreaterThan(railTopEdgeNdcY);
    }
  });
});

describe('resolveUnkeepPose', () => {
  it('restores a snapshotted felt pose when present', () => {
    const felt = {
      position: [0.1, 0.05, -0.2] as [number, number, number],
      rotation: [0.1, 0, 0] as [number, number, number],
    };
    expect(resolveUnkeepPose(2, felt)).toEqual(felt);
  });

  it('falls back to center slot layout when there is no felt pose', () => {
    expect(resolveUnkeepPose(3, null)).toEqual({
      position: dieSlotPosition(3),
      rotation: [0, 0, 0],
    });
  });
});
