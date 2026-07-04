import type { BodyPose, PoseFrame } from '@dice/shared';
import { viewRotationY } from './layout';

const _scratch = { x: 0, z: 0 };

/** Rotate XZ position and quaternion around Y. */
export function rotateBodyPoseY(pose: BodyPose, angle: number): BodyPose {
  if (angle === 0) return pose;
  const [x, y, z, qx, qy, qz, qw] = pose;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  _scratch.x = x * c - z * s;
  _scratch.z = x * s + z * c;
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

/** World / view-local pose from physics → canonical table space (seat 0 ref). */
export function poseFrameToCanonical(frame: PoseFrame, seat: number): PoseFrame {
  const angle = -viewRotationY(seat);
  if (angle === 0) return frame;
  return {
    ...frame,
    bodies: frame.bodies.map((b) => rotateBodyPoseY(b, angle)),
  };
}

/** Canonical wire pose → local coords for rendering inside the rotated scene group. */
export function poseFrameFromCanonical(frame: PoseFrame, seat: number): PoseFrame {
  const angle = viewRotationY(seat);
  if (angle === 0) return frame;
  return {
    ...frame,
    bodies: frame.bodies.map((b) => rotateBodyPoseY(b, angle)),
  };
}
