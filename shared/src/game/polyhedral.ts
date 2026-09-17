import type { BodyPose, Die, DieSides } from '../types.js';
import { type Quat, quaternionFaceUp, readTopFaceFromQuat, validateRestPose } from './restPose.js';

type Vec3 = [number, number, number];
const PHI = (1 + Math.sqrt(5)) / 2;
const LENGTH = Math.hypot(1, PHI);
const half: Vec3[] = [
  [0, 1, PHI],
  [0, -1, PHI],
  [1, PHI, 0],
  [-1, PHI, 0],
  [PHI, 0, 1],
  [PHI, 0, -1],
];
/** Icosahedron vertices are the twelve outward normals of its dual dodecahedron. Opposites sum to 13. */
export const D12_NORMALS: Vec3[] = [
  ...half,
  ...[...half].reverse().map(([x, y, z]): Vec3 => [-x, -y, -z]),
].map(([x, y, z]): Vec3 => [x / LENGTH, y / LENGTH, z / LENGTH]);
export const D12_INRADIUS = 0.058;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Intersections of three face planes; shared by the visible mesh and convex collider. */
export const D12_VERTICES: Vec3[] = [];
for (let i = 0; i < 12; i++) {
  for (let j = i + 1; j < 12; j++) {
    for (let k = j + 1; k < 12; k++) {
      const a = D12_NORMALS[i]!;
      const b = D12_NORMALS[j]!;
      const c = D12_NORMALS[k]!;
      const bc = cross(b, c),
        ca = cross(c, a),
        ab = cross(a, b);
      const det = dot(a, bc);
      if (Math.abs(det) < 1e-8) continue;
      const point = [0, 1, 2].map(
        (axis) => (D12_INRADIUS * (bc[axis]! + ca[axis]! + ab[axis]!)) / det,
      ) as Vec3;
      if (
        D12_NORMALS.every((normal) => dot(normal, point) <= D12_INRADIUS + 1e-8) &&
        !D12_VERTICES.some(
          (v) => Math.hypot(v[0] - point[0], v[1] - point[1], v[2] - point[2]) < 1e-8,
        )
      ) {
        D12_VERTICES.push(point);
      }
    }
  }
}

export const D12_FACES = D12_NORMALS.map((normal, index) => {
  const center = normal.map((v) => v * D12_INRADIUS) as Vec3;
  const basis = cross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const length = Math.hypot(...basis);
  const u = basis.map((v) => v / length) as Vec3;
  const v = cross(normal, u);
  const vertices = D12_VERTICES.filter(
    (point) => Math.abs(dot(point, normal) - D12_INRADIUS) < 1e-8,
  ).sort((a, b) => Math.atan2(dot(a, v), dot(a, u)) - Math.atan2(dot(b, v), dot(b, u)));
  return { value: index + 1, normal, center, vertices, u, v };
});

export function readPolyhedralTopFace(q: Quat, sides: DieSides): number {
  if (sides === 6) return readTopFaceFromQuat(q);
  const [x, y, z, w] = q;
  let best = 1;
  let height = -Infinity;
  D12_NORMALS.forEach(([nx, ny, nz], i) => {
    const up = 2 * (x * y + z * w) * nx + (1 - 2 * (x * x + z * z)) * ny + 2 * (y * z - x * w) * nz;
    if (up > height) {
      height = up;
      best = i + 1;
    }
  });
  return best;
}

export function polyhedralFaceUp(value: number, sides: DieSides): Quat {
  if (sides === 6) return quaternionFaceUp(value as Die);
  const [x, y, z] = D12_NORMALS[value - 1]!;
  const length = Math.hypot(z, x, 1 + y);
  return [-z / length, 0, x / length, (1 + y) / length];
}

export function validatePolyhedralRestPose(
  poses: BodyPose[],
  dice: number[],
  sides: DieSides,
): string | null {
  return validateRestPose(poses, dice, (q) => readPolyhedralTopFace(q, sides));
}
