import { describe, expect, it } from 'vitest';
import { TABLE_ANCHORS } from './anchors';
import { projectToNdc } from './project';

/**
 * The framing registry: every anchor's clearance extremes must project inside
 * the fixed camera frame. Content placed at an anchor within its extents is
 * therefore in frame at every browser size. If you add scene content, either
 * use an anchor or add its extreme points to a test like this one.
 */
describe('table anchors stay in frame (fixed SEAT_VIEW camera, 16:9)', () => {
  for (const [name, anchor] of Object.entries(TABLE_ANCHORS)) {
    it(`${name}: center and extent extremes are on-screen`, () => {
      const [x, y, z] = anchor.position;
      const { x: ex, y: ey, z: ez } = anchor.extent;
      const points: [number, number, number][] = [
        [x, y, z],
        [x - ex, y, z],
        [x + ex, y, z],
        [x, y + ey, z],
        [x, y, z - ez],
        [x, y, z + ez],
      ];
      for (const point of points) {
        const ndc = projectToNdc(point);
        const label = `${name} @ [${point.join(', ')}]`;
        expect(Math.abs(ndc.x), `${label} ndc.x`).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y), `${label} ndc.y`).toBeLessThanOrEqual(1);
        expect(ndc.z, `${label} ndc.z`).toBeLessThan(1);
      }
    });
  }
});
