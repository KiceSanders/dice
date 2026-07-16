import { FELT_SCALE, RAIL_OUTER_WORLD, SEAT_VIEW, TABLE } from './layout';

/**
 * Placement + motion constants for the cosmetic tie-breaker flame ring
 * (TieBreakerFlames.tsx): an open cylinder hugging the table's outer apron
 * wall, whose shader flames rise from under the table and lick up past the
 * rail rim. FELT_SCALE is isotropic (layout.test.ts), so one radius fits the
 * whole ring. flameRing.test.ts pins that the ring hugs the table and that
 * its extreme points stay in frame at the fixed camera.
 */
export const FLAME_RING = {
  /** Small outset past the apron's outer wall so tongues wrap the sides. */
  radius: RAIL_OUTER_WORLD * FELT_SCALE.x + 0.05,
  /** Below the apron bottom (surfaceY − 0.35): the fire starts under the table. */
  baseY: TABLE.surfaceY - 0.5,
  /** Cylinder top — flame tips erode below this, licking just past the rim. */
  topY: TABLE.surfaceY + TABLE.railHeight + 0.42,
  radialSegments: 96,
  /** Angular tongue count around the ring. */
  tongues: 24,
  /** Upward noise scroll speed (domain units / second). */
  scrollSpeed: 0.85,
  /** Noise domain scale around the ring / along the height. */
  noiseScale: 3.1,
  verticalScale: 2.1,
} as const;

/** Fire ramp, base → tip; additive blending makes overlaps glow. */
export const FLAME_RING_COLORS = {
  deep: '#a8200d',
  mid: '#ff7b1c',
  tip: '#ffe08a',
} as const;

/** Under-table flicker light that warms the apron while the ring burns. */
export const FLAME_LIGHT = {
  color: FLAME_RING_COLORS.mid,
  y: TABLE.surfaceY - 0.15,
  distance: 5,
  baseIntensity: 0.55,
} as const;

/**
 * Extreme points of the ring (base and top circles) for framing assertions —
 * the whole fire, under-table roots included, must stay inside the 16:9 frame.
 */
export function flameRingFramingPoints(count = 16): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const x = Math.cos(angle) * FLAME_RING.radius;
    const z = Math.sin(angle) * FLAME_RING.radius;
    points.push([x, FLAME_RING.baseY, z], [x, FLAME_RING.topY, z]);
  }
  return points;
}

/**
 * Tall licking tongues: camera-facing cards around the ring. Two staggered
 * rows give the fire parallax (it reads volumetric from the fixed seat
 * camera) and cards never go edge-on at the ring's sides the way a cylinder
 * shell does. The camera is fixed (SEAT_VIEW), so facing is computed once.
 */
export const FLAME_CARDS = {
  rows: [
    { radius: RAIL_OUTER_WORLD * FELT_SCALE.x + 0.02, count: 30, angleOffset: 0 },
    { radius: RAIL_OUTER_WORLD * FELT_SCALE.x + 0.16, count: 30, angleOffset: Math.PI / 30 },
  ],
  /** Card roots sit below the apron bottom (surfaceY − 0.35). The in-card
      base fade reaches zero alpha exactly at the card edge, so there is no
      cutoff line; −0.42 is as deep as the near arc can go and stay in frame. */
  baseY: TABLE.surfaceY - 0.42,
  /**
   * Tip height varies with nearness to the viewer: the far arc has only
   * ~0.53 world units of vertical frame headroom (the near arc has ~2.1),
   * and shorter far flames read correctly in perspective anyway. Per-card
   * jitter only shrinks, so these are exact framing bounds.
   */
  nearTipY: TABLE.surfaceY + 0.8,
  farTipY: TABLE.surfaceY + 0.42,
  maxWidth: 0.62,
  /** Deterministic per-card jitter ranges (shrink-only). */
  minHeightScale: 0.72,
  minWidthScale: 0.75,
  /** Angular root jitter as a fraction of card spacing (each direction). */
  angleJitterFrac: 0.2,
} as const;

export interface FlameCard {
  x: number;
  z: number;
  /** Rotation around Y so the card faces the fixed camera. */
  yaw: number;
  width: number;
  height: number;
  /** Per-card noise seed in [0, 1). */
  seed: number;
}

/** Deterministic per-index jitter in [0, 1) — stable across renders and tests. */
function jitter(index: number, salt: number): number {
  const v = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Framing-safe tip height at a ring position: tall near the viewer, short behind. */
export function cardTipY(z: number, radius: number): number {
  const nearness = (z / radius + 1) / 2; // 0 = far arc, 1 = near arc
  return FLAME_CARDS.farTipY + (FLAME_CARDS.nearTipY - FLAME_CARDS.farTipY) * nearness;
}

/** Card placements around the ring, facing the fixed seat camera. Deterministic. */
export function flameCards(): FlameCard[] {
  const { rows, baseY, maxWidth, minHeightScale, minWidthScale, angleJitterFrac } = FLAME_CARDS;
  const [camX, , camZ] = SEAT_VIEW.position;
  const cards: FlameCard[] = [];
  let index = 0;
  for (const row of rows) {
    const spacing = (Math.PI * 2) / row.count;
    for (let i = 0; i < row.count; i += 1) {
      const angle =
        row.angleOffset + i * spacing + (jitter(index, 3) * 2 - 1) * spacing * angleJitterFrac;
      const x = Math.cos(angle) * row.radius;
      const z = Math.sin(angle) * row.radius;
      const maxHeight = cardTipY(z, row.radius) - baseY;
      cards.push({
        x,
        z,
        yaw: Math.atan2(camX - x, camZ - z),
        width: maxWidth * (minWidthScale + (1 - minWidthScale) * jitter(index, 1)),
        height: maxHeight * (minHeightScale + (1 - minHeightScale) * jitter(index, 2)),
        seed: jitter(index, 4),
      });
      index += 1;
    }
  }
  return cards;
}
