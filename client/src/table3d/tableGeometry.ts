import { BufferGeometry, CircleGeometry, Float32BufferAttribute, RingGeometry } from 'three';
import {
  FELT_COLLIDER_HALF_Y,
  FELT_SCALE,
  RAIL_COLLIDER_H,
  RAIL_COLLIDER_Y,
  RAIL_HIGHLIGHT_INNER,
  RAIL_HIGHLIGHT_OUTER,
  RAIL_INNER,
  RAIL_INNER_WORLD,
  RAIL_OUTER,
  RAIL_OUTER_WORLD,
  TABLE,
  TABLE_WALL_H,
  TABLE_WALL_OUTSET,
  TABLE_WALL_Y,
} from './layout';

export const TABLE_GEOMETRY_SEGMENTS = 64;

const TABLE_WALL_THICKNESS = 0.08;

export type TableTrimeshArgs = [vertices: Float32Array, indices: Uint32Array];

interface ExtrudedOvalRingOptions {
  innerRadius: number;
  outerRadius: number;
  centerY: number;
  height: number;
  segments?: number;
}

/** World-space point on the felt ellipse (XZ plane). */
export function feltEllipsePoint(theta: number, radius: number = TABLE.feltRadius): [number, number] {
  return [
    radius * FELT_SCALE.x * Math.cos(theta),
    radius * FELT_SCALE.z * Math.sin(theta),
  ];
}

export function createFeltGeometry(): CircleGeometry {
  return new CircleGeometry(TABLE.feltRadius, TABLE_GEOMETRY_SEGMENTS);
}

/** Thin elliptical disc for felt collision — matches visual circle + FELT_SCALE. */
export function createFeltColliderGeometry(
  halfHeight = FELT_COLLIDER_HALF_Y,
  segments = TABLE_GEOMETRY_SEGMENTS,
): BufferGeometry {
  const bottomY = TABLE.surfaceY - halfHeight;
  const topY = TABLE.surfaceY;
  const positions: number[] = [0, bottomY, 0, 0, topY, 0];
  const indices: number[] = [];
  const centerBottom = 0;
  const centerTop = 1;

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const [x, z] = feltEllipsePoint(theta);
    positions.push(x, bottomY, z, x, topY, z);
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const rimBottom = 2 + i * 2;
    const rimTop = rimBottom + 1;
    const nextRimBottom = 2 + next * 2;
    const nextRimTop = nextRimBottom + 1;

    indices.push(
      centerTop, rimTop, nextRimTop,
      centerBottom, nextRimBottom, rimBottom,
      rimBottom, rimTop, nextRimTop,
      rimBottom, nextRimTop, nextRimBottom,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createRailRingGeometry(): RingGeometry {
  return new RingGeometry(RAIL_INNER, RAIL_OUTER, TABLE_GEOMETRY_SEGMENTS);
}

export function createRailHighlightGeometry(): RingGeometry {
  return new RingGeometry(RAIL_HIGHLIGHT_INNER, RAIL_HIGHLIGHT_OUTER, TABLE_GEOMETRY_SEGMENTS);
}

export function createExtrudedOvalRingGeometry({
  innerRadius,
  outerRadius,
  centerY,
  height,
  segments = TABLE_GEOMETRY_SEGMENTS,
}: ExtrudedOvalRingOptions): BufferGeometry {
  const bottomY = centerY - height * 0.5;
  const topY = centerY + height * 0.5;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const [outerX, outerZ] = feltEllipsePoint(theta, outerRadius);
    const [innerX, innerZ] = feltEllipsePoint(theta, innerRadius);

    positions.push(
      outerX, bottomY, outerZ,
      outerX, topY, outerZ,
      innerX, bottomY, innerZ,
      innerX, topY, innerZ,
    );
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const outerBottom = i * 4;
    const outerTop = outerBottom + 1;
    const innerBottom = outerBottom + 2;
    const innerTop = outerBottom + 3;
    const nextOuterBottom = next * 4;
    const nextOuterTop = nextOuterBottom + 1;
    const nextInnerBottom = nextOuterBottom + 2;
    const nextInnerTop = nextOuterBottom + 3;

    indices.push(
      // Outer vertical face.
      outerBottom, outerTop, nextOuterTop,
      outerBottom, nextOuterTop, nextOuterBottom,
      // Inner vertical face.
      innerBottom, nextInnerBottom, nextInnerTop,
      innerBottom, nextInnerTop, innerTop,
      // Top face.
      outerTop, innerTop, nextInnerTop,
      outerTop, nextInnerTop, nextOuterTop,
      // Bottom face.
      outerBottom, nextOuterBottom, nextInnerBottom,
      outerBottom, nextInnerBottom, innerBottom,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function trimeshArgsFromGeometry(geometry: BufferGeometry): TableTrimeshArgs {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();

  if (!index) {
    throw new Error('Expected indexed table geometry for Rapier trimesh collider.');
  }

  return [
    new Float32Array(position.array),
    new Uint32Array(index.array),
  ];
}

export function createRailColliderGeometry(): BufferGeometry {
  return createExtrudedOvalRingGeometry({
    innerRadius: RAIL_INNER_WORLD,
    outerRadius: RAIL_OUTER_WORLD,
    centerY: RAIL_COLLIDER_Y,
    height: RAIL_COLLIDER_H,
  });
}

export function createWallColliderGeometry(): BufferGeometry {
  const wallMidRadius = RAIL_OUTER_WORLD + TABLE_WALL_OUTSET;
  return createExtrudedOvalRingGeometry({
    innerRadius: wallMidRadius - TABLE_WALL_THICKNESS * 0.5,
    outerRadius: wallMidRadius + TABLE_WALL_THICKNESS * 0.5,
    centerY: TABLE_WALL_Y,
    height: TABLE_WALL_H,
  });
}
