import { describe, expect, it } from 'vitest';
import type { BodyPose, DieSides } from '../types.js';
import {
  D12_FACES,
  D12_INRADIUS,
  D12_NORMALS,
  D12_VERTICES,
  polyhedralFaceUp,
  readPolyhedralTopFace,
  validatePolyhedralRestPose,
} from './polyhedral.js';

describe('physical d12 geometry and authoritative face convention', () => {
  it('has 20 equal-radius vertices, 12 regular pentagonal faces, and opposite values sum to 13', () => {
    expect(D12_VERTICES).toHaveLength(20);
    expect(D12_FACES).toHaveLength(12);
    const radius = Math.hypot(...D12_VERTICES[0]!);
    for (const v of D12_VERTICES) expect(Math.hypot(...v)).toBeCloseTo(radius, 10);
    for (const face of D12_FACES) {
      expect(face.vertices).toHaveLength(5);
      const edge = Math.hypot(...face.vertices[0]!.map((v, i) => v - face.vertices[1]![i]!));
      for (let i = 0; i < 5; i++) {
        const a = face.vertices[i]!;
        const b = face.vertices[(i + 1) % 5]!;
        expect(Math.hypot(...a.map((v, j) => v - b[j]!))).toBeCloseTo(edge, 10);
        expect(a.reduce((sum, v, j) => sum + v * face.normal[j]!, 0)).toBeCloseTo(D12_INRADIUS, 10);
      }
      expect(
        face.normal.reduce((sum, v, j) => sum + v * D12_NORMALS[12 - face.value]![j]!, 0),
      ).toBeCloseTo(-1, 10);
    }
  });
  for (const sides of [6, 12] as DieSides[]) {
    it(`reads every d${sides} face in the same orientation used by meshes and saved poses`, () => {
      for (let die = 1; die <= sides; die++) {
        const quaternion = polyhedralFaceUp(die, sides);
        expect(readPolyhedralTopFace(quaternion, sides)).toBe(die);
        const pose: BodyPose = [0, 0.07, 0, ...quaternion];
        expect(validatePolyhedralRestPose([pose], [die], sides)).toBeNull();
        expect(validatePolyhedralRestPose([pose], [(die % sides) + 1], sides)).not.toBeNull();
      }
    });
  }
  it('soft-rejects impossible positions and non-unit quaternions', () => {
    expect(
      validatePolyhedralRestPose([[99, 0.1, 0, ...polyhedralFaceUp(12, 12)]], [12], 12),
    ).not.toBeNull();
    expect(validatePolyhedralRestPose([[0, 0.1, 0, 0, 0, 0, 0]], [12], 12)).not.toBeNull();
  });
});
