import { DICE_FELT_Y, KOOZIE } from './dice/constants';
import { KEPT_DIE_SPACING, keptDieRailPosition, koozieRestPosition } from './dice/diceLayout';
import { FELT_SCALE, RAIL_INNER_WORLD, RAIL_OUTER_WORLD, TABLE } from './layout';

/**
 * Named, framing-guaranteed placement zones for 3D table content (chips,
 * props, effects, …). Place new scene content AT an anchor and keep it within
 * the anchor's extents — anchors.test.ts projects every anchor's extreme
 * points through the fixed camera, so anything that respects its budget is
 * in frame at every browser size (the viewport is always 16:9). Inventing raw
 * coordinates instead means writing your own framing test — see
 * docs/TABLE_UI.md.
 */
export interface TableAnchor {
  position: readonly [number, number, number];
  /** World-space half-extents content may occupy around the position. */
  extent: { x: number; y: number; z: number };
}

const RAIL_MID_X = FELT_SCALE.x * ((RAIL_INNER_WORLD + RAIL_OUTER_WORLD) / 2);
const RAIL_TOP_Y = TABLE.surfaceY + TABLE.railHeight;

export const TABLE_ANCHORS = {
  /** Middle of the felt — the pot/round label projects just above this. */
  feltCenter: { position: [0, DICE_FELT_Y, 0], extent: { x: 0.6, y: 0.3, z: 0.5 } },
  /** Upper felt, between center and the far rail — pot chips, banners. */
  potZone: { position: [0, DICE_FELT_Y, -0.7], extent: { x: 0.45, y: 0.25, z: 0.3 } },
  /** Kept-dice row on the near rail — mostly horizontal budget. */
  keptRail: {
    position: keptDieRailPosition(2, 5),
    extent: { x: KEPT_DIE_SPACING * 3, y: 0.2, z: 0.06 },
  },
  /** Left rail top at the table's widest point — player-side chip stacks. */
  leftRail: { position: [-RAIL_MID_X, RAIL_TOP_Y, 0], extent: { x: 0.15, y: 0.2, z: 0.4 } },
  /** Right rail top at the table's widest point. */
  rightRail: { position: [RAIL_MID_X, RAIL_TOP_Y, 0], extent: { x: 0.15, y: 0.2, z: 0.4 } },
  /**
   * Parked koozie dock behind the far rail — OCCUPIED by the cup; reference
   * position only (zero budget). The cup's own framing test pins its extremes.
   */
  farDock: { position: koozieRestPosition(KOOZIE), extent: { x: 0, y: 0, z: 0 } },
} as const satisfies Record<string, TableAnchor>;
