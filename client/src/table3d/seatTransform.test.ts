import type { BodyPose, PoseFrame } from '@dice/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { koozieRestPositionAtAngle } from './dice/diceLayout';
import {
  seatDisplayPlacement,
  seatDisplayPlacements,
  seatRingAngle,
  TABLE_SEAT_COUNT,
} from './layout';
import { poseFrameForSeatDisplay, poseFrameToCanonical, rotateBodyPoseY } from './seatTransform';

const frame = (x: number, z: number): PoseFrame => ({
  t: 0,
  bodies: [[x, 1, z, 0, 0, 0, 1]],
  cupVisible: true,
});

describe('layout seat helpers', () => {
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
  it('round-trips each player’s local pose through canonical space to their own card', () => {
    const original = frame(0.5, 1.2);
    const occupied = Array.from({ length: TABLE_SEAT_COUNT }, (_, seat) => seat);
    for (let seat = 0; seat < TABLE_SEAT_COUNT; seat++) {
      const placement = seatDisplayPlacement(occupied, seat, seat);
      if (!placement) throw new Error('expected self placement');
      const canonical = poseFrameToCanonical(original, seat);
      const displayed = poseFrameForSeatDisplay(canonical, placement);
      expect(displayed.bodies[0]![0]).toBeCloseTo(original.bodies[0]![0]!, 3);
      expect(displayed.bodies[0]![2]).toBeCloseTo(original.bodies[0]![2]!, 3);
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

  it('aligns every remote throw with its occupied card for 2–8 players and spectators', () => {
    const r = 1.8;
    const occupiedSets = [
      ...Array.from({ length: TABLE_SEAT_COUNT - 1 }, (_, index) =>
        Array.from({ length: index + 2 }, (__, seat) => seat),
      ),
      [0, 3, 7],
    ];
    for (const occupied of occupiedSets) {
      for (const viewerSeat of [...occupied, null]) {
        for (const placement of seatDisplayPlacements(occupied, viewerSeat)) {
          const canonical = poseFrameToCanonical(frame(0, r), placement.seatIndex);
          const displayed = poseFrameForSeatDisplay(canonical, placement);
          expect(displayed.bodies[0]![0]).toBeCloseTo(r * Math.cos(placement.angle), 3);
          expect(displayed.bodies[0]![2]).toBeCloseTo(r * Math.sin(placement.angle), 3);
        }
      }
    }
  });

  it('uses the same radial angle for the displayed throw and spectator koozie', () => {
    const placement = seatDisplayPlacement([0, 3, 7], 3, 7);
    if (!placement) throw new Error('expected player placement');
    const displayed = poseFrameForSeatDisplay(
      poseFrameToCanonical(frame(0, 1.8), placement.seatIndex),
      placement,
    );
    const [cupX, , cupZ] = koozieRestPositionAtAngle(
      { radius: 0.42, height: 0.95 },
      placement.angle,
    );
    const diePose = displayed.bodies[0]!;
    expect(Math.atan2(diePose[2], diePose[0])).toBeCloseTo(Math.atan2(cupZ, cupX), 10);
  });
});
