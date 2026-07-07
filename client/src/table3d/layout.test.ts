import { describe, expect, it } from 'vitest';
import {
  FELT_SCALE,
  type OverlayRect,
  seatOverlayPosition,
  seatStripOrder,
  TABLE_SEAT_COUNT,
} from './layout';

describe('table symmetry', () => {
  it('felt scale is isotropic — seat-angle pose rotation requires a circular table', () => {
    // Streamed poses are localized by rotating around Y (seatTransform.ts);
    // an anisotropic oval does not map onto itself under that rotation, so
    // other players' dice would land on or past the rail.
    expect(FELT_SCALE.x).toBe(FELT_SCALE.z);
  });
});

function centeredRects(frameW: number, frameH: number, viewW: number, viewH: number) {
  const frame: OverlayRect = { left: 0, top: 0, width: frameW, height: frameH };
  const viewport: OverlayRect = {
    left: (frameW - viewW) / 2,
    top: (frameH - viewH) / 2,
    width: viewW,
    height: viewH,
  };
  return { frame, viewport };
}

describe('seatOverlayPosition', () => {
  // Wide desktop and near-stack-breakpoint frame/viewport pairs — the overlay
  // math is measurement-driven and must hold at any size the fluid gutters allow.
  const layouts = [
    { label: 'wide', ...centeredRects(1360, 766, 1120, 630) },
    { label: 'narrow', ...centeredRects(604, 399, 468, 263) },
  ];

  for (const { label, frame, viewport } of layouts) {
    it(`keeps all seats inside the frame, local seat bottom-center (${label})`, () => {
      const seats = Array.from({ length: TABLE_SEAT_COUNT }, (_, slot) =>
        seatOverlayPosition(slot, TABLE_SEAT_COUNT, frame, viewport),
      );
      for (const seat of seats) {
        expect(seat.leftPct).toBeGreaterThanOrEqual(0);
        expect(seat.leftPct).toBeLessThanOrEqual(100);
        expect(seat.topPct).toBeGreaterThanOrEqual(0);
        expect(seat.topPct).toBeLessThanOrEqual(100);
      }
      // Display slot 0 is the local player: bottom center.
      expect(seats[0]!.leftPct).toBeCloseTo(50, 5);
      expect(seats[0]!.topPct).toBeGreaterThan(50);
      // Remote seats mirror each other above the center line.
      expect(seats[1]!.leftPct + seats[2]!.leftPct).toBeCloseTo(100, 5);
      expect(seats[1]!.topPct).toBeCloseTo(seats[2]!.topPct, 5);
      expect(seats[1]!.topPct).toBeLessThan(50);
    });
  }
});

describe('seatStripOrder', () => {
  it('puts the local player last, remote seats in display order', () => {
    expect(seatStripOrder(0)).toEqual([1, 2, 0]);
    expect(seatStripOrder(1)).toEqual([2, 0, 1]);
    expect(seatStripOrder(2)).toEqual([0, 1, 2]);
  });
});
