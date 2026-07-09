/**
 * Settled rest-pose helpers shared by server and client (ADR 005).
 *
 * The roller reports where its dice physically came to rest
 * (`turn:throwResult.restPose`, canonical table space, 5 dice in hand-index
 * order, cup excluded). The server validates the pose against the reported
 * face values before storing/broadcasting it, so every viewer — including
 * rejoiners — renders the same layout. Pure math only: no three.js, usable in
 * node.
 */

import type { BodyPose, Die } from '../types.js';
import { HAND_SIZE } from './dice.js';

export type Quat = [qx: number, qy: number, qz: number, qw: number];

/**
 * Face normals in die-local space (+Y is "1", opposites sum to 7).
 * Must match the client's PipDie mesh orientation — a client test pins the
 * three.js faceValue helpers to these.
 */
export const FACE_NORMALS: Record<Die, readonly [number, number, number]> = {
  1: [0, 1, 0],
  6: [0, -1, 0],
  2: [0, 0, 1],
  5: [0, 0, -1],
  3: [1, 0, 0],
  4: [-1, 0, 0],
};

export const ALL_DIE_FACES: readonly Die[] = [1, 2, 3, 4, 5, 6];

/** World-space Y of die-local vector `v` rotated by quaternion `q`. */
function rotatedY(v: readonly [number, number, number], q: Quat): number {
  const [qx, qy, qz, qw] = q;
  // t = 2 * (q.xyz × v); v' = v + qw * t + q.xyz × t — only the Y row.
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return v[1] + qw * ty + qz * tx - qx * tz;
}

/** Which face points up (world +Y) given a die's rotation quaternion. */
export function readTopFaceFromQuat(q: Quat): Die {
  let best: Die = 1;
  let bestY = -Infinity;
  for (const value of ALL_DIE_FACES) {
    const y = rotatedY(FACE_NORMALS[value], q);
    if (y > bestY) {
      bestY = y;
      best = value;
    }
  }
  return best;
}

/**
 * Orientation putting `value` face up (world +Y): the shortest arc from the
 * face normal to +Y, same convention as THREE.Quaternion.setFromUnitVectors.
 */
export function quaternionFaceUp(value: Die): Quat {
  const [x, y, z] = FACE_NORMALS[value];
  const dot = y; // dot with (0, 1, 0)
  if (dot < -0.999999) return [1, 0, 0, 0]; // antiparallel: half-turn about X
  // q = (from × up, 1 + dot), normalized. from × (0,1,0) = (-z, 0, x).
  // `+ 0` folds -0 into 0 so poses survive a JSON round-trip bit-identically.
  const qx = -z + 0;
  const qz = x + 0;
  const qw = 1 + dot;
  const n = Math.hypot(qx, qz, qw);
  return [qx / n, 0, qz / n, qw / n];
}

/**
 * Canonical-space envelope every settled die must land inside. Generous on
 * purpose — it only needs to reject nonsense (off-table coordinates), not
 * re-litigate physics. The client layout must stay inside it: felt half-extent
 * is 1.9, kept dice sit on the roller's rail at radius ≈ 2.15 (die center
 * Y ≈ 0.156); diceLayout.test.ts pins layout constants against these bounds.
 */
export const REST_POSE_BOUNDS = {
  /** Max horizontal distance from table center, hypot(x, z). */
  maxRadius: 2.5,
  minY: 0,
  maxY: 1,
} as const;

/** ‖q‖ may drift from 1 through streaming/rotation round-off; allow a little. */
const QUAT_NORM_TOLERANCE = 1e-2;

/**
 * Validate a roller-supplied rest pose against the authoritative face values.
 * Returns null when acceptable, else a reason string (for logs). Callers drop
 * a bad pose but never reject the throw — dice values stay authoritative.
 */
export function validateRestPose(restPose: BodyPose[], dice: Die[]): string | null {
  if (restPose.length !== HAND_SIZE) {
    return `expected ${HAND_SIZE} poses, got ${restPose.length}`;
  }
  if (dice.length !== HAND_SIZE) {
    return `expected ${HAND_SIZE} dice, got ${dice.length}`;
  }
  for (let i = 0; i < HAND_SIZE; i++) {
    const pose = restPose[i];
    if (pose === undefined) return `die ${i}: missing pose`;
    if (pose.length !== 7 || !pose.every((n) => Number.isFinite(n))) {
      return `die ${i}: pose must be 7 finite numbers`;
    }
    const [x, y, z, qx, qy, qz, qw] = pose;
    const norm = Math.hypot(qx, qy, qz, qw);
    if (Math.abs(norm - 1) > QUAT_NORM_TOLERANCE) {
      return `die ${i}: quaternion norm ${norm.toFixed(4)} not near 1`;
    }
    if (Math.hypot(x, z) > REST_POSE_BOUNDS.maxRadius) {
      return `die ${i}: position off the table (radius ${Math.hypot(x, z).toFixed(3)})`;
    }
    if (y < REST_POSE_BOUNDS.minY || y > REST_POSE_BOUNDS.maxY) {
      return `die ${i}: height ${y.toFixed(3)} outside table range`;
    }
    const face = readTopFaceFromQuat([qx, qy, qz, qw]);
    const expected = dice[i];
    if (expected === undefined || face !== expected) {
      return `die ${i}: top face ${face} does not match reported value ${expected}`;
    }
  }
  return null;
}
