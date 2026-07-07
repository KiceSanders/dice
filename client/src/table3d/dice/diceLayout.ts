import {
  FELT_SCALE,
  RAIL_INNER_WORLD,
  RAIL_MESH_SCALE,
  RAIL_OUTER,
  TABLE,
  TABLE_WALL_OUTER,
} from '../layout';
import { DIE_HALF, DIE_SIZE } from './constants';

/** Gap between kept dice sitting on the near rail. */
export const KEPT_DIE_GAP = 0.025;
export const KEPT_DIE_SPACING = DIE_SIZE + KEPT_DIE_GAP;

/** Die center Y when resting on top of the padded rail. */
export const KEPT_DIE_RAIL_Y = TABLE.surfaceY + TABLE.railHeight + DIE_HALF - 0.004;

/** Near-rail Z (player side, +Z) — outer rail ellipse. */
const NEAR_RAIL_Z = FELT_SCALE.z * RAIL_OUTER * RAIL_MESH_SCALE * 0.97;

/** Keep-slot index for a die index within a sorted keep list. */
export function keepSlotForIndex(dieIndex: number, keepIndices: number[]): number {
  return keepIndices.indexOf(dieIndex);
}

/** Gap between the containment wall's outer face and the docked cup's near edge. */
const KOOZIE_DOCK_GAP = 0.02;
/** How far the cup rim sits above the rail top — the visible, grabbable band. */
const KOOZIE_DOCK_RIM_ABOVE_RAIL = 0.04;

/**
 * Koozie rest/park spot: docked fully OUTSIDE the containment wall past the
 * far rail, straight across from the roller, sunken so only the rim band
 * peeks over the rail. The wall keeps dice inside the felt, so a settled die
 * can never touch or hide behind the parked cup. The local sim always puts
 * the roller at the bottom (+Z), so this is seat-independent. Clicking the
 * dock teleports the cup back onto the felt. Placements higher up (on the
 * rail, or beyond it at felt height) project off-screen at 16:9 — the framing
 * test in diceLayout.test.ts projects the dock through SEAT_VIEW to keep it
 * inside the fixed camera's frame.
 */
export function koozieRestPosition(cup: {
  radius: number;
  height: number;
}): [number, number, number] {
  return [
    0,
    TABLE.surfaceY + TABLE.railHeight + KOOZIE_DOCK_RIM_ABOVE_RAIL - cup.height / 2,
    -(FELT_SCALE.z * TABLE_WALL_OUTER + cup.radius + KOOZIE_DOCK_GAP),
  ];
}

/**
 * Highest point a selectable die can occupy at the far play boundary (covers
 * a two-die stack). Cup grabs are honored only when the pointer is above this
 * point's screen projection, so a click anywhere a die can appear always goes
 * to the die — the guard is what keeps the generous cup hit radii safe now
 * that the docked cup projects close to the far-rail dice zone.
 */
export const KOOZIE_GRAB_GUARD_POINT: [number, number, number] = [
  0,
  TABLE.surfaceY + DIE_SIZE * 2 + 0.04,
  -(FELT_SCALE.z * RAIL_INNER_WORLD),
];

/**
 * Kept die on the near rail toward the roller — side by side, centered as a
 * row. `keepSlot` is 0-based among kept dice (sorted by die index).
 */
export function keptDieRailPosition(keepSlot: number, keepCount: number): [number, number, number] {
  const centerOffset = (keepCount - 1) / 2;
  return [(keepSlot - centerOffset) * KEPT_DIE_SPACING, KEPT_DIE_RAIL_Y, NEAR_RAIL_Z];
}
