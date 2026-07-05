import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeReleaseTiltTarget,
  createHeldState,
  createHomePose,
  createPourState,
  pourDirectionFromRelease,
  pouringPoseAt,
  stepHeldPose,
} from './koozieMotion';
import { KOOZIE } from './constants';
import { DEFAULT_DICE_PHYSICS_TUNING } from './tuning';

describe('koozieMotion', () => {
  it('createHomePose rests on the felt across the table from the roller', () => {
    const home = createHomePose();
    expect(home.position.z).toBeLessThan(-1.4);
    expect(home.position.x).toBeCloseTo(0, 2);
    expect(home.position.y).toBeCloseTo(KOOZIE.height / 2, 2);
    expect(home.quaternion.w).toBeCloseTo(1, 2);
  });

  it('stepHeldPose tracks the pivot target smoothly', () => {
    const state = createHeldState();
    const target = state.pivot.clone().add(new THREE.Vector3(0.2, 0, -0.12));
    for (let i = 0; i < 45; i++) {
      stepHeldPose(state, target, 1 / 60, true);
    }

    const topOff = KOOZIE.height * 0.5 - KOOZIE.rimInset;
    const rim = state.pose.position.clone().add(new THREE.Vector3(0, topOff, 0));
    expect(rim.x).toBeCloseTo(target.x, 1);
    expect(rim.z).toBeCloseTo(target.z, 1);
    expect(state.pose.position.x).toBeGreaterThan(0);
  });

  it('stepHeldPose trails the pivot under acceleration', () => {
    const state = createHeldState();
    const start = state.pivot.clone();
    for (let i = 0; i < 6; i++) {
      const target = new THREE.Vector3(start.x + 0.6, start.y, start.z);
      stepHeldPose(state, target, 1 / 60, false);
    }

    expect(state.bobOffset.x).toBeLessThan(0);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(state.pose.quaternion);
    expect(axis.x).toBeGreaterThan(0);
  });

  it('stepHeldPose stays mostly upright during steady drag', () => {
    const state = createHeldState();
    const start = state.pivot.clone();
    for (let i = 0; i < 240; i++) {
      const target = new THREE.Vector3(start.x + i * 0.002, start.y, start.z + i * 0.001);
      stepHeldPose(state, target, 1 / 60, false);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(state.pose.quaternion);
    const tilt = Math.acos(THREE.MathUtils.clamp(up.dot(axis), -1, 1));
    expect(tilt).toBeLessThan(0.16);
  });

  it('stepHeldPose settles upright when the pointer stops moving', () => {
    const state = createHeldState();
    const target = new THREE.Vector3(0.35, state.pivot.y, 0.62);
    for (let i = 0; i < 30; i++) {
      const jerk = new THREE.Vector3(0.35 + i * 0.01, target.y, 0.62 + i * 0.008);
      stepHeldPose(state, jerk, 1 / 60, false);
    }
    for (let i = 0; i < 240; i++) {
      stepHeldPose(state, target, 1 / 60, false);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(state.pose.quaternion);
    const tilt = Math.acos(THREE.MathUtils.clamp(up.dot(axis), -1, 1));
    expect(tilt).toBeLessThan(0.08);
  });

  it('stepHeldPose clamps excessive tilt', () => {
    const state = createHeldState();
    for (let i = 0; i < 30; i++) {
      const target = new THREE.Vector3(i * 0.4, state.pivot.y, i * 0.35);
      stepHeldPose(state, target, 1 / 60, false);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(state.pose.quaternion);
    const tilt = Math.acos(THREE.MathUtils.clamp(up.dot(axis), -1, 1));
    expect(tilt).toBeLessThanOrEqual(DEFAULT_DICE_PHYSICS_TUNING.pendulum.maxTilt + 0.02);
  });

  it('pourDirectionFromRelease differs for opposing horizontal flicks', () => {
    const home = createHomePose();
    const right = pourDirectionFromRelease(home, { x: 3, y: 0, z: 0 });
    const left = pourDirectionFromRelease(home, { x: -3, y: 0, z: 0 });
    const back = pourDirectionFromRelease(home, { x: 0, y: 0, z: -3 });

    expect(right.dot(left)).toBeLessThan(0.85);
    expect(right.dot(back)).toBeLessThan(0.85);
    expect(left.dot(back)).toBeLessThan(0.85);
  });

  it('pourDirectionFromRelease shifts with cup tilt at same velocity', () => {
    const home = createHomePose();
    const slowVel = { x: 0, y: 0, z: 0 };
    const upright = pourDirectionFromRelease(home, slowVel);

    const tiltedPose = {
      position: home.position.clone(),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), KOOZIE.maxDragTilt),
    };
    const tiltedPour = pourDirectionFromRelease(tiltedPose, slowVel);

    const delta = Math.hypot(
      tiltedPour.x - upright.x,
      tiltedPour.y - upright.y,
      tiltedPour.z - upright.z,
    );
    expect(delta).toBeGreaterThan(0.08);
  });

  it('computeReleaseTiltTarget rotates open end toward pour direction', () => {
    const home = createHomePose();
    const pourDir = pourDirectionFromRelease(home, { x: 2, y: 0, z: 0 });
    const target = computeReleaseTiltTarget(home, pourDir);
    const openBefore = new THREE.Vector3(0, 1, 0).applyQuaternion(home.quaternion);
    const openAfter = new THREE.Vector3(0, 1, 0).applyQuaternion(target);
    expect(openAfter.dot(pourDir)).toBeGreaterThan(openBefore.dot(pourDir));
    expect(openAfter.dot(pourDir)).toBeGreaterThan(0.4);
  });

  it('pouringPoseAt lowers cup while tipping and glides with release speed', () => {
    // Pours start from a held pose at float height — grabbing lifts the cup.
    const held = {
      position: new THREE.Vector3(0, DEFAULT_DICE_PHYSICS_TUNING.cup.floatCenterY, 0.4),
      quaternion: new THREE.Quaternion(),
    };
    const state = createPourState(held, { x: 2, y: 0, z: 0 });
    const { pose } = pouringPoseAt(state, DEFAULT_DICE_PHYSICS_TUNING.release.tipDurationMs);
    expect(pose.position.y).toBeLessThan(held.position.y);
    expect(pose.position.x).toBeGreaterThan(held.position.x);
  });
});
