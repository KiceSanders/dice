import { DIE_HALF, DIE_SIZE } from './constants';
import { FELT_SCALE, RAIL_OUTER, RAIL_MESH_SCALE, TABLE } from '../layout';

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

/**
 * Parked koozie — across the table from the roller (far side, −Z), centered on X.
 * Mirrors the idle home pose on the near side.
 */
export function koozieParkedPosition(
  floatCenterY: number,
  homeZ: number,
): [number, number, number] {
  return [0, floatCenterY, -Math.abs(homeZ)];
}

/**
 * Kept die on the near rail — side by side, centered as a row.
 * `keepSlot` is 0-based among kept dice (sorted by die index).
 */
export function keptDieRailPosition(
  keepSlot: number,
  keepCount: number,
): [number, number, number] {
  const centerOffset = (keepCount - 1) / 2;
  const x = (keepSlot - centerOffset) * KEPT_DIE_SPACING;
  return [x, KEPT_DIE_RAIL_Y, NEAR_RAIL_Z];
}
