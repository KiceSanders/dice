import { DIE_HALF, DIE_SIZE, KOOZIE } from './constants';
import { FELT_SCALE, RAIL_OUTER, RAIL_MESH_SCALE, seatAngle, TABLE, TABLE_SEAT_COUNT } from '../layout';

/** Gap between kept dice sitting on the near rail. */
export const KEPT_DIE_GAP = 0.025;
export const KEPT_DIE_SPACING = DIE_SIZE + KEPT_DIE_GAP;

/** Die center Y when resting on top of the padded rail. */
export const KEPT_DIE_RAIL_Y = TABLE.surfaceY + TABLE.railHeight + DIE_HALF - 0.004;

/** Near-rail Z (player side, +Z) — outer rail ellipse. */
const NEAR_RAIL_Z = FELT_SCALE.z * RAIL_OUTER * RAIL_MESH_SCALE * 0.97;
/** Visible rest spot for the koozie, outside the rail so it never covers dice. */
const KOOZIE_REST_CLEARANCE = 0.16;
export const KOOZIE_REST_DEFAULT_Z =
  FELT_SCALE.z * RAIL_OUTER * RAIL_MESH_SCALE + KOOZIE.radius + KOOZIE_REST_CLEARANCE;

/** Radial distance outside the rail for koozie rest/park. */
function koozieRestDistance(cupRadius: number = KOOZIE.radius): number {
  return (
    Math.max(
      FELT_SCALE.x * RAIL_OUTER * RAIL_MESH_SCALE,
      FELT_SCALE.z * RAIL_OUTER * RAIL_MESH_SCALE,
    ) +
    cupRadius +
    KOOZIE_REST_CLEARANCE
  );
}

/** Keep-slot index for a die index within a sorted keep list. */
export function keepSlotForIndex(dieIndex: number, keepIndices: number[]): number {
  return keepIndices.indexOf(dieIndex);
}

/** Koozie rest/park outside the rail on the far side from the given seat. */
export function koozieRestPositionForSeat(
  seatIndex: number,
  seatCount: number,
  floatCenterY: number,
  cupRadius: number = KOOZIE.radius,
): [number, number, number] {
  const angle = seatAngle(seatIndex, seatCount) + Math.PI;
  const dist = koozieRestDistance(cupRadius);
  return [dist * Math.cos(angle), floatCenterY, dist * Math.sin(angle)];
}

/** Shared idle/park spot — far side from the active roller, centered on their axis. */
export function koozieRestPosition(
  floatCenterY: number,
  homeZ: number,
  cupRadius: number = KOOZIE.radius,
  seatIndex: number = 0,
  seatCount: number = TABLE_SEAT_COUNT,
): [number, number, number] {
  const [x, y, z] = koozieRestPositionForSeat(seatIndex, seatCount, floatCenterY, cupRadius);
  void homeZ;
  return [x, y, z];
}

/** Parked koozie — same visible spot as idle so the next grab target is stable. */
export function koozieParkedPosition(
  floatCenterY: number,
  homeZ: number,
  cupRadius: number = KOOZIE.radius,
  seatIndex: number = 0,
  seatCount: number = TABLE_SEAT_COUNT,
): [number, number, number] {
  void homeZ;
  return koozieRestPosition(floatCenterY, homeZ, cupRadius, seatIndex, seatCount);
}

/**
 * Kept die on the near rail toward the roller — side by side, centered as a row.
 * `keepSlot` is 0-based among kept dice (sorted by die index).
 */
export function keptDieRailPositionForSeat(
  seatIndex: number,
  seatCount: number,
  keepSlot: number,
  keepCount: number,
): [number, number, number] {
  const seatDir = seatAngle(seatIndex, seatCount);
  const perp = seatDir + Math.PI / 2;
  const centerOffset = (keepCount - 1) / 2;
  const along = (keepSlot - centerOffset) * KEPT_DIE_SPACING;
  const railDist = koozieRestDistance() - KOOZIE.radius - KOOZIE_REST_CLEARANCE + 0.02;
  const cx = railDist * Math.cos(seatDir);
  const cz = railDist * Math.sin(seatDir);
  const x = cx + along * Math.cos(perp);
  const z = cz + along * Math.sin(perp);
  return [x, KEPT_DIE_RAIL_Y, z];
}

/**
 * Kept die on the near rail — side by side, centered as a row (seat 0 default).
 * `keepSlot` is 0-based among kept dice (sorted by die index).
 */
export function keptDieRailPosition(
  keepSlot: number,
  keepCount: number,
  seatIndex: number = 0,
  seatCount: number = TABLE_SEAT_COUNT,
): [number, number, number] {
  return keptDieRailPositionForSeat(seatIndex, seatCount, keepSlot, keepCount);
}

/** @deprecated Use keptDieRailPosition with seatIndex. Near-rail Z for seat 0. */
export const NEAR_RAIL_Z_REF = NEAR_RAIL_Z;
