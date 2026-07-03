import { FELT_HALF_EXTENT, FELT_SCALE, RAIL_INNER_WORLD, TABLE } from '../layout';

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
  return [t, DICE_FELT_Y, FELT_HALF_EXTENT.z * 0.02 + (index % 2) * 0.05];
}

/** Drop from just above the felt near the active player (+Z). */
export function dieSpawnPosition(index: number): [number, number, number] {
  const spread = (index - 2) * 0.1;
  return [
    spread + (Math.random() - 0.5) * 0.04,
    0.14 + index * 0.012,
    FELT_HALF_EXTENT.z * 0.4 + (Math.random() - 0.5) * 0.05,
  ];
}

/** Physics dice cup — closed bottom, open top; floats above felt for spill room. */
const KOOZIE_HEIGHT = 0.4;
/** Cup center height while idle / dragging (well above the felt). */
const KOOZIE_FLOAT_CENTER_Y = DICE_FELT_Y + 0.72;
const KOOZIE_RIM_Y = KOOZIE_FLOAT_CENTER_Y + KOOZIE_HEIGHT * 0.5 - 0.03;

export const KOOZIE = {
  radius: 0.26,
  height: KOOZIE_HEIGHT,
  wallThickness: 0.024,
  wallSegments: 12,
  bottomThickness: 0.016,
  rimInset: 0.03,
  friction: 0.85,
  restitution: 0.08,
  density: 1.2,
  floatCenterY: KOOZIE_FLOAT_CENTER_Y,
  home: [0, KOOZIE_FLOAT_CENTER_Y, FELT_HALF_EXTENT.z * 0.47] as [number, number, number],
  /** Pointer raycast plane at the open rim — matches where the cup hangs from. */
  dragPlaneY: KOOZIE_RIM_Y,
  /** Rim follow speed — high enough to feel direct, low enough to filter pointer jitter. */
  gripFollow: 34,
  gripVelSmooth: 16,
  gripAccelSmooth: 9,
  /** Pointer acceleration fed into the pendulum swing (not steady drag speed). */
  swingKick: 0.011,
  /** Ignore tiny accelerations so micro-jitter does not wobble the cup. */
  swingKickDeadzone: 1.4,
  /** Spring that pulls the cup back to vertical under the grip. */
  swingStiffness: 34,
  swingDamping: 0.87,
  /** Smooths tilt changes frame-to-frame. */
  tiltSmooth: 24,
  maxDragTilt: 0.38,
  /** World-space drop while tipping so the rim clears the felt. */
  tipDropY: 0.18,
  /** How far the cup rotates on release (open end toward the felt). */
  releaseTipAngle: 2.15,
  /** Blend grip velocity into release sample (0–1). */
  gripVelReleaseBlend: 0.4,
  /** Horizontal speed below which pour falls back to default forward. */
  pourSpeedThreshold: 0.3,
  /** Speed (m/s) that maps to max velocity weight. */
  pourSpeedFull: 2,
  pourVelMin: 0.35,
  pourVelMax: 0.75,
  pourTilt: 0.45,
  pourDown: 0.25,
  /** Overlap factor for radial wall segment arc length. */
  wallArcOverlap: 1.12,
  tiltDurationMs: 680,
  hitRadius: 0.34,
  /** Screen-space pickup radius in CSS pixels. */
  hitScreenPx: 100,
  emptyCheckRadius: 0.22,
} as const;

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
