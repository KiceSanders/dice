import * as THREE from 'three';
import { SEAT_VIEW } from './layout';

/** The viewport's fixed aspect ratio (index.css pins `.table-3d-viewport` to 16:9). */
export const FRAME_ASPECT = 16 / 9;

const _vec = new THREE.Vector3();
const _cam = new THREE.PerspectiveCamera();

/**
 * Project a world point through the fixed seat camera → NDC. On-screen means
 * |x| ≤ 1, |y| ≤ 1, z < 1. This is THE helper for framing checks — anything
 * placed in the 3D scene should have its extreme points asserted on-screen
 * with it (see anchors.test.ts and docs/TABLE_UI.md).
 */
export function projectToNdc(
  point: readonly [number, number, number],
  aspect: number = FRAME_ASPECT,
): { x: number; y: number; z: number } {
  _cam.fov = SEAT_VIEW.fov;
  _cam.aspect = aspect;
  _cam.near = 0.1;
  _cam.far = 30;
  _cam.position.set(...SEAT_VIEW.position);
  _cam.lookAt(...SEAT_VIEW.target);
  _cam.updateProjectionMatrix();
  _cam.updateMatrixWorld();

  _vec.set(point[0], point[1], point[2]);
  _vec.project(_cam);
  return { x: _vec.x, y: _vec.y, z: _vec.z };
}

/** Project a world point to % coordinates inside a viewport rect. */
export function projectToViewport(
  x: number,
  y: number,
  z: number,
  aspect: number,
): { leftPct: number; topPct: number } {
  const ndc = projectToNdc([x, y, z], aspect);
  return {
    leftPct: (ndc.x * 0.5 + 0.5) * 100,
    topPct: (-ndc.y * 0.5 + 0.5) * 100,
  };
}

/** Pot / round label — center of the felt in viewport space. */
export function projectTableCenter(aspect: number): { leftPct: number; topPct: number } {
  return projectToViewport(0, 0.04, 0, aspect);
}
