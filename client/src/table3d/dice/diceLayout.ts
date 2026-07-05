import { DIE_HALF, DIE_SIZE } from './constants';
import { FELT_SCALE, RAIL_INNER_WORLD, RAIL_MESH_SCALE, RAIL_OUTER, TABLE } from '../layout';

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
 * Koozie rest/park spot: on the felt against the far rail, straight across
 * from the roller. The local sim always puts the roller at the bottom (+Z),
 * so this is seat-independent. Outside the play bounds (clicking it teleports
 * it back onto the felt) but inside the fixed camera's frame — the framing
 * test in diceLayout.test.ts projects it through SEAT_VIEW to keep it that way.
 */
export function koozieRestPosition(cup: {
  radius: number;
  height: number;
}): [number, number, number] {
  return [
    0,
    TABLE.surfaceY + cup.height / 2,
    -(FELT_SCALE.z * RAIL_INNER_WORLD - cup.radius * 0.9),
  ];
}

/**
 * Kept die on the near rail toward the roller — side by side, centered as a
 * row. `keepSlot` is 0-based among kept dice (sorted by die index).
 */
export function keptDieRailPosition(keepSlot: number, keepCount: number): [number, number, number] {
  const centerOffset = (keepCount - 1) / 2;
  return [(keepSlot - centerOffset) * KEPT_DIE_SPACING, KEPT_DIE_RAIL_Y, NEAR_RAIL_Z];
}
