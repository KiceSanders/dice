/**
 * Single entry point for table geometry constants and builders.
 *
 * Prefer importing from here (or keeping existing `layout` / `dice/constants`
 * paths that re-export the same numbers) so felt bounds, rail radii, and rest-
 * pose envelopes stay discoverable in one place.
 *
 * Shared `REST_POSE_BOUNDS` (shared/src/game/restPose.ts) must stay compatible
 * with FELT_BOUND_* / kept-rail radii — see diceLayout.test.ts.
 */

export {
  CLUSTER_WORLD_RADIUS,
  DICE_COUNT,
  DICE_FELT_Y,
  DICE_HOVER_Y,
  DIE_HALF,
  DIE_SIZE,
  FELT_BOUND_X,
  FELT_BOUND_Z,
  FELT_CLAMP_MARGIN,
  FELT_HALF_X,
  FELT_HALF_Y,
  FELT_HALF_Z,
} from './dice/constants';
export {
  FELT_COLLIDER_HALF_Y,
  FELT_HALF_EXTENT,
  FELT_SCALE,
  RAIL_COLLIDER_H,
  RAIL_COLLIDER_Y,
  RAIL_HIGHLIGHT_INNER,
  RAIL_HIGHLIGHT_OUTER,
  RAIL_HIGHLIGHT_SCALE,
  RAIL_INNER,
  RAIL_INNER_WORLD,
  RAIL_MESH_SCALE,
  RAIL_OUTER,
  RAIL_OUTER_WORLD,
  SEAT_VIEW,
  TABLE,
  TABLE_SEAT_COUNT,
  TABLE_WALL_H,
  TABLE_WALL_OUTER,
  TABLE_WALL_OUTSET,
  TABLE_WALL_THICKNESS,
  TABLE_WALL_Y,
} from './layout';
export {
  createExtrudedOvalRingGeometry,
  createFeltColliderGeometry,
  createFeltGeometry,
  createRailColliderGeometry,
  createRailHighlightGeometry,
  createRailRingGeometry,
  createWallColliderGeometry,
  feltEllipsePoint,
  TABLE_GEOMETRY_SEGMENTS,
  trimeshArgsFromGeometry,
} from './tableGeometry';
