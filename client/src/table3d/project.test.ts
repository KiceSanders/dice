import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEAT_VIEW } from './layout';
import { FRAME_ASPECT, frameViewOffset, projectToNdc } from './project';

describe('frameViewOffset (top-band canvas bleed)', () => {
  it('returns null when the canvas is exactly 16:9 (no bleed)', () => {
    expect(frameViewOffset(1600, 900)).toBeNull();
  });

  it('returns null when the canvas is shorter than 16:9', () => {
    expect(frameViewOffset(1600, 880)).toBeNull();
  });

  it('anchors the virtual 16:9 frame to the canvas bottom and bleeds upward', () => {
    const width = 1600;
    const bleed = 76; // --table-top-band-h @ 16px root
    const frameHeight = width / FRAME_ASPECT;
    const view = frameViewOffset(width, frameHeight + bleed);
    expect(view).not.toBeNull();
    expect(view?.fullWidth).toBe(width);
    expect(view?.fullHeight).toBeCloseTo(frameHeight, 6);
    expect(view?.x).toBe(0);
    // Negative y: the shown region starts `bleed` px ABOVE the virtual frame.
    expect(view?.y).toBeCloseTo(-bleed, 6);
  });

  it('keeps world points at their 16:9 screen position, shifted down by the bleed', () => {
    const width = 1600;
    const bleed = 76;
    const frameHeight = width / FRAME_ASPECT;
    const canvasHeight = frameHeight + bleed;
    const view = frameViewOffset(width, canvasHeight);
    if (!view) throw new Error('expected a view offset');

    const cam = new THREE.PerspectiveCamera(SEAT_VIEW.fov, FRAME_ASPECT, 0.1, 30);
    cam.position.set(...SEAT_VIEW.position);
    cam.lookAt(...SEAT_VIEW.target);
    cam.setViewOffset(view.fullWidth, view.fullHeight, view.x, view.y, width, canvasHeight);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // Any framed world point must land at the same pixel it had in the plain
    // 16:9 camera, offset down by the bleed strip — i.e. the virtual frame is
    // exactly the viewport element under the extended canvas.
    const points: ReadonlyArray<readonly [number, number, number]> = [
      [0, 0.04, 0], // felt center
      [0, 0.04, 1.05], // camera target on the near felt
      [0.8, 0.4, -0.9], // arbitrary framed point above the far felt
    ];
    for (const p of points) {
      const plain = projectToNdc(p);
      const v = new THREE.Vector3(...p).project(cam);
      const plainPxY = ((1 - plain.y) / 2) * frameHeight;
      const offsetPxY = ((1 - v.y) / 2) * canvasHeight;
      expect(offsetPxY).toBeCloseTo(bleed + plainPxY, 4);
      const plainPxX = ((plain.x + 1) / 2) * width;
      const offsetPxX = ((v.x + 1) / 2) * width;
      expect(offsetPxX).toBeCloseTo(plainPxX, 4);
    }
  });
});
