/** Elliptical seat ring — seat 0 at the front (+Z). Used for future 3D dice placement. */
export interface SeatLayout {
  x: number;
  z: number;
  angle: number;
}

/** Table felt oval scale (X × Z). */
export const FELT_SCALE = { x: 1.15, z: 0.95 } as const;

export const TABLE = {
  feltRadius: 2,
  feltThickness: 0.06,
  railHeight: 0.1,
  surfaceY: 0,
} as const;

/** Vertical half-extent of the felt physics slab (top aligns with TABLE.surfaceY). */
export const FELT_COLLIDER_HALF_Y = 0.045;

/** Felt ellipse half-extents in world units (center → edge along each axis). */
export const FELT_HALF_EXTENT = {
  x: FELT_SCALE.x * TABLE.feltRadius,
  z: FELT_SCALE.z * TABLE.feltRadius,
} as const;

/** Felt → padded rail seam (unit radius, before FELT_SCALE). */
export const RAIL_INNER = TABLE.feltRadius * 0.94;
/** Outer edge of the padded rail (unit radius, before FELT_SCALE). */
export const RAIL_OUTER = TABLE.feltRadius * 1.08;
export const RAIL_HIGHLIGHT_INNER = TABLE.feltRadius * 0.96;
export const RAIL_HIGHLIGHT_OUTER = TABLE.feltRadius * 1.04;
export const RAIL_MESH_SCALE = 1.08;
export const RAIL_HIGHLIGHT_SCALE = 1.06;

/** Rail radii in world units (after mesh scale, before FELT_SCALE ellipse). */
export const RAIL_INNER_WORLD = RAIL_INNER * RAIL_MESH_SCALE;
export const RAIL_OUTER_WORLD = RAIL_OUTER * RAIL_MESH_SCALE;

/** Vertical rail bumper collider (world Y). */
export const RAIL_COLLIDER_Y = TABLE.surfaceY + TABLE.railHeight * 0.5;
export const RAIL_COLLIDER_H = TABLE.railHeight;

/** Invisible vertical containment — stops dice leaving the table. */
export const TABLE_WALL_H = 1.4;
export const TABLE_WALL_Y = TABLE.surfaceY + TABLE_WALL_H * 0.5;
/** Place wall just outside the visible rail outer edge. */
export const TABLE_WALL_OUTSET = 0.04;

/** Outer edge of the padded rail (world units). */
const RAIL_OUTER_X = FELT_SCALE.x * RAIL_OUTER;
const RAIL_OUTER_Z = FELT_SCALE.z * RAIL_OUTER;

const SEAT_CLEARANCE = 0.48;
const SEAT_RADIAL_EXTRA = 0.62;

/** World-space seat ring (for dice / 3D props). */
export function seatLayout(seatIndex: number, seatCount: number): SeatLayout {
  const angle = Math.PI / 2 + (seatIndex / seatCount) * Math.PI * 2;
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const innerX = RAIL_OUTER_X + SEAT_CLEARANCE;
  const innerZ = RAIL_OUTER_Z + SEAT_CLEARANCE;
  const axisExtra = Math.abs(uz) > 0.65 ? 0.38 : 0;
  const radialExtra = SEAT_RADIAL_EXTRA + axisExtra;
  return {
    x: innerX * ux + ux * radialExtra,
    z: innerZ * uz + uz * radialExtra,
    angle,
  };
}

export function seatAngle(seatIndex: number, seatCount: number): number {
  return Math.PI / 2 + (seatIndex / seatCount) * Math.PI * 2;
}

export function clampSeatCount(maxPlayers: number): number {
  return Math.min(Math.max(maxPlayers, 2), 3);
}

/** Fixed seat count for the 3-player table. */
export const TABLE_SEAT_COUNT = 3;

/** Rotate a server seat index so the local player always maps to display slot 0 (bottom). */
export function displaySeatIndex(seatIndex: number, mySeat: number): number {
  return (seatIndex - mySeat + TABLE_SEAT_COUNT) % TABLE_SEAT_COUNT;
}

/**
 * Y rotation (three.js sign convention) carrying a player's view-local space —
 * that player at +Z / bottom of screen — to canonical table space. Used only
 * to transform pose frames at the wire boundary (seatTransform.ts); the
 * rendered scene, camera, and physics all stay in view-local space.
 */
export function viewRotationY(mySeat: number): number {
  return Math.PI / 2 - seatAngle(mySeat, TABLE_SEAT_COUNT);
}

/** Fixed front-seat camera — not interactive. Target sits on the near felt so the oval fills 16:9. */
export const SEAT_VIEW = {
  position: [0, 2.88, 4.36] as const,
  target: [0, 0.04, 0.8] as const,
  fov: 36,
} as const;

export const SEAT_LABEL = {
  height: 0.5,
  distanceFactor: 1.65,
} as const;

export interface OverlayRect {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** Margin outside the viewport (% of frame) for seat card inner edges. */
const OVERLAY_MARGIN_X = 0.25;
const OVERLAY_MARGIN_Y = 0.25;

/**
 * Place seat cards on an ellipse just outside the canvas viewport (screen space).
 * Guarantees all seats stay visible in the frame gutter without overlapping the felt.
 */
export function seatOverlayPosition(
  seatIndex: number,
  seatCount: number,
  frame: OverlayRect,
  viewport: OverlayRect,
): { leftPct: number; topPct: number; angle: number } {
  const angle = seatAngle(seatIndex, seatCount);
  const cx = ((viewport.left + viewport.width / 2 - frame.left) / frame.width) * 100;
  const cy = ((viewport.top + viewport.height / 2 - frame.top) / frame.height) * 100;
  const rx = (viewport.width / 2 / frame.width) * 100 + OVERLAY_MARGIN_X;
  const ry = (viewport.height / 2 / frame.height) * 100 + OVERLAY_MARGIN_Y;
  return {
    leftPct: cx + rx * Math.cos(angle),
    topPct: cy + ry * Math.sin(angle),
    angle,
  };
}

export function viewportCenterOnFrame(
  frame: OverlayRect,
  viewport: OverlayRect,
): { leftPct: number; topPct: number } {
  return {
    leftPct: ((viewport.left + viewport.width / 2 - frame.left) / frame.width) * 100,
    topPct: ((viewport.top + viewport.height / 2 - frame.top) / frame.height) * 100,
  };
}
