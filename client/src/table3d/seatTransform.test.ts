import type { BodyPose, PoseFrame } from '@dice/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { displaySeatIndex, seatRingAngle, TABLE_SEAT_COUNT } from './layout';
import { poseFrameFromCanonical, poseFrameToCanonical, rotateBodyPoseY } from './seatTransform';

const frame = (x: number, z: number): PoseFrame => ({
  t: 0,
  bodies: [[x, 1, z, 0, 0, 0, 1]],
  cupVisible: true,
});

describe('layout seat helpers', () => {
  it('displaySeatIndex rotates so my seat is 0', () => {
    expect(displaySeatIndex(1, 1)).toBe(0);
    expect(displaySeatIndex(2, 1)).toBe(1);
    expect(displaySeatIndex(0, 1)).toBe(TABLE_SEAT_COUNT - 1);
  });

  it('seatRingAngle spaces all eight logical seats uniformly around the pose ring', () => {
    const tau = Math.PI * 2;
    const wrap = (a: number) => ((a % tau) + tau) % tau;
    for (let seat = 0; seat < TABLE_SEAT_COUNT; seat++) {
      const next = (seat + 1) % TABLE_SEAT_COUNT;
      expect(wrap(seatRingAngle(next) - seatRingAngle(seat))).toBeCloseTo(
        (2 * Math.PI) / TABLE_SEAT_COUNT,
        5,
      );
    }
  });
});

describe('rotateBodyPoseY', () => {
  // Pin the sign convention to three.js itself: positions must rotate exactly
  // like Matrix4.makeRotationY, orientations like the matching quaternion.
  // A previous bug rotated positions and quaternions in opposite directions.
  it('matches THREE.Matrix4.makeRotationY for positions and quaternions', () => {
    const angles = [0.3, -1.1, (2 * Math.PI) / 3, Math.PI / 2];
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.9, -0.2));
    const pose: BodyPose = [0.7, 0.5, -1.3, q0.x, q0.y, q0.z, q0.w];

    for (const angle of angles) {
      const rotated = rotateBodyPoseY(pose, angle);

      const expectedPos = new THREE.Vector3(pose[0], pose[1], pose[2]).applyMatrix4(
        new THREE.Matrix4().makeRotationY(angle),
      );
      expect(rotated[0]).toBeCloseTo(expectedPos.x, 6);
      expect(rotated[1]).toBeCloseTo(expectedPos.y, 6);
      expect(rotated[2]).toBeCloseTo(expectedPos.z, 6);

      const expectedQuat = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle)
        .multiply(q0);
      expect(rotated[3]).toBeCloseTo(expectedQuat.x, 6);
      expect(rotated[4]).toBeCloseTo(expectedQuat.y, 6);
      expect(rotated[5]).toBeCloseTo(expectedQuat.z, 6);
      expect(rotated[6]).toBeCloseTo(expectedQuat.w, 6);
    }
  });

  it('rotates a facing direction together with the position', () => {
    // A die "facing the table center" must still face the center after rotation.
    const pose: BodyPose = [0, 0, 2, 0, 0, 0, 1];
    const angle = (2 * Math.PI) / 3;
    const rotated = rotateBodyPoseY(pose, angle);

    const toCenterBefore = new THREE.Vector3(0, 0, -1);
    const localDir = toCenterBefore
      .clone()
      .applyQuaternion(new THREE.Quaternion(pose[3], pose[4], pose[5], pose[6]).invert());
    const dirAfter = localDir.applyQuaternion(
      new THREE.Quaternion(rotated[3], rotated[4], rotated[5], rotated[6]),
    );
    const toCenterAfter = new THREE.Vector3(-rotated[0], 0, -rotated[2]).normalize();
    expect(dirAfter.dot(toCenterAfter)).toBeCloseTo(1, 5);
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

  it('canonicalizes each roller’s bottom-of-screen pose to their physical seat', () => {
    // A die the roller leaves at the near edge of THEIR screen must land, in
    // canonical space, in front of their actual seat around the table.
    for (let seat = 0; seat < TABLE_SEAT_COUNT; seat++) {
      const r = 1.8;
      const canonical = poseFrameToCanonical(frame(0, r), seat);
      const dir = seatRingAngle(seat);
      expect(canonical.bodies[0]![0]).toBeCloseTo(r * Math.cos(dir), 3);
      expect(canonical.bodies[0]![2]).toBeCloseTo(r * Math.sin(dir), 3);
    }
  });

  it('shows a roller’s dice at their seat position on every viewer’s screen', () => {
    // End-to-end wire path: roller S canonicalizes, viewer V localizes. The
    // result must sit at the same display slot the 2D seat overlay uses for S.
    const r = 1.8;
    for (let rollerSeat = 0; rollerSeat < TABLE_SEAT_COUNT; rollerSeat++) {
      const canonical = poseFrameToCanonical(frame(0, r), rollerSeat);
      for (let viewerSeat = 0; viewerSeat < TABLE_SEAT_COUNT; viewerSeat++) {
        const view = poseFrameFromCanonical(canonical, viewerSeat);
        const displayAngle = seatRingAngle(displaySeatIndex(rollerSeat, viewerSeat));
        expect(view.bodies[0]![0]).toBeCloseTo(r * Math.cos(displayAngle), 3);
        expect(view.bodies[0]![2]).toBeCloseTo(r * Math.sin(displayAngle), 3);
      }
    }
  });
});
