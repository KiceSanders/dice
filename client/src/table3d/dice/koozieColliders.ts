import { KOOZIE } from './constants';

export type WallSegment = {
  position: [number, number, number];
  rotation: [number, number, number];
  halfExtents: [number, number, number];
};

/** Radial wall cuboids forming a hollow cylinder shell (open top). */
export function koozieWallSegments(): WallSegment[] {
  const { radius, height, wallThickness, wallSegments, rimInset } = KOOZIE;
  const innerR = radius - wallThickness * 0.5;
  const wallHalfH = (height - rimInset) * 0.5;
  const wallCenterY = -rimInset * 0.5;
  const arcLen = (2 * Math.PI * innerR) / wallSegments;
  const segments: WallSegment[] = [];

  for (let i = 0; i < wallSegments; i++) {
    const angle = (i / wallSegments) * Math.PI * 2;
    const x = Math.cos(angle) * innerR;
    const z = Math.sin(angle) * innerR;
    segments.push({
      position: [x, wallCenterY, z],
      rotation: [0, -angle + Math.PI / 2, 0],
      halfExtents: [wallThickness * 0.5, wallHalfH, arcLen * 0.5 * KOOZIE.wallArcOverlap],
    });
  }
  return segments;
}

function pseudoRandom(index: number, salt: number): number {
  return (((index + 1) * 7919 + salt * 104729) % 1000) / 1000;
}

/** Stable local-space spawn pose for a die inside the cup interior. */
export function spawnDiceInCupLocal(
  index: number,
  total: number,
): { position: [number, number, number]; rotation: [number, number, number] } {
  const { height, radius, bottomThickness, rimInset } = KOOZIE;
  const innerR = radius - KOOZIE.wallThickness - 0.02;
  const yMin = -height * 0.5 + bottomThickness + 0.06;
  const yMax = height * 0.5 - rimInset - 0.06;
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 + pseudoRandom(index, 1) * 0.6;
  const r = innerR * (0.35 + pseudoRandom(index, 2) * 0.45);
  const y = yMin + (yMax - yMin) * pseudoRandom(index, 3);
  return {
    position: [Math.cos(angle) * r, y, Math.sin(angle) * r],
    rotation: [
      pseudoRandom(index, 4) * Math.PI * 2,
      pseudoRandom(index, 5) * Math.PI * 2,
      pseudoRandom(index, 6) * Math.PI * 2,
    ],
  };
}

/** Cup-local Y of the open rim (top). */
export function cupRimLocalY(): number {
  return KOOZIE.height * 0.5 - KOOZIE.rimInset;
}
