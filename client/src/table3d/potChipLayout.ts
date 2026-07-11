export interface PotChipPoint {
  x: number;
  y: number;
  radius: number;
}

export interface PotChipLayout {
  width: number;
  height: number;
  points: PotChipPoint[];
}

const MAX_COIN_RADIUS = 9;
const HORIZONTAL_STEP_RADIUS = 1.7;
const VERTICAL_STEP_RADIUS = 1.25;

/** Bottom-up row lengths for the smallest triangular stack that holds `count` chips. */
export function potChipRows(count: number): number[] {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return [];

  let rowCapacity = 1;
  while ((rowCapacity * (rowCapacity + 1)) / 2 < total) rowCapacity += 1;

  const rows: number[] = [];
  let remaining = total;
  for (let capacity = rowCapacity; capacity >= 1 && remaining > 0; capacity -= 1) {
    const rowLength = Math.min(capacity, remaining);
    rows.push(rowLength);
    remaining -= rowLength;
  }
  return rows;
}

/**
 * Pack one visible coin per chip into a centered pyramid. The radius is allowed
 * to shrink without a floor so even very large pots remain exact and in-bounds.
 */
export function layoutPotChips(count: number, maxWidth: number, maxHeight: number): PotChipLayout {
  const width = Math.max(0, maxWidth);
  const height = Math.max(0, maxHeight);
  const rows = potChipRows(count);
  if (rows.length === 0 || width === 0 || height === 0) return { width, height, points: [] };

  const widest = Math.max(...rows);
  const radiusByWidth = width / (2 + (widest - 1) * HORIZONTAL_STEP_RADIUS);
  const radiusByHeight = height / (2 + (rows.length - 1) * VERTICAL_STEP_RADIUS);
  const radius = Math.min(MAX_COIN_RADIUS, radiusByWidth, radiusByHeight);
  const horizontalStep = radius * HORIZONTAL_STEP_RADIUS;
  const verticalStep = radius * VERTICAL_STEP_RADIUS;
  const stackHeight = radius * 2 + (rows.length - 1) * verticalStep;
  const bottomY = (height + stackHeight) / 2 - radius;

  const points: PotChipPoint[] = [];
  rows.forEach((rowLength, rowIndex) => {
    const rowWidth = radius * 2 + (rowLength - 1) * horizontalStep;
    const startX = (width - rowWidth) / 2 + radius;
    const y = bottomY - rowIndex * verticalStep;
    for (let column = 0; column < rowLength; column += 1) {
      points.push({ x: startX + column * horizontalStep, y, radius });
    }
  });

  return { width, height, points };
}
