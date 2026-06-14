import { FELT_SCALE, RAIL_INNER_WORLD, TABLE } from '../layout';

/** Edge length of each die in world units (~12 cm on a ~2 m table). */
export const DIE_SIZE = 0.12;
export const DIE_HALF = DIE_SIZE / 2;

export const DICE_COUNT = 5;

/** Felt collider half-extents (slightly inset from visual rail). */
export const FELT_HALF_X = FELT_SCALE.x * TABLE.feltRadius * 0.92;
export const FELT_HALF_Z = FELT_SCALE.z * TABLE.feltRadius * 0.92;

/** Play area bound — inner rail ellipse (matches physics bumper). */
export const FELT_BOUND_X = FELT_SCALE.x * RAIL_INNER_WORLD;
export const FELT_BOUND_Z = FELT_SCALE.z * RAIL_INNER_WORLD;
export const FELT_HALF_Y = 0.045;

/** Inset from felt edge when clamping hover positions. */
export const FELT_CLAMP_MARGIN = 0.02;

/** Max world-space radius of the screen-offset die cluster (conservative clamp for center). */
export const CLUSTER_WORLD_RADIUS = 0.06;

/** Resting die center on the felt surface. */
export const DICE_FELT_Y = TABLE.surfaceY + DIE_HALF + 0.003;

/** Die center height while grabbed above the felt (world Y). */
export const DICE_HOVER_Y = DICE_FELT_Y + 0.30;

/** Per-die screen-pixel offsets from cursor (index 0–4; center die at index 2). */
export const DIE_SCREEN_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-22, 10],
  [-11, -8],
  [0, 0],
  [11, -8],
  [22, 10],
];

export const PHYSICS = {
  gravity: [0, -9.8, 0] as [number, number, number],
  dieFriction: 0.72,
  dieRestitution: 0.22,
  dieDensity: 2.8,
  tableFriction: 0.95,
  tableRestitution: 0.05,
  railFriction: 0.78,
  railRestitution: 0.22,
  /** Invisible outer wall — contain dice, minimal bounce. */
  wallFriction: 0.9,
  wallRestitution: 0.04,
  linearDamping: 0.45,
  angularDamping: 0.55,
  settleLinVel: 0.04,
  settleAngVel: 0.25,
  settleFrames: 10,
  maxLinVel: 3.5,
  maxAngVel: 12,
} as const;

/** Resting slot offsets on the felt (index 0–4). */
export function dieSlotPosition(index: number): [number, number, number] {
  const t = (index - 2) * 0.2;
  return [t, DICE_FELT_Y, 0.02 + (index % 2) * 0.05];
}

/** Drop from just above the felt near the active player (+Z). */
export function dieSpawnPosition(index: number): [number, number, number] {
  const spread = (index - 2) * 0.1;
  return [
    spread + (Math.random() - 0.5) * 0.04,
    0.14 + index * 0.012,
    0.38 + (Math.random() - 0.5) * 0.05,
  ];
}

export function randomRollImpulse(): { linear: [number, number, number]; angular: [number, number, number] } {
  return {
    linear: [
      (Math.random() - 0.5) * 0.35,
      0.15 + Math.random() * 0.25,
      -0.55 - Math.random() * 0.45,
    ],
    angular: [
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
    ],
  };
}
