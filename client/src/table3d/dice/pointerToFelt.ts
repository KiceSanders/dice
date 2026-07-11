import type { Camera } from 'three';
import * as THREE from 'three';
import {
  CLUSTER_WORLD_RADIUS,
  DICE_FELT_Y,
  DICE_HOVER_Y,
  DIE_SCREEN_OFFSETS,
  FELT_BOUND_X,
  FELT_BOUND_Z,
  FELT_CLAMP_MARGIN,
} from './constants';
import { KOOZIE_NEAR_DOCK_GUARD_POINT } from './diceLayout';

const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _hit = new THREE.Vector3();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DICE_FELT_Y);
const _guard = new THREE.Vector3();

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
  camera.updateMatrixWorld();
  _raycaster.setFromCamera(_ndc, camera);
  _raycaster.ray.intersectPlane(_plane, _hit);
  return _hit;
}

export function clampToFeltEllipse(
  point: THREE.Vector3,
  inset = FELT_CLAMP_MARGIN,
  extraInset = 0,
  minSemiAxis = 0.05,
): THREE.Vector3 {
  const a = Math.max(FELT_BOUND_X - inset - extraInset, minSemiAxis);
  const b = Math.max(FELT_BOUND_Z - inset - extraInset, minSemiAxis);
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
export function clampCenterForCluster(
  center: THREE.Vector3,
  maxWorldOffset = CLUSTER_WORLD_RADIUS,
): THREE.Vector3 {
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

/** Raycast cursor onto a horizontal plane without felt clamping (for floating koozie). */
export function pointerOnPlane(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
  planeY: number,
): THREE.Vector3 {
  const { ndcX, ndcY } = clientToNdc(clientX, clientY, canvas);
  const hit = raycastPlane(ndcX, ndcY, camera, planeY);
  hit.y = planeY;
  return hit;
}

/** Canvas element used for layout math (R3F v9 wraps the WebGL canvas in a div). */
export function canvasLayoutElement(canvas: HTMLCanvasElement): HTMLElement {
  return canvas.parentElement ?? canvas;
}

/** True when the click is near the cup's on-screen projection. */
export function hitCupScreen(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
  cupCenter: readonly [number, number, number],
  radiusPx: number,
): boolean {
  const _cup = new THREE.Vector3(cupCenter[0], cupCenter[1], cupCenter[2]);
  camera.updateMatrixWorld();
  _cup.project(camera);
  if (_cup.z > 1) return false;
  const rect = canvasLayoutElement(canvas).getBoundingClientRect();
  const sx = rect.left + (_cup.x * 0.5 + 0.5) * rect.width;
  const sy = rect.top + (-_cup.y * 0.5 + 0.5) * rect.height;
  return Math.hypot(clientX - sx, clientY - sy) <= radiusPx;
}

/** True when the pointer ray hits the drag plane within a world-space radius of the cup. */
export function hitCupWorld(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
  cupCenter: readonly [number, number, number],
  radiusWorld: number,
  planeY = cupCenter[1],
): boolean {
  const hit = pointerOnPlane(clientX, clientY, canvas, camera, planeY);
  return Math.hypot(hit.x - cupCenter[0], hit.z - cupCenter[2]) <= radiusWorld;
}

/**
 * True when the pointer is below the near-rail kept-die bottoms' screen
 * projection — the only band where grabs of the docked cup (display seat 0)
 * are honored. Clicks at or above the guard belong to kept dice, including
 * unkeep (see KOOZIE_NEAR_DOCK_GUARD_POINT). Projected through the live
 * camera per call, so it holds at any canvas size or aspect.
 */
export function pointerBelowNearDockGuard(
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
): boolean {
  _guard.set(...KOOZIE_NEAR_DOCK_GUARD_POINT);
  camera.updateMatrixWorld();
  _guard.project(camera);
  const rect = canvasLayoutElement(canvas).getBoundingClientRect();
  const guardScreenY = rect.top + (-_guard.y * 0.5 + 0.5) * rect.height;
  return clientY > guardScreenY; // screen y grows downward
}

/** Screen- or world-space cup pickup test (whichever is easier to hit). */
export function hitCup(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
  cupCenter: readonly [number, number, number],
  radiusPx: number,
  radiusWorld: number,
): boolean {
  return (
    hitCupScreen(clientX, clientY, canvas, camera, cupCenter, radiusPx) ||
    hitCupWorld(clientX, clientY, canvas, camera, cupCenter, radiusWorld)
  );
}
