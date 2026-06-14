import * as THREE from 'three';
import type { Camera } from 'three';
import {
  CLUSTER_WORLD_RADIUS,
  DIE_SCREEN_OFFSETS,
  DICE_FELT_Y,
  DICE_HOVER_Y,
  FELT_BOUND_X,
  FELT_BOUND_Z,
  FELT_CLAMP_MARGIN,
} from './constants';

const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _hit = new THREE.Vector3();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DICE_FELT_Y);

/** @deprecated Use DICE_FELT_Y */
export const DICE_PLANE_Y = DICE_FELT_Y;

function clientToNdc(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): { ndcX: number; ndcY: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    ndcX: ((clientX - rect.left) / rect.width) * 2 - 1,
    ndcY: -(((clientY - rect.top) / rect.height) * 2 - 1),
  };
}

function raycastPlane(ndcX: number, ndcY: number, camera: Camera, planeY: number): THREE.Vector3 {
  _plane.constant = -planeY;
  _ndc.set(ndcX, ndcY);
  _raycaster.setFromCamera(_ndc, camera);
  _raycaster.ray.intersectPlane(_plane, _hit);
  return _hit;
}

function clampToFeltEllipse(
  point: THREE.Vector3,
  inset = FELT_CLAMP_MARGIN,
  extraInset = 0,
): THREE.Vector3 {
  const a = Math.max(FELT_BOUND_X - inset - extraInset, 0.05);
  const b = Math.max(FELT_BOUND_Z - inset - extraInset, 0.05);
  const nx = point.x / a;
  const nz = point.z / b;
  const dist = Math.hypot(nx, nz);
  if (dist > 1) {
    point.x = (nx / dist) * a;
    point.z = (nz / dist) * b;
  }
  return point;
}

function clampToFelt(point: THREE.Vector3): THREE.Vector3 {
  return clampToFeltEllipse(point);
}

/** Clamp cluster center so sibling screen-offset dice stay on the felt. */
export function clampCenterForCluster(center: THREE.Vector3, maxWorldOffset = CLUSTER_WORLD_RADIUS): THREE.Vector3 {
  return clampToFeltEllipse(center, FELT_CLAMP_MARGIN, maxWorldOffset);
}

/**
 * Map cursor + per-die screen offset to a world position on a horizontal plane.
 * Each die raycasts independently so the cluster stays fixed in screen space.
 */
export function pointerDiePosition(
  clientX: number,
  clientY: number,
  dieIndex: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
  planeY = DICE_HOVER_Y,
): THREE.Vector3 {
  const [offsetX, offsetY] = DIE_SCREEN_OFFSETS[dieIndex] ?? [0, 0];
  const { ndcX, ndcY } = clientToNdc(clientX + offsetX, clientY + offsetY, canvas);
  const hit = raycastPlane(ndcX, ndcY, camera, planeY);
  hit.y = planeY;
  return clampToFelt(hit);
}

/** Center die under the cursor — used for velocity sampling and cluster clamp. */
export function pointerCenterPosition(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
  planeY = DICE_HOVER_Y,
): THREE.Vector3 {
  const { ndcX, ndcY } = clientToNdc(clientX, clientY, canvas);
  const hit = raycastPlane(ndcX, ndcY, camera, planeY);
  hit.y = planeY;
  return clampCenterForCluster(clampToFelt(hit));
}

/** @deprecated Use pointerCenterPosition or pointerDiePosition. */
export function pointerToFelt(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
): THREE.Vector3 {
  return pointerCenterPosition(clientX, clientY, canvas, camera, DICE_FELT_Y).clone();
}
