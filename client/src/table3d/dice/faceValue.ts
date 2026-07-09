import type { Die } from '@dice/shared';
import { quaternionFaceUp, readTopFaceFromQuat } from '@dice/shared';
import * as THREE from 'three';

/**
 * Thin three.js wrappers over the shared face/quaternion helpers (ADR 005).
 * The face-normal convention (must match PipDie mesh orientation) lives in
 * shared/src/game/restPose.ts so the server's rest-pose validation can never
 * drift from what this renderer draws — faceValue.test.ts pins the parity.
 */

/** Which face points up given the die's world rotation. */
export function readTopFace(rotation: THREE.Quaternion): Die {
  return readTopFaceFromQuat([rotation.x, rotation.y, rotation.z, rotation.w]);
}

/** Orientation that puts `value` face up (world +Y), with slight jitter optional. */
export function quaternionForFace(value: Die, jitter = 0): THREE.Quaternion {
  const [qx, qy, qz, qw] = quaternionFaceUp(value);
  const quat = new THREE.Quaternion(qx, qy, qz, qw);
  if (jitter > 0) {
    quat.multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          (Math.random() - 0.5) * jitter,
          (Math.random() - 0.5) * jitter,
          (Math.random() - 0.5) * jitter,
        ),
      ),
    );
  }
  return quat;
}
