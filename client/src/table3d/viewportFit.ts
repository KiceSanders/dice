import { FRAME_ASPECT } from './project';

/** CSS dimensions mirrored from `.table-3d` in index.css. */
export const TABLE_FRAME_CSS = {
  borderPx: 1,
  topBandRem: 4.75,
  bottomBandRem: 4.25,
  sideGutterMinRem: 4.25,
  sideGutterFraction: 0.09,
  sideGutterMaxRem: 7.5,
} as const;

/** Small breathing room so the bottom border is not flush with browser chrome. */
export const TABLE_VIEWPORT_RESERVE_PX = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Height of the desktop table frame for a given border-box width. The canvas
 * remains 16:9; only the complete frame width changes when height is scarce.
 */
export function tableFrameHeight(width: number, remPx = 16): number {
  const contentWidth = Math.max(0, width - TABLE_FRAME_CSS.borderPx * 2);
  const gutter = clamp(
    contentWidth * TABLE_FRAME_CSS.sideGutterFraction,
    TABLE_FRAME_CSS.sideGutterMinRem * remPx,
    TABLE_FRAME_CSS.sideGutterMaxRem * remPx,
  );
  const viewportWidth = Math.max(0, contentWidth - gutter * 2);
  return (
    TABLE_FRAME_CSS.borderPx * 2 +
    (TABLE_FRAME_CSS.topBandRem + TABLE_FRAME_CSS.bottomBandRem) * remPx +
    viewportWidth / FRAME_ASPECT
  );
}

/** Largest desktop frame width that fits inside the live visual viewport. */
export function tableFrameMaxWidth(viewportHeight: number, remPx = 16): number {
  const availableHeight = Math.max(0, viewportHeight - TABLE_VIEWPORT_RESERVE_PX);
  let low = 0;
  let high = Math.max(1, availableHeight * FRAME_ASPECT * 2);

  while (tableFrameHeight(high, remPx) <= availableHeight) high *= 2;

  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (tableFrameHeight(mid, remPx) <= availableHeight) low = mid;
    else high = mid;
  }
  return low;
}
