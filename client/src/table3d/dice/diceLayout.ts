import {
  FELT_SCALE,
  RAIL_MESH_SCALE,
  RAIL_OUTER,
  seatAngle,
  TABLE,
  TABLE_SEAT_COUNT,
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
/**
 * How far the cup rim sits above the rail top. Kept low so the body sits
 * behind the rail apron (side seats) / below kept dice on screen (seat 0).
 * Seat-0 framing only requires the rim band on-screen — the body may sit
 * just under NDC −1, same “peek” idea as the old far dock.
 */
const KOOZIE_DOCK_RIM_ABOVE_RAIL = 0.12;

/**
 * Koozie rest/park spot: docked fully OUTSIDE the containment wall at the
 * active player's display seat, sunken so only the rim band peeks over the
 * rail. Display seat 0 is the local viewer (+Z / bottom of screen); seats 1
 * and 2 are the side docks for spectators. The wall keeps dice inside the
 * felt, so a settled die can never touch or hide behind the parked cup. The
 * roller's sim always docks at display seat 0 (view-local). Clicking the dock
 * teleports the cup back onto the felt. Framing tests in diceLayout.test.ts
 * project every seat dock through SEAT_VIEW.
 */
export function koozieRestPosition(
  cup: {
    radius: number;
    height: number;
  },
  displaySeat = 0,
): [number, number, number] {
  const angle = seatAngle(displaySeat, TABLE_SEAT_COUNT);
  // FELT_SCALE is isotropic (circle); either axis is fine for the radial.
  const radial = FELT_SCALE.x * TABLE_WALL_OUTER + cup.radius + KOOZIE_DOCK_GAP;
  return [
    Math.cos(angle) * radial,
    TABLE.surfaceY + TABLE.railHeight + KOOZIE_DOCK_RIM_ABOVE_RAIL - cup.height / 2,
    Math.sin(angle) * radial,
  ];
}

/**
 * Bottom of a kept die on the near rail. Docked-cup grabs (roller, display
 * seat 0) are honored only when the pointer is *below* this point's screen
 * projection — so a click anywhere on a kept die (including unkeep) always
 * goes to the die, not the generous cup hit radii.
 */
export const KOOZIE_NEAR_DOCK_GUARD_POINT: [number, number, number] = [
  0,
  KEPT_DIE_RAIL_Y - DIE_HALF,
  NEAR_RAIL_Z,
];

/**
 * Kept die on the near rail toward the roller — side by side, centered as a
 * row. `keepSlot` is 0-based among kept dice (sorted by die index).
 */
export function keptDieRailPosition(keepSlot: number, keepCount: number): [number, number, number] {
  const centerOffset = (keepCount - 1) / 2;
  return [(keepSlot - centerOffset) * KEPT_DIE_SPACING, KEPT_DIE_RAIL_Y, NEAR_RAIL_Z];
}
