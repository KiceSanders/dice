import type * as THREE from 'three';
import type { Camera } from 'three';
import {
  canvasLayoutElement,
  clampToFeltEllipse,
  hitCup,
  pointerBelowNearDockGuard,
  pointerOnPlane,
} from './pointerToFelt';
import type { DicePhysicsTuning } from './tuning';
import type { ThrowVelocity } from './types';

export type MoveSample = { x: number; y: number; z: number; t: number };

/** Canvas wrapper used for cursor styling (R3F v9 nests the WebGL canvas). */
export function pointerTarget(canvas: HTMLCanvasElement): HTMLElement {
  return canvasLayoutElement(canvas);
}

export function clampPivotToTable(point: THREE.Vector3, tuning: DicePhysicsTuning): THREE.Vector3 {
  const margin = tuning.cup.radius + 0.16;
  return clampToFeltEllipse(point, margin, 0, 0.1);
}

export function sampleVelocity(samples: MoveSample[]): ThrowVelocity {
  if (samples.length < 2) return { x: 0, y: 0, z: 0 };
  const now = samples[samples.length - 1]!;
  const windowMs = 120;
  let oldest = samples[0]!;
  for (const s of samples) {
    if (now.t - s.t <= windowMs) {
      oldest = s;
      break;
    }
  }
  const dt = Math.max((now.t - oldest.t) / 1000, 0.016);
  return {
    x: (now.x - oldest.x) / dt,
    y: (now.y - oldest.y) / dt,
    z: (now.z - oldest.z) / dt,
  };
}

export function blendReleaseVelocity(
  samples: MoveSample[],
  heldVelocity: THREE.Vector3 | undefined,
  tuning: DicePhysicsTuning,
): ThrowVelocity {
  const sampled = sampleVelocity(samples);
  const blend = tuning.release.velocityBlend;
  return {
    x: sampled.x + (heldVelocity?.x ?? 0) * blend,
    y: sampled.y + (heldVelocity?.y ?? 0) * blend,
    z: sampled.z + (heldVelocity?.z ?? 0) * blend,
  };
}

/** Record a pivot sample on the float plane, clamped to the table ellipse. */
export function recordPivotSample(
  samples: MoveSample[],
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
  tuning: DicePhysicsTuning,
  now = performance.now(),
): MoveSample[] {
  const center = pointerOnPlane(clientX, clientY, canvas, camera, tuning.cup.floatCenterY);
  clampPivotToTable(center, tuning);
  samples.push({ x: center.x, y: center.y, z: center.z, t: now });
  if (samples.length > 24) samples.shift();
  return samples;
}

export { canvasLayoutElement, hitCup, pointerBelowNearDockGuard, pointerOnPlane };
