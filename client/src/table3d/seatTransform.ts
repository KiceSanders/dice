import type { BodyPose, PoseFrame } from '@dice/shared';
import { type SeatDisplayPlacement, seatRingAngle, viewRotationY } from './layout';

const _scratch = { x: 0, z: 0 };

/**
 * Rotate a rigid pose (XZ position + quaternion) about +Y by `angle`, using
 * three.js sign conventions: a positive angle carries +Z toward +X, exactly
 * like `THREE.Matrix4.makeRotationY(angle)`. The test suite pins this against
 * three.js so the convention cannot silently drift.
 */
export function rotateBodyPoseY(pose: BodyPose, angle: number): BodyPose {
  if (angle === 0) return pose;
  const [x, y, z, qx, qy, qz, qw] = pose;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  _scratch.x = x * c + z * s;
  _scratch.z = -x * s + z * c;
  // q_result = q_y(angle) * q_original
  const half = angle * 0.5;
  const cy = Math.cos(half);
  const sy = Math.sin(half);
  const rqw = cy * qw - sy * qy;
  const rqx = cy * qx + sy * qz;
  const rqy = cy * qy + sy * qw;
  const rqz = cy * qz - sy * qx;
  return [_scratch.x, y, _scratch.z, rqx, rqy, rqz, rqw];
}

/**
 * Roller's view-local pose (roller at +Z / bottom) → canonical table space
 * (seat `seat` at its physical position). Applied once when sending frames.
 */
export function poseFrameToCanonical(frame: PoseFrame, seat: number): PoseFrame {
  const angle = viewRotationY(seat);
  if (angle === 0) return frame;
  return {
    ...frame,
    bodies: frame.bodies.map((b) => rotateBodyPoseY(b, angle)),
  };
}

/**
 * Canonical wire/rest pose → the shared occupied-card placement for its
 * originating player. The fixed ring remains the canonical transport space;
 * this viewer-specific presentation rotation makes the whole throw (cup,
 * scattered dice, and kept rail) line up with that player's reflowed card.
 */
export function poseFrameForSeatDisplay(
  frame: PoseFrame,
  placement: SeatDisplayPlacement,
): PoseFrame {
  // rotateBodyPoseY subtracts its angle from the position's XZ polar angle.
  const angle = seatRingAngle(placement.seatIndex) - placement.angle;
  if (angle === 0) return frame;
  return {
    ...frame,
    bodies: frame.bodies.map((b) => rotateBodyPoseY(b, angle)),
  };
}
