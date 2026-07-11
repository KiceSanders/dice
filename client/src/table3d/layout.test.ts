import { describe, expect, it } from 'vitest';
import {
  FELT_SCALE,
  type OverlayRect,
  SEAT_ARC_SPAN,
  SEAT_ARC_START,
  seatAnchorOffset,
  seatAngle,
  seatCardRect,
  seatOverlayPosition,
  seatStripOrder,
  TABLE_SEAT_COUNT,
  topBandRect,
} from './layout';

/** Normalize an angle to [0, 2π). */
function wrap(angle: number): number {
  const tau = Math.PI * 2;
  return ((angle % tau) + tau) % tau;
}

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

describe('seatAngle — reserved-arc distribution', () => {
  it('matches the historical 3-seat layout exactly (6, 10, and 2 o’clock)', () => {
    // The shipping table must not move: bottom, upper-left, upper-right.
    expect(seatAngle(0, 3)).toBeCloseTo(Math.PI / 2, 10);
    expect(seatAngle(1, 3)).toBeCloseTo((7 * Math.PI) / 6, 10);
    expect(seatAngle(2, 3)).toBeCloseTo(-Math.PI / 6, 10);
  });

  it('keeps every seat on the 2→10 o’clock arc at any seat count', () => {
    // The top arc (10→2 o'clock) is reserved for the game-state band.
    for (let n = 2; n <= 10; n++) {
      for (let slot = 0; slot < n; slot++) {
        const onArc = wrap(seatAngle(slot, n) - SEAT_ARC_START);
        expect(onArc, `seat ${slot}/${n}`).toBeLessThanOrEqual(SEAT_ARC_SPAN + 1e-9);
      }
    }
  });

  it('puts the local player (display slot 0) nearest the bottom', () => {
    for (let n = 2; n <= 10; n++) {
      const step = SEAT_ARC_SPAN / (n - 1);
      const offBottom = Math.abs(wrap(seatAngle(0, n) - Math.PI / 2 + Math.PI) - Math.PI);
      expect(offBottom, `count ${n}`).toBeLessThanOrEqual(step / 2 + 1e-9);
    }
  });
});

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

describe('seatAnchorOffset', () => {
  it('pins bottom / top / side seats toward the table center', () => {
    expect(seatAnchorOffset(Math.PI / 2)).toEqual({ tx: -0.5, ty: 0 }); // bottom
    expect(seatAnchorOffset(-Math.PI / 2)).toEqual({ tx: -0.5, ty: -1 }); // top
    expect(seatAnchorOffset(0)).toEqual({ tx: 0, ty: -0.5 }); // right
    expect(seatAnchorOffset(Math.PI)).toEqual({ tx: -1, ty: -0.5 }); // left
  });
});

describe('seatCardRect', () => {
  it('produces an in-frame rect whose top edge is above center for remote seats', () => {
    const { frame, viewport } = centeredRects(1360, 766, 1120, 630);
    const bottom = seatCardRect(0, TABLE_SEAT_COUNT, frame, viewport);
    const left = seatCardRect(1, TABLE_SEAT_COUNT, frame, viewport);
    const right = seatCardRect(2, TABLE_SEAT_COUNT, frame, viewport);
    expect(bottom.top + bottom.height).toBeGreaterThan(50);
    expect(left.top).toBeLessThan(50);
    expect(right.top).toBeLessThan(50);
    expect(left.left).toBeLessThan(right.left);
  });
});

type Rect = { left: number; top: number; width: number; height: number };

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

describe('top game-state band', () => {
  // The reserved-arc invariant: the centered top band never touches a seat
  // card, at any seat count the arc formula supports, at any frame size the
  // fluid gutters allow. Game-state widgets inside the band are normal flow,
  // so band-clear ⇒ widget-clear.
  const layouts = [
    { label: 'wide', ...centeredRects(1360, 766, 1120, 630) },
    { label: 'narrow', ...centeredRects(604, 399, 468, 263) },
  ];

  for (const { label, frame, viewport } of layouts) {
    it(`clears every seat card at every seat count (${label})`, () => {
      const band = topBandRect(frame);
      for (let n = 2; n <= 10; n++) {
        for (let slot = 0; slot < n; slot++) {
          const card = seatCardRect(slot, n, frame, viewport);
          expect(rectsOverlap(band, card), `seat ${slot}/${n} (${label})`).toBe(false);
        }
      }
    });
  }
});
