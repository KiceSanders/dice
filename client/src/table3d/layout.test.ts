import { describe, expect, it } from 'vitest';
import {
  FELT_SCALE,
  type OverlayRect,
  SEAT_ARC_SPAN,
  SEAT_ARC_START,
  seatAnchorOffset,
  seatAngle,
  seatCardRect,
  seatDisplayPlacement,
  seatDisplayPlacements,
  seatOverlayPosition,
  seatStripOrder,
  TABLE_SEAT_COUNT,
  topBandLaneRects,
  topBandRect,
  visibleSeatIndices,
} from './layout';

/** Normalize an angle to [0, 2π). */
function wrap(angle: number): number {
  const tau = Math.PI * 2;
  return ((angle % tau) + tau) % tau;
}

describe('table symmetry', () => {
  it('felt scale is isotropic — seat-angle pose rotation requires a circular table', () => {
    // Canonical poses rotate to occupied-card display angles (seatTransform.ts);
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

  it('keeps a two-player table broadly spaced at 6 and 10 o’clock', () => {
    expect(seatAngle(0, 2)).toBeCloseTo(Math.PI / 2, 10);
    expect(seatAngle(1, 2)).toBeCloseTo((7 * Math.PI) / 6, 10);
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

  it('pins the local player (display slot 0) exactly at 6 o’clock', () => {
    for (let n = 1; n <= TABLE_SEAT_COUNT; n++) {
      expect(seatAngle(0, n), `count ${n}`).toBeCloseTo(Math.PI / 2, 10);
    }
  });

  it('places remote seats clockwise in throwing order around the lower arc', () => {
    for (let n = 2; n <= TABLE_SEAT_COUNT; n++) {
      const leftCount = Math.ceil((n - 1) / 2);
      const left = Array.from({ length: leftCount }, (_, i) => seatAngle(i + 1, n));
      expect(left[0], `first remote/${n}`).toBeGreaterThan(Math.PI / 2);
      expect(left.at(-1), `left endpoint/${n}`).toBeCloseTo(SEAT_ARC_START + SEAT_ARC_SPAN, 10);
      for (let i = 1; i < left.length; i++) expect(left[i]!).toBeGreaterThan(left[i - 1]!);

      const right = Array.from({ length: n - 1 - leftCount }, (_, i) =>
        seatAngle(leftCount + i + 1, n),
      );
      if (right.length > 0) expect(right[0], `right endpoint/${n}`).toBeCloseTo(SEAT_ARC_START, 10);
      for (let i = 1; i < right.length; i++) expect(right[i]!).toBeGreaterThan(right[i - 1]!);
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
      // Display slot 0 is the local player at exact bottom-center.
      expect(seats[0]!.leftPct).toBeCloseTo(50, 5);
      expect(seats[0]!.topPct).toBeGreaterThan(50);
      expect(seats[0]!.topPct).toBeCloseTo(Math.max(...seats.map((seat) => seat.topPct)), 5);
    });
  }
});

describe('phase-aware seat display', () => {
  it('shows all eight logical slots in the lobby and occupied slots only during play', () => {
    expect(visibleSeatIndices('lobby', [1, 6])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(visibleSeatIndices('playing', [6, 1])).toEqual([1, 6]);
    expect(visibleSeatIndices('roundEnd', [6, 1, 4])).toEqual([1, 4, 6]);
  });

  it('rotates occupied logical seats so the local player gets display slot 0', () => {
    expect(seatDisplayPlacements([0, 3, 7], 3).map((placement) => placement.seatIndex)).toEqual([
      3, 7, 0,
    ]);
    expect(seatDisplayPlacements([0, 3, 7], null).map((placement) => placement.seatIndex)).toEqual([
      0, 3, 7,
    ]);
  });

  it('provides the slot, count, and angle for every player-relative visual', () => {
    expect(seatDisplayPlacement([0, 1], 0, 1)).toEqual({
      seatIndex: 1,
      displaySlot: 1,
      displayCount: 2,
      angle: seatAngle(1, 2),
    });
    expect(seatDisplayPlacement([0, 1], 1, 0)?.angle).toBeCloseTo(seatAngle(1, 2), 10);
    expect(seatDisplayPlacement([0, 3, 7], 3, 7)?.angle).toBeCloseTo(seatAngle(1, 3), 10);
    expect(seatDisplayPlacement([0, 3, 7], 3, 5)).toBeNull();
  });

  it('puts the local player last, remote seats in display order', () => {
    expect(seatStripOrder([0, 3, 7], 0)).toEqual([3, 7, 0]);
    expect(seatStripOrder([0, 3, 7], 3)).toEqual([7, 0, 3]);
    expect(seatStripOrder([0, 3, 7], null)).toEqual([0, 3, 7]);
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
    const bottom = seatCardRect(0, 3, frame, viewport);
    const left = seatCardRect(1, 3, frame, viewport);
    const right = seatCardRect(2, 3, frame, viewport);
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

describe('occupied seat-card spacing', () => {
  const layouts = [
    { label: 'wide', ...centeredRects(1360, 766, 1120, 630), size: { width: 118, height: 62 } },
    { label: 'compact', ...centeredRects(820, 520, 672, 378), size: { width: 92, height: 62 } },
  ];

  for (const { label, frame, viewport, size } of layouts) {
    it(`keeps up to eight occupied cards from overlapping (${label})`, () => {
      for (let count = 1; count <= TABLE_SEAT_COUNT; count++) {
        const cards = Array.from({ length: count }, (_, slot) =>
          seatCardRect(slot, count, frame, viewport, size),
        );
        for (let a = 0; a < cards.length; a++) {
          for (let b = a + 1; b < cards.length; b++) {
            expect(rectsOverlap(cards[a]!, cards[b]!), `cards ${a}/${b}, count ${count}`).toBe(
              false,
            );
          }
        }
      }
    });
  }
});

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
      for (let n = 1; n <= TABLE_SEAT_COUNT; n++) {
        for (let slot = 0; slot < n; slot++) {
          const card = seatCardRect(slot, n, frame, viewport);
          expect(rectsOverlap(band, card), `seat ${slot}/${n} (${label})`).toBe(false);
        }
      }
    });

    it(`keeps pot, roll-to-beat, and classic pot lanes ordered inside the band (${label})`, () => {
      const band = topBandRect(frame);
      const lanes = topBandLaneRects(frame);
      expect(lanes.pot.left).toBeGreaterThanOrEqual(band.left);
      expect(lanes.pot.left + lanes.pot.width).toBeLessThan(lanes.roll.left);
      expect(lanes.roll.left + lanes.roll.width).toBeLessThan(lanes.classic.left);
      expect(lanes.classic.left + lanes.classic.width).toBeLessThanOrEqual(
        band.left + band.width + 1e-9,
      );
      expect(lanes.pot.height).toBe(band.height);
      expect(lanes.roll.height).toBe(band.height);
      expect(lanes.classic.height).toBe(band.height);
    });
  }
});
