/** Elliptical seat ring — seat 0 at the front (+Z). Used for future 3D dice placement. */
export interface SeatLayout {
  x: number;
  z: number;
  angle: number;
}

/** Table felt oval scale (X × Z). */
export const FELT_SCALE = { x: 1.15, z: 0.95 } as const;

export const TABLE = {
  feltRadius: 1,
  feltThickness: 0.06,
  railHeight: 0.1,
  surfaceY: 0,
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
export const RAIL_COLLIDER_SEGMENTS = 40;

/** Invisible vertical containment — stops dice leaving the table. */
export const TABLE_WALL_H = 0.55;
export const TABLE_WALL_Y = TABLE.surfaceY + TABLE_WALL_H * 0.5;
/** Place wall just outside the visible rail outer edge. */
export const TABLE_WALL_OUTSET = 0.04;
export const TABLE_WALL_SEGMENTS = 40;

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
  return Math.min(Math.max(maxPlayers, 2), 8);
}

/** Fixed front-seat camera — not interactive. */
export const SEAT_VIEW = {
  position: [0, 1.58, 2.88] as const,
  target: [0, 0, 0] as const,
  fov: 47,
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
