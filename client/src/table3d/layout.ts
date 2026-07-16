import { MAX_SEATED_PLAYERS, type RoomPhase } from '@dice/shared';

/**
 * Table felt scale (X × Z). MUST stay isotropic (x === z, a circle): canonical
 * pose frames rotate to each player's occupied-card presentation angle
 * (seatTransform.ts), and only a rotationally symmetric table maps onto itself
 * under that rotation — on the earlier 1.15×0.95 oval, another player's settled
 * dice landed on or past the rail. Guarded by a layout test.
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
 * Display-slot angle: slot 0 (the local player) is always exactly 6 o'clock.
 * Later slots follow clockwise throwing order up the left side to 10 o'clock,
 * wrap across the reserved top gap, then continue from 2 o'clock down the
 * right side. The remote seats use the full lower arc so sparse tables stay
 * broadly spaced (two players render at 6 and 10, never side by side).
 */
export function seatAngle(seatIndex: number, seatCount: number): number {
  const bottom = Math.PI / 2;
  if (seatCount <= 1 || seatIndex === 0) return bottom;
  const n = Math.max(seatCount, 2);
  const remoteCount = n - 1;
  const leftCount = Math.ceil(remoteCount / 2);
  const arcEnd = SEAT_ARC_START + SEAT_ARC_SPAN;

  if (seatIndex <= leftCount) {
    return bottom + ((arcEnd - bottom) * seatIndex) / leftCount;
  }

  const rightCount = remoteCount - leftCount;
  const rightIndex = seatIndex - leftCount - 1;
  return SEAT_ARC_START + ((bottom - SEAT_ARC_START) * rightIndex) / rightCount;
}

/** Fixed logical seat capacity for membership and pose transforms. */
export const TABLE_SEAT_COUNT = MAX_SEATED_PLAYERS;

/**
 * Physical angle on the full-circle pose ring. Unlike the occupied-card arc,
 * this must stay uniformly spaced so canonical pose rotations compose across
 * every pair of viewers.
 */
export function seatRingAngle(seatIndex: number, seatCount = TABLE_SEAT_COUNT): number {
  return Math.PI / 2 + (seatIndex * Math.PI * 2) / seatCount;
}

/** Logical seat ids shown in each phase: all slots in the lobby, occupied only in play. */
export function visibleSeatIndices(phase: RoomPhase, occupiedSeatIndices: number[]): number[] {
  if (phase === 'lobby') {
    return Array.from({ length: TABLE_SEAT_COUNT }, (_, seat) => seat);
  }
  return [...new Set(occupiedSeatIndices)].sort((a, b) => a - b);
}

/** One source of truth for where a logical player appears to this viewer. */
export interface SeatDisplayPlacement {
  seatIndex: number;
  displaySlot: number;
  displayCount: number;
  angle: number;
}

/** Rotate visible logical seats so the local player occupies display slot 0. */
function orderedSeatIndices(seatIndices: number[], mySeat: number | null): number[] {
  const sorted = [...new Set(seatIndices)].sort((a, b) => a - b);
  if (mySeat === null) return sorted;
  const pivot = sorted.indexOf(mySeat);
  if (pivot < 0) return sorted;
  return [...sorted.slice(pivot), ...sorted.slice(0, pivot)];
}

/**
 * Complete occupied-card layout for this viewer. Seat cards and every
 * player-relative spectator visual consume these same placements.
 */
export function seatDisplayPlacements(
  seatIndices: number[],
  mySeat: number | null,
): SeatDisplayPlacement[] {
  const ordered = orderedSeatIndices(seatIndices, mySeat);
  return ordered.map((seatIndex, displaySlot) => ({
    seatIndex,
    displaySlot,
    displayCount: ordered.length,
    angle: seatAngle(displaySlot, ordered.length),
  }));
}

/** Placement for one logical player, or null when that seat is not visible. */
export function seatDisplayPlacement(
  seatIndices: number[],
  mySeat: number | null,
  targetSeat: number,
): SeatDisplayPlacement | null {
  return (
    seatDisplayPlacements(seatIndices, mySeat).find(
      (placement) => placement.seatIndex === targetSeat,
    ) ?? null
  );
}

/**
 * Seat order for the stacked small-screen strip: remote seats by display slot,
 * the local player last (adjacent to their controls below the table).
 */
export function seatStripOrder(seatIndices: number[], mySeat: number | null): number[] {
  const displayOrder = seatDisplayPlacements(seatIndices, mySeat).map(
    (placement) => placement.seatIndex,
  );
  if (mySeat === null || displayOrder[0] !== mySeat) return displayOrder;
  return [...displayOrder.slice(1), mySeat];
}

/**
 * Y rotation (three.js sign convention) carrying a player's view-local space —
 * that player at +Z / bottom of screen — to canonical table space. Used only
 * to transform pose frames at the wire boundary (seatTransform.ts); the
 * rendered scene, camera, and physics all stay in view-local space.
 */
export function viewRotationY(mySeat: number): number {
  return Math.PI / 2 - seatRingAngle(mySeat);
}

/** Fixed front-seat camera — not interactive. Pulled back enough that all eight
 * docked koozies clear the 16:9 frame; target stays slightly toward the near
 * felt so the table still fills the view vertically. */
export const SEAT_VIEW = {
  position: [0, 2.8, 4.45] as const,
  target: [0, 0.04, 0.9] as const,
  fov: 39,
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
  return seatOverlayPositionAtAngle(seatAngle(seatIndex, seatCount), frame, viewport);
}

/** Position a seat card from the shared player display placement angle. */
export function seatOverlayPositionAtAngle(
  angle: number,
  frame: OverlayRect,
  viewport: OverlayRect,
): { leftPct: number; topPct: number; angle: number } {
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

/** Default seat-card size used by collision tests (matches `.seat`: max-width × one-row height). */
export const SEAT_CARD_SIZE_PX = { width: 190, height: 30 } as const;

/** Minimum gap between a card edge and the frame edge after clamping. */
export const SEAT_CARD_CLAMP_PAD_PX = 4;

/**
 * Clamp a card's left edge so the card stays horizontally inside the frame:
 * side-gutter cards grow outward, so a wide card (long name) would otherwise
 * leave the frame and clip at the window edge. Shared by SeatOverlay and
 * seatCardRect so render and tests can't drift.
 */
export function clampCardLeftPx(
  cardLeftPx: number,
  cardWidthPx: number,
  frameWidthPx: number,
): number {
  return Math.min(
    Math.max(cardLeftPx, SEAT_CARD_CLAMP_PAD_PX),
    frameWidthPx - cardWidthPx - SEAT_CARD_CLAMP_PAD_PX,
  );
}

/**
 * Axis-aligned seat-card rect in frame % for a display slot — pure mirror of
 * SeatOverlay placement (anchor + horizontal clamp) for collision tests
 * without a DOM.
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
  const leftPx = ((leftPct + tx * w) / 100) * frame.width;
  return {
    left: (clampCardLeftPx(leftPx, sizePx.width, frame.width) / frame.width) * 100,
    top: topPct + ty * h,
    width: w,
    height: h,
  };
}

/**
 * Reserved game-state band across the top of the frame (the 10 → 2 o'clock
 * arc no seat may enter). Widgets inside it are normal flow (three grid lanes), so they
 * can never overlap each other; the layout test proves the band clears every
 * seat card at every seat count.
 *
 * Paired with `.table-top-band` in index.css — keep max-width (% of frame),
 * horizontal bias (`left`), and height identical on both sides.
 */
export const TOP_BAND_MAX_WIDTH_PCT = 68;
/** Horizontal center of the band as % of frame (50 = centered; >50 biases right). */
export const TOP_BAND_CENTER_PCT = 58;
export const TOP_BAND_HEIGHT_PX = 76; // 4.75rem @ 16px root
export const TOP_BAND_GAP_PX = 8; // 0.5rem @ 16px root
export const TOP_BAND_POT_MIN_WIDTH_PX = 76; // 4.75rem @ 16px root
export const TOP_BAND_POT_FRACTION = 0.3;
export const TOP_BAND_ROLL_FRACTION = 1;
export const TOP_BAND_CLASSIC_MIN_WIDTH_PX = 80; // 5rem @ 16px root
export const TOP_BAND_CLASSIC_FRACTION = 0.5;

/** Top-band rect in frame % — pure mirror of `.table-top-band` for tests. */
export function topBandRect(frame: OverlayRect): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    left: TOP_BAND_CENTER_PCT - TOP_BAND_MAX_WIDTH_PCT / 2,
    top: 0,
    width: TOP_BAND_MAX_WIDTH_PCT,
    height: (TOP_BAND_HEIGHT_PX / frame.height) * 100,
  };
}

/** Pot / roll-to-beat / classic lane rects in frame %, mirroring the top-band CSS grid. */
export function topBandLaneRects(frame: OverlayRect): {
  pot: { left: number; top: number; width: number; height: number };
  roll: { left: number; top: number; width: number; height: number };
  classic: { left: number; top: number; width: number; height: number };
} {
  const band = topBandRect(frame);
  const bandWidthPx = (band.width / 100) * frame.width;
  const gapCount = 2;
  const availablePx = Math.max(0, bandWidthPx - TOP_BAND_GAP_PX * gapCount);
  const totalFr = TOP_BAND_POT_FRACTION + TOP_BAND_ROLL_FRACTION + TOP_BAND_CLASSIC_FRACTION;
  let potWidthPx = Math.max(
    TOP_BAND_POT_MIN_WIDTH_PX,
    availablePx * (TOP_BAND_POT_FRACTION / totalFr),
  );
  let classicWidthPx = Math.max(
    TOP_BAND_CLASSIC_MIN_WIDTH_PX,
    availablePx * (TOP_BAND_CLASSIC_FRACTION / totalFr),
  );
  let rollWidthPx = availablePx - potWidthPx - classicWidthPx;
  if (rollWidthPx < 0) {
    const overflow = -rollWidthPx;
    const shrinkable = potWidthPx + classicWidthPx;
    potWidthPx -= (overflow * potWidthPx) / shrinkable;
    classicWidthPx -= (overflow * classicWidthPx) / shrinkable;
    rollWidthPx = 0;
  }
  const toPct = (pixels: number) => (pixels / frame.width) * 100;
  const potWidth = toPct(potWidthPx);
  const rollWidth = toPct(rollWidthPx);
  const classicWidth = toPct(classicWidthPx);
  const gapWidth = toPct(TOP_BAND_GAP_PX);
  const rollLeft = band.left + potWidth + gapWidth;
  const classicLeft = rollLeft + rollWidth + gapWidth;
  return {
    pot: { left: band.left, top: band.top, width: potWidth, height: band.height },
    roll: {
      left: rollLeft,
      top: band.top,
      width: rollWidth,
      height: band.height,
    },
    classic: {
      left: classicLeft,
      top: band.top,
      width: classicWidth,
      height: band.height,
    },
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
