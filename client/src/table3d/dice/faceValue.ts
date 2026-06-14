import type { Die } from '@dice/shared';
import * as THREE from 'three';

/**
 * Face normals in die-local space (+Y is "1", opposites sum to 7).
 * Must match PipDie mesh orientation.
 */
const FACE_NORMALS: Record<Die, THREE.Vector3> = {
  1: new THREE.Vector3(0, 1, 0),
  6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(0, 0, 1),
  5: new THREE.Vector3(0, 0, -1),
  3: new THREE.Vector3(1, 0, 0),
  4: new THREE.Vector3(-1, 0, 0),
};

const _normal = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

/** Which face points up given the die's world rotation. */
export function readTopFace(rotation: THREE.Quaternion): Die {
  let best: Die = 1;
  let bestDot = -Infinity;
  for (const value of [1, 2, 3, 4, 5, 6] as Die[]) {
    _normal.copy(FACE_NORMALS[value]).applyQuaternion(rotation);
    if (_normal.y > bestDot) {
      bestDot = _normal.y;
      best = value;
    }
  }
  return best;
}

/** Orientation that puts `value` face up (world +Y), with slight jitter optional. */
export function quaternionForFace(value: Die, jitter = 0): THREE.Quaternion {
  const local = FACE_NORMALS[value];
  _quat.setFromUnitVectors(local, _up);
  if (jitter > 0) {
    _quat.multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          (Math.random() - 0.5) * jitter,
          (Math.random() - 0.5) * jitter,
          (Math.random() - 0.5) * jitter,
        ),
      ),
    );
  }
  return _quat.clone();
}
