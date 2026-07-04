import { describe, expect, it } from 'vitest';
import type { BodyPose, PoseFrame } from '@dice/shared';
import { poseFrameFromCanonical, poseFrameToCanonical, rotateBodyPoseY } from './seatTransform';
import { displaySeatIndex, seatAngle, TABLE_SEAT_COUNT, viewRotationY } from './layout';

const frame = (x: number, z: number): PoseFrame => ({
  t: 0,
  bodies: [[x, 1, z, 0, 0, 0, 1]],
  cupVisible: true,
});

describe('layout seat helpers', () => {
  it('displaySeatIndex rotates so my seat is 0', () => {
    expect(displaySeatIndex(1, 1)).toBe(0);
    expect(displaySeatIndex(2, 1)).toBe(1);
    expect(displaySeatIndex(0, 1)).toBe(2);
  });

  it('viewRotationY maps each seat direction to bottom (+Z)', () => {
    for (let seat = 0; seat < TABLE_SEAT_COUNT; seat++) {
      const dir = seatAngle(seat, TABLE_SEAT_COUNT);
      const rotated = rotateBodyPoseY(
        [Math.cos(dir), 0, Math.sin(dir), 0, 0, 0, 1] as BodyPose,
        viewRotationY(seat),
      );
      expect(rotated[0]).toBeCloseTo(0, 2);
      expect(rotated[2]).toBeCloseTo(1, 2);
    }
  });

  it('seatAngle spaces three seats 120° apart', () => {
    const a0 = seatAngle(0, 3);
    const a1 = seatAngle(1, 3);
    const a2 = seatAngle(2, 3);
    expect(a1 - a0).toBeCloseTo((2 * Math.PI) / 3, 5);
    expect(a2 - a1).toBeCloseTo((2 * Math.PI) / 3, 5);
  });
});

describe('seatTransform', () => {
  it('round-trips canonical ↔ view for each seat', () => {
    const original = frame(0.5, -1.2);
    for (let seat = 0; seat < TABLE_SEAT_COUNT; seat++) {
      const view = poseFrameFromCanonical(original, seat);
      const back = poseFrameToCanonical(view, seat);
      expect(back.bodies[0]![0]).toBeCloseTo(original.bodies[0]![0]!, 3);
      expect(back.bodies[0]![2]).toBeCloseTo(original.bodies[0]![2]!, 3);
    }
  });

  it('rotates between seats by the seat angle delta', () => {
    const canonical = frame(0, 2.5);
    const seat1View = poseFrameFromCanonical(canonical, 1);
    const seat0View = poseFrameFromCanonical(canonical, 0);
    const delta = viewRotationY(1) - viewRotationY(0);
    const rotated = rotateBodyPoseY(seat0View.bodies[0]!, delta);
    expect(rotated[0]).toBeCloseTo(seat1View.bodies[0]![0]!, 2);
    expect(rotated[2]).toBeCloseTo(seat1View.bodies[0]![2]!, 2);
  });
});
