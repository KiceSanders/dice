import {
  FELT_COLLIDER_HALF_Y,
  FELT_HALF_EXTENT,
  FELT_SCALE,
  RAIL_INNER_WORLD,
  TABLE,
} from '../layout';

/** Edge length of each die in world units (~12 cm on a ~2 m table). */
export const DIE_SIZE = 0.12;
export const DIE_HALF = DIE_SIZE / 2;

export const DICE_COUNT = 5;
/** Five stood-hand dice plus the temporary Yahtzee bonus die. */
export const BONUS_DICE_COUNT = DICE_COUNT + 1;
/** Runtime index of the temporary Yahtzee bonus die. */
export const BONUS_DIE_INDEX = DICE_COUNT;

/** Overhead safety collider half-extents (slightly inset from visual rail). */
export const FELT_HALF_X = FELT_SCALE.x * TABLE.feltRadius * 0.92;
export const FELT_HALF_Z = FELT_SCALE.z * TABLE.feltRadius * 0.92;

/** Play area bound — inner rail ellipse (matches physics bumper). */
export const FELT_BOUND_X = FELT_SCALE.x * RAIL_INNER_WORLD;
export const FELT_BOUND_Z = FELT_SCALE.z * RAIL_INNER_WORLD;
export const FELT_HALF_Y = FELT_COLLIDER_HALF_Y;

/** Inset from felt edge when clamping hover positions. */
export const FELT_CLAMP_MARGIN = 0.02;

/** Max world-space radius of the screen-offset die cluster (conservative clamp for center). */
export const CLUSTER_WORLD_RADIUS = 0.06;

/** Resting die center on the felt surface. */
export const DICE_FELT_Y = TABLE.surfaceY + DIE_HALF + 0.003;

/** Die center height while grabbed above the felt (world Y). */
export const DICE_HOVER_Y = DICE_FELT_Y + 0.3;

/** Per-die screen-pixel offsets from cursor (index 0–4; center die at index 2). */
export const DIE_SCREEN_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-22, 10],
  [-11, -8],
  [0, 0],
  [11, -8],
  [22, 10],
];

export const PHYSICS = {
  gravity: [0, -8, 0] as [number, number, number],
  dieFriction: 0.22,
  dieRestitution: 0.11,
  dieDensity: 2.4,
  tableFriction: 0.95,
  tableRestitution: 0.04,
  railFriction: 0.82,
  railRestitution: 0.16,
  /** Invisible outer wall — contain dice, minimal bounce. */
  wallFriction: 0.9,
  wallRestitution: 0.02,
  /** Defaults; production tuning may raise these (see DEFAULT_DICE_PHYSICS_TUNING). */
  linearDamping: 0.2,
  angularDamping: 0.25,
  settleLinVel: 0.08,
  settleAngVel: 0.45,
  settleFrames: 18,
  maxLinVel: 8,
  maxAngVel: 34,
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
  radius: 0.27,
  height: KOOZIE_HEIGHT,
  wallThickness: 0.075,
  bottomThickness: 0.024,
  rimInset: 0.03,
  friction: 0.82,
  restitution: 0.04,
  density: 1.2,
  floatCenterY: KOOZIE_FLOAT_CENTER_Y,
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
  tiltDurationMs: 680,
  /**
   * Generous pickup radii are safe only because grabs of the docked cup are
   * additionally gated by pointerBelowNearDockGuard (below kept-die bottoms) —
   * keep/unkeep clicks on the rail never reach the cup regardless of these.
   */
  hitRadius: 0.34,
  /** Screen-space pickup radius in CSS pixels. */
  hitScreenPx: 100,
  emptyCheckRadius: 0.22,
} as const;
