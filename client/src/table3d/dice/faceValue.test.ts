import type { Die } from '@dice/shared';
import { ALL_DIE_FACES, FACE_NORMALS, readTopFaceFromQuat } from '@dice/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { quaternionForFace, readTopFace } from './faceValue';

/**
 * Pins the PipDie mesh convention (three.js side) to the shared pure-math
 * helpers the server's rest-pose validation uses (ADR 005). If either side's
 * face normals drift, an honest roller's poses would start getting dropped —
 * this test makes that a build failure instead of a silent slot-fallback.
 */
describe('faceValue ↔ shared restPose parity', () => {
  it('shared FACE_NORMALS behave like the three.js mesh normals', () => {
    for (const value of ALL_DIE_FACES) {
      const [x, y, z] = FACE_NORMALS[value];
      const rotated = new THREE.Vector3(x, y, z).applyQuaternion(quaternionForFace(value));
      expect(rotated.y).toBeCloseTo(1, 6);
    }
  });

  it('readTopFace and readTopFaceFromQuat agree on every face-up orientation', () => {
    for (const value of ALL_DIE_FACES) {
      const q = quaternionForFace(value);
      expect(readTopFace(q)).toBe(value);
      expect(readTopFaceFromQuat([q.x, q.y, q.z, q.w])).toBe(value);
    }
  });

  it('readTopFace and readTopFaceFromQuat agree on arbitrary rotations', () => {
    // Deterministic sweep of composed rotations — includes tilted, mid-tumble
    // orientations where the nearest-face choice is what matters.
    const angles = [0, 0.4, 0.9, 1.7, 2.4, 3.1];
    for (const value of ALL_DIE_FACES) {
      for (const ax of angles) {
        for (const az of angles) {
          const q = quaternionForFace(value as Die)
            .clone()
            .premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(ax, 0.3, az)));
          expect(readTopFaceFromQuat([q.x, q.y, q.z, q.w])).toBe(readTopFace(q));
        }
      }
    }
  });
});
