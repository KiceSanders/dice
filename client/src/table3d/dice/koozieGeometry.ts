import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, TorusGeometry } from 'three';
import { trimeshArgsFromGeometry, type TableTrimeshArgs } from '../tableGeometry';
import type { DicePhysicsTuning } from './tuning';

export const KOOZIE_GEOMETRY_SEGMENTS = 32;

/** Collider inset on bottom/lid radius (matches prior CylinderCollider tuning). */
export const KOOZIE_COLLIDER_RADIUS_INSET = 0.88;
export const KOOZIE_LID_COLLIDER_RADIUS_INSET = 0.86;

export type KoozieCupShape = Pick<
  DicePhysicsTuning['cup'],
  'radius' | 'height' | 'wallThickness' | 'rimInset' | 'bottomThickness' | 'lidThickness'
>;

export function koozieCirclePoint(theta: number, radius: number): [number, number] {
  return [radius * Math.cos(theta), radius * Math.sin(theta)];
}

/** Shared wall shell layout for visuals and colliders. */
export function koozieWallLayout(cup: Pick<KoozieCupShape, 'height' | 'rimInset'>) {
  const wallHeight = cup.height - cup.rimInset;
  const centerY = -cup.rimInset * 0.5;
  return { wallHeight, centerY };
}

/** Shared wall shell dimensions for visuals and colliders. */
export function koozieWallMetrics(
  cup: Pick<KoozieCupShape, 'radius' | 'height' | 'wallThickness' | 'rimInset'>,
) {
  const { wallHeight, centerY } = koozieWallLayout(cup);
  return {
    innerRadius: cup.radius - cup.wallThickness,
    outerRadius: cup.radius,
    wallHeight,
    centerY,
  };
}

interface ExtrudedRingOptions {
  innerRadius: number;
  outerRadius: number;
  centerY: number;
  height: number;
  segments?: number;
}

function createExtrudedRingGeometry({
  innerRadius,
  outerRadius,
  centerY,
  height,
  segments = KOOZIE_GEOMETRY_SEGMENTS,
}: ExtrudedRingOptions): BufferGeometry {
  const bottomY = centerY - height * 0.5;
  const topY = centerY + height * 0.5;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const [outerX, outerZ] = koozieCirclePoint(theta, outerRadius);
    const [innerX, innerZ] = koozieCirclePoint(theta, innerRadius);

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
      outerBottom, outerTop, nextOuterTop,
      outerBottom, nextOuterTop, nextOuterBottom,
      innerBottom, nextInnerBottom, nextInnerTop,
      innerBottom, nextInnerTop, innerTop,
      outerTop, innerTop, nextInnerTop,
      outerTop, nextInnerTop, nextOuterTop,
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

/** Continuous hollow cylinder wall for cup collision (open top). */
export function createKoozieWallColliderGeometry(
  cup: Pick<KoozieCupShape, 'radius' | 'height' | 'wallThickness' | 'rimInset'>,
): BufferGeometry {
  const { innerRadius, outerRadius, wallHeight, centerY } = koozieWallMetrics(cup);
  return createExtrudedRingGeometry({
    innerRadius,
    outerRadius,
    centerY,
    height: wallHeight,
  });
}

export function koozieWallTrimeshArgs(
  cup: Pick<KoozieCupShape, 'radius' | 'height' | 'wallThickness' | 'rimInset'>,
): TableTrimeshArgs {
  const geometry = createKoozieWallColliderGeometry(cup);
  const args = trimeshArgsFromGeometry(geometry);
  geometry.dispose();
  return args;
}

/** Open-top cup wall visual. */
export function createKoozieWallVisualGeometry(
  cup: Pick<KoozieCupShape, 'radius' | 'height' | 'rimInset'>,
): CylinderGeometry {
  const { wallHeight } = koozieWallLayout(cup);
  return new CylinderGeometry(cup.radius, cup.radius, wallHeight, KOOZIE_GEOMETRY_SEGMENTS, 1, false);
}

export function createKoozieRimVisualGeometry(
  cup: Pick<KoozieCupShape, 'radius' | 'rimInset'>,
): TorusGeometry {
  return new TorusGeometry(cup.radius * 0.98, 0.006, 8, KOOZIE_GEOMETRY_SEGMENTS);
}

/** Invisible pointer pick volume. */
export function createKooziePickGeometry(
  cup: Pick<KoozieCupShape, 'radius' | 'height'>,
): CylinderGeometry {
  return new CylinderGeometry(
    cup.radius * 1.12,
    cup.radius * 1.12,
    cup.height * 0.92,
    20,
  );
}

export function koozieBottomColliderY(cup: Pick<KoozieCupShape, 'height' | 'bottomThickness'>): number {
  return -cup.height * 0.5 + cup.bottomThickness * 0.5;
}

export function koozieLidColliderY(
  cup: Pick<KoozieCupShape, 'height' | 'rimInset' | 'lidThickness'>,
): number {
  return cup.height * 0.5 - cup.rimInset + cup.lidThickness * 0.5;
}
