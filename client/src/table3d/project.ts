import * as THREE from 'three';
import { SEAT_VIEW } from './layout';

const _vec = new THREE.Vector3();
const _cam = new THREE.PerspectiveCamera();

/** Project a world point to % coordinates inside a viewport rect. */
export function projectToViewport(
  x: number,
  y: number,
  z: number,
  aspect: number,
): { leftPct: number; topPct: number } {
  _cam.fov = SEAT_VIEW.fov;
  _cam.aspect = aspect;
  _cam.near = 0.1;
  _cam.far = 30;
  _cam.position.set(...SEAT_VIEW.position);
  _cam.lookAt(...SEAT_VIEW.target);
  _cam.updateProjectionMatrix();
  _cam.updateMatrixWorld();

  _vec.set(x, y, z);
  _vec.project(_cam);
  return {
    leftPct: (_vec.x * 0.5 + 0.5) * 100,
    topPct: (-_vec.y * 0.5 + 0.5) * 100,
  };
}

/** Pot / round label — center of the felt in viewport space. */
export function projectTableCenter(aspect: number): { leftPct: number; topPct: number } {
  return projectToViewport(0, 0.04, 0, aspect);
}
