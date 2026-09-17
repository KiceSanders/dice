import {
  D12_INRADIUS,
  D12_NORMALS,
  D12_VERTICES,
  polyhedralFaceUp,
  readPolyhedralTopFace,
} from '@dice/shared';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sampleDieValues } from './sampleDieValues';

// Headless physics exercises the actual hull without launching browser verification.
describe('d12 physics and value sampling', () => {
  it('settles a convex dodecahedron on a flat face with its numbered top readable', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -8, z: 0 });
    try {
      world.createCollider(RAPIER.ColliderDesc.cuboid(2, 0.05, 2).setTranslation(0, -0.05, 0));
      for (const value of [1, 6, 7, 12]) {
        const q = new THREE.Quaternion(...polyhedralFaceUp(value, 12));
        q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.3, 0.08)));
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0, 0.35, 0)
            .setRotation(q)
            .setLinearDamping(0.25)
            .setAngularDamping(0.4),
        );
        const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(D12_VERTICES.flat()))!;
        world.createCollider(hull.setRestitution(0.1).setFriction(0.8), body);
        for (let i = 0; i < 360; i++) world.step();
        const r = body.rotation();
        const top = readPolyhedralTopFace([r.x, r.y, r.z, r.w], 12);
        const normal = new THREE.Vector3(...D12_NORMALS[top - 1]!).applyQuaternion(
          new THREE.Quaternion(r.x, r.y, r.z, r.w),
        );
        expect(normal.y).toBeGreaterThan(0.99);
        expect(body.translation().y).toBeCloseTo(D12_INRADIUS, 2);
        expect(Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z)).toBeLessThan(0.01);
        world.removeRigidBody(body);
      }
    } finally {
      world.free();
    }
  });
  it('reads faces above six and permits the existing dev override for twelve-sided rolls', () => {
    const input = {
      diceCount: 1,
      runtimeCount: 1,
      sides: 12 as const,
      kept: [],
      committed: [],
      rotation: () => polyhedralFaceUp(12, 12),
    };
    expect(sampleDieValues(input)).toEqual([12]);
    expect(sampleDieValues({ ...input, forced: [11] })).toEqual([11]);
    expect(sampleDieValues({ ...input, forced: [13] })).toEqual([12]);
  });
});
