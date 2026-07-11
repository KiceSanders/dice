/**
 * Table felt scale (X × Z). MUST stay isotropic (x === z, a circle): streamed
 * pose frames are localized per viewer by rotating them around Y in seat-angle
 * increments (seatTransform.ts), and only a rotationally symmetric table maps
 * onto itself under that rotation — on the earlier 1.15×0.95 oval, another
 * player's settled dice landed on or past the rail. Guarded by a layout test.
 */
export const FELT_SCALE = { x: 0.95, z: 0.95 } as const;

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
export const TABLE_WALL_THICKNESS = 0.08;
/** Outer face of the containment wall (unit radius, before FELT_SCALE). */
export const TABLE_WALL_OUTER = RAIL_OUTER_WORLD + TABLE_WALL_OUTSET + TABLE_WALL_THICKNESS / 2;

/**
 * Seats occupy only the lower clock arc (2 o'clock → 10 o'clock, through 6);
 * the top arc (10 → 2) is reserved for game-state widgets (`topBandRect`).
 * Guarded by layout tests for every seat count.
 */
export const SEAT_ARC_START = -Math.PI / 6; // 2 o'clock (screen Y grows downward)
export const SEAT_ARC_SPAN = (4 * Math.PI) / 3; // → 10 o'clock, through 6 o'clock

/**
 * Display-slot angle: seatCount positions evenly spaced along the seat arc,
 * endpoints inclusive. Slot 0 (the local player) takes the position nearest
 * 6 o'clock — exact bottom for odd counts, which includes the shipping
 * 3-seat table (90°/210°/-30°, identical to the historical full-circle
 * spacing). Seating order continues around the arc with the wrap falling in
 * the reserved top gap.
 */
export function seatAngle(seatIndex: number, seatCount: number): number {
  const n = Math.max(seatCount, 2);
  const step = SEAT_ARC_SPAN / (n - 1);
  const nearBottomIndex = Math.round((Math.PI / 2 - SEAT_ARC_START) / step);
  const arcIndex = (seatIndex + nearBottomIndex) % n;
  return SEAT_ARC_START + arcIndex * step;
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
 * Seat order for the stacked small-screen strip: remote seats by display slot,
 * the local player last (adjacent to their controls below the table).
 */
export function seatStripOrder(mySeat: number): number[] {
  return Array.from({ length: TABLE_SEAT_COUNT }, (_, i) => i).sort((a, b) => {
    // Display slot 0 is the local player — sort it past everyone else.
    const da = displaySeatIndex(a, mySeat) || TABLE_SEAT_COUNT;
    const db = displaySeatIndex(b, mySeat) || TABLE_SEAT_COUNT;
    return da - db;
  });
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

/** Fixed front-seat camera — not interactive. Target sits on the near felt so the table fills 16:9 vertically. */
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

/**
 * CSS translate that pins the card's inner edge toward the table center.
 * Shared by SeatOverlay and seatCardRect so render and tests can't drift.
 */
export function seatAnchorOffset(angle: number): { tx: number; ty: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (s > 0.55) return { tx: -0.5, ty: 0 };
  if (s < -0.55) return { tx: -0.5, ty: -1 };
  if (c > 0.55) return { tx: 0, ty: -0.5 };
  if (c < -0.55) return { tx: -1, ty: -0.5 };
  return { tx: -0.5, ty: -0.5 };
}

/** Default seat-card size used by collision tests (matches `.table-3d .seat`). */
export const SEAT_CARD_SIZE_PX = { width: 118, height: 62 } as const;

/**
 * Axis-aligned seat-card rect in frame % for a display slot — pure mirror of
 * SeatOverlay placement for collision tests without a DOM.
 */
export function seatCardRect(
  displaySlot: number,
  seatCount: number,
  frame: OverlayRect,
  viewport: OverlayRect,
  sizePx: { width: number; height: number } = SEAT_CARD_SIZE_PX,
): { left: number; top: number; width: number; height: number } {
  const { leftPct, topPct, angle } = seatOverlayPosition(displaySlot, seatCount, frame, viewport);
  const { tx, ty } = seatAnchorOffset(angle);
  const w = (sizePx.width / frame.width) * 100;
  const h = (sizePx.height / frame.height) * 100;
  return {
    left: leftPct + tx * w,
    top: topPct + ty * h,
    width: w,
    height: h,
  };
}

/**
 * Reserved game-state band across the top of the frame (the 10 → 2 o'clock
 * arc no seat may enter). Widgets inside it are normal flow (flex), so they
 * can never overlap each other; the layout test proves the band clears every
 * seat card at every seat count.
 *
 * Paired with `.table-top-band` in index.css — keep max-width (% of frame)
 * and height (top gutter track, 4.25rem) identical on both sides.
 */
export const TOP_BAND_MAX_WIDTH_PCT = 50;
export const TOP_BAND_HEIGHT_PX = 68; // 4.25rem @ 16px root

/** Top-band rect in frame % — pure mirror of `.table-top-band` for tests. */
export function topBandRect(frame: OverlayRect): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    left: 50 - TOP_BAND_MAX_WIDTH_PCT / 2,
    top: 0,
    width: TOP_BAND_MAX_WIDTH_PCT,
    height: (TOP_BAND_HEIGHT_PX / frame.height) * 100,
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
