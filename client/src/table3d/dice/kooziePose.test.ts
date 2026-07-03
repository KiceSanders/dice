import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeReleaseTiltTarget,
  createDragState,
  createHomePose,
  pourDirectionFromRelease,
  pourDirectionFromVelocity,
  stepDragPose,
  tippingPoseAt,
} from './kooziePose';
import { KOOZIE } from './constants';
import { FELT_HALF_EXTENT } from '../layout';

describe('kooziePose', () => {
  it('createHomePose uses configured home position', () => {
    const home = createHomePose();
    expect(home.position.z).toBeCloseTo(FELT_HALF_EXTENT.z * 0.47, 2);
    expect(home.quaternion.w).toBeCloseTo(1, 2);
  });

  it('stepDragPose tracks the grip target smoothly', () => {
    const state = createDragState();
    const target = new THREE.Vector3(0.2, KOOZIE.dragPlaneY, 0.5);
    for (let i = 0; i < 45; i++) {
      stepDragPose(state, target, 1 / 60, true);
    }

    const topOff = KOOZIE.height * 0.5 - KOOZIE.rimInset;
    const rim = state.pose.position.clone().add(new THREE.Vector3(0, topOff, 0));
    expect(rim.x).toBeCloseTo(target.x, 1);
    expect(rim.z).toBeCloseTo(target.z, 1);
    expect(state.pose.position.x).toBeGreaterThan(0);
  });

  it('stepDragPose stays upright during steady drag', () => {
    const state = createDragState();
    const start = state.rimPos.clone();
    for (let i = 0; i < 240; i++) {
      const target = new THREE.Vector3(start.x + i * 0.002, start.y, start.z + i * 0.001);
      stepDragPose(state, target, 1 / 60, false);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(state.pose.quaternion);
    const tilt = Math.acos(THREE.MathUtils.clamp(up.dot(axis), -1, 1));
    expect(tilt).toBeLessThan(0.1);
  });

  it('stepDragPose settles upright when the pointer stops moving', () => {
    const state = createDragState();
    const target = new THREE.Vector3(0.35, state.rimPos.y, 0.62);
    for (let i = 0; i < 30; i++) {
      const jerk = new THREE.Vector3(0.35 + i * 0.01, target.y, 0.62 + i * 0.008);
      stepDragPose(state, jerk, 1 / 60, false);
    }
    for (let i = 0; i < 240; i++) {
      stepDragPose(state, target, 1 / 60, false);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(state.pose.quaternion);
    const tilt = Math.acos(THREE.MathUtils.clamp(up.dot(axis), -1, 1));
    expect(tilt).toBeLessThan(0.08);
  });

  it('stepDragPose clamps excessive tilt', () => {
    const state = createDragState();
    for (let i = 0; i < 30; i++) {
      const target = new THREE.Vector3(i * 0.4, state.rimPos.y, i * 0.35);
      stepDragPose(state, target, 1 / 60, false);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(state.pose.quaternion);
    const tilt = Math.acos(THREE.MathUtils.clamp(up.dot(axis), -1, 1));
    expect(tilt).toBeLessThanOrEqual(KOOZIE.maxDragTilt + 0.02);
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
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), KOOZIE.maxDragTilt),
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

  it('tippingPoseAt lowers cup while tipping', () => {
    const home = createHomePose();
    const pourDir = pourDirectionFromVelocity({ x: 1, y: 0, z: 0 });
    const state = {
      origin: home.position.clone(),
      from: home.quaternion.clone(),
      to: computeReleaseTiltTarget(home, pourDir),
      pourDir,
      releaseSpeed: 2,
      startMs: 0,
    };
    const { pose } = tippingPoseAt(state, 680);
    expect(pose.position.y).toBeLessThan(home.position.y);
  });
});
