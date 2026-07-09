import { describe, expect, it } from 'vitest';
import type { BodyPose, Die } from '../types.js';
import {
  ALL_DIE_FACES,
  type Quat,
  quaternionFaceUp,
  REST_POSE_BOUNDS,
  readTopFaceFromQuat,
  validateRestPose,
} from './restPose.js';

/** Hamilton product q1 * q2 (pure helper for composing test rotations). */
function mul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function yawQuat(angle: number): Quat {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

/** Small tilt about X — a die settled slightly askew, top face unchanged. */
function tiltQuat(angle: number): Quat {
  return [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
}

const DICE: Die[] = [3, 1, 4, 6, 5];

function validPose(dice: Die[]): BodyPose[] {
  return dice.map((value, i) => {
    const [qx, qy, qz, qw] = quaternionFaceUp(value);
    return [0.3 * i - 0.6, 0.063, 0.4 - 0.25 * i, qx, qy, qz, qw];
  });
}

describe('readTopFaceFromQuat', () => {
  it('reads every face put up by quaternionFaceUp', () => {
    for (const value of ALL_DIE_FACES) {
      expect(readTopFaceFromQuat(quaternionFaceUp(value))).toBe(value);
    }
  });

  it('is stable under yaw (spin about vertical does not change the top face)', () => {
    for (const value of ALL_DIE_FACES) {
      for (const angle of [0.3, 1.1, 2.7, -0.8]) {
        const q = mul(yawQuat(angle), quaternionFaceUp(value));
        expect(readTopFaceFromQuat(q)).toBe(value);
      }
    }
  });

  it('tolerates the slight tilt of a physically settled die', () => {
    for (const value of ALL_DIE_FACES) {
      const q = mul(tiltQuat(0.3), quaternionFaceUp(value));
      expect(readTopFaceFromQuat(q)).toBe(value);
    }
  });

  it('reads a quarter-turn as the neighbouring face', () => {
    // 1 up, quarter-turn about X carries +Z (face 2) to +Y.
    const q = mul(tiltQuat(Math.PI / 2), quaternionFaceUp(1));
    expect(readTopFaceFromQuat(q)).toBe(5);
  });
});

describe('validateRestPose', () => {
  it('accepts a plausible settled pose', () => {
    expect(validateRestPose(validPose(DICE), DICE)).toBeNull();
  });

  it('accepts tilted dice as long as the top face matches', () => {
    const pose = validPose(DICE).map((p): BodyPose => {
      const [qx, qy, qz, qw] = mul(tiltQuat(0.25), [p[3], p[4], p[5], p[6]]);
      return [p[0], p[1], p[2], qx, qy, qz, qw];
    });
    expect(validateRestPose(pose, DICE)).toBeNull();
  });

  it('rejects the wrong number of poses or dice', () => {
    expect(validateRestPose(validPose(DICE).slice(0, 4), DICE)).toMatch(/expected 5 poses/);
    expect(validateRestPose(validPose(DICE), DICE.slice(0, 4))).toMatch(/expected 5 dice/);
  });

  it('rejects non-finite components', () => {
    const pose = validPose(DICE);
    pose[2] = [Number.NaN, 0.063, 0, 0, 0, 0, 1];
    expect(validateRestPose(pose, DICE)).toMatch(/die 2/);
  });

  it('rejects a non-unit quaternion', () => {
    const pose = validPose(DICE);
    pose[0] = [0, 0.063, 0, 0, 0, 0, 2];
    expect(validateRestPose(pose, DICE)).toMatch(/quaternion norm/);
  });

  it('rejects positions off the table', () => {
    const offTable = validPose(DICE);
    offTable[1] = [REST_POSE_BOUNDS.maxRadius + 0.2, 0.063, 0, ...quaternionFaceUp(DICE[1]!)];
    expect(validateRestPose(offTable, DICE)).toMatch(/off the table/);

    const floating = validPose(DICE);
    floating[3] = [0, REST_POSE_BOUNDS.maxY + 0.5, 0, ...quaternionFaceUp(DICE[3]!)];
    expect(validateRestPose(floating, DICE)).toMatch(/height/);
  });

  it('rejects a pose whose top faces disagree with the reported values', () => {
    const pose = validPose(DICE);
    const wrongDice: Die[] = [...DICE];
    wrongDice[0] = DICE[0] === 6 ? 1 : 6;
    expect(validateRestPose(pose, wrongDice)).toMatch(/top face/);
  });
});
