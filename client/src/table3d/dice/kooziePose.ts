import * as THREE from 'three';
import { KOOZIE } from './constants';
import type { ThrowVelocity } from './types';

const _up = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scratch = new THREE.Vector3();
const _bottom = new THREE.Vector3();
const _targetPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

function expSmoothing(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Open rim — where the cup hangs from the cursor. */
function topOffsetFromCenter(): number {
  return KOOZIE.height * 0.5 - KOOZIE.rimInset;
}

/** Full cup length from rim to bottom for pendulum swing. */
function pendulumLength(): number {
  return KOOZIE.height - KOOZIE.rimInset;
}

function maxSwingOffset(): number {
  return pendulumLength() * Math.sin(KOOZIE.maxDragTilt);
}

export type KooziePose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

export type KoozieDragState = {
  /** Smoothed hang point — eases toward the pointer. */
  rimPos: THREE.Vector3;
  prevRimPos: THREE.Vector3;
  gripVel: THREE.Vector3;
  gripAccel: THREE.Vector3;
  /** Horizontal bottom offset from a vertical hang (XZ only). */
  swingOffset: THREE.Vector3;
  swingVel: THREE.Vector3;
  pose: KooziePose;
};

export function createHomePose(): KooziePose {
  return {
    position: new THREE.Vector3(...KOOZIE.home),
    quaternion: new THREE.Quaternion(),
  };
}

function topAndBottomFromPose(pose: KooziePose): { top: THREE.Vector3; bottom: THREE.Vector3 } {
  const topOff = topOffsetFromCenter();
  const pendLen = pendulumLength();
  const up = _scratch.set(0, 1, 0).applyQuaternion(pose.quaternion);
  return {
    top: pose.position.clone().addScaledVector(up, topOff),
    bottom: pose.position.clone().addScaledVector(up, topOff - pendLen),
  };
}

export function createDragState(home = createHomePose()): KoozieDragState {
  const { top } = topAndBottomFromPose(home);
  return {
    rimPos: top.clone(),
    prevRimPos: top.clone(),
    gripVel: new THREE.Vector3(),
    gripAccel: new THREE.Vector3(),
    swingOffset: new THREE.Vector3(),
    swingVel: new THREE.Vector3(),
    pose: {
      position: home.position.clone(),
      quaternion: home.quaternion.clone(),
    },
  };
}

export function createDragStateFromPose(pose: KooziePose): KoozieDragState {
  const { top, bottom } = topAndBottomFromPose(pose);
  return {
    rimPos: top.clone(),
    prevRimPos: top.clone(),
    gripVel: new THREE.Vector3(),
    gripAccel: new THREE.Vector3(),
    swingOffset: new THREE.Vector3(bottom.x - top.x, 0, bottom.z - top.z),
    swingVel: new THREE.Vector3(),
    pose: {
      position: pose.position.clone(),
      quaternion: pose.quaternion.clone(),
    },
  };
}

/** Rim is the grip; bottom may lag horizontally for a pendulum feel. */
function poseFromTopAndBottom(top: THREE.Vector3, bottom: THREE.Vector3, out: KooziePose): KooziePose {
  _axis.subVectors(top, bottom);
  const len = _axis.length();
  const topOff = topOffsetFromCenter();
  if (len < 0.001) {
    out.position.copy(top).addScaledVector(_up, -topOff);
    out.quaternion.identity();
    return out;
  }
  _axis.divideScalar(len);
  const tilt = Math.acos(THREE.MathUtils.clamp(_axis.y, -1, 1));
  if (tilt > KOOZIE.maxDragTilt) {
    const blend = KOOZIE.maxDragTilt / tilt;
    _axis.lerp(_up, 1 - blend).normalize();
  }
  out.position.copy(top).addScaledVector(_axis, -topOff);
  _quat.setFromUnitVectors(_up, _axis);
  out.quaternion.copy(_quat);
  return out;
}

/**
 * Rim eases toward the pointer with filtered acceleration-driven swing
 * and smoothed tilt so motion stays steady instead of jittery.
 */
export function stepDragPose(
  state: KoozieDragState,
  gripTarget: THREE.Vector3,
  dt: number,
  reducedMotion = false,
): KooziePose {
  const safeDt = Math.max(dt, 1 / 240);

  state.rimPos.lerp(gripTarget, expSmoothing(KOOZIE.gripFollow, safeDt));

  const rawVel = _scratch.subVectors(state.rimPos, state.prevRimPos).divideScalar(safeDt);
  const rawAccel = rawVel.clone().sub(state.gripVel).divideScalar(safeDt);
  state.gripVel.lerp(rawVel, expSmoothing(KOOZIE.gripVelSmooth, safeDt));
  state.gripAccel.lerp(rawAccel, expSmoothing(KOOZIE.gripAccelSmooth, safeDt));

  const accelMag = Math.hypot(state.gripAccel.x, state.gripAccel.z);
  if (!reducedMotion && accelMag > KOOZIE.swingKickDeadzone) {
    state.swingVel.x -= state.gripAccel.x * KOOZIE.swingKick;
    state.swingVel.z -= state.gripAccel.z * KOOZIE.swingKick;
  }

  const stiffness = reducedMotion ? 220 : KOOZIE.swingStiffness;
  const damping = reducedMotion ? 1 : KOOZIE.swingDamping;
  state.swingVel.x -= state.swingOffset.x * stiffness * safeDt;
  state.swingVel.z -= state.swingOffset.z * stiffness * safeDt;
  state.swingVel.multiplyScalar(Math.pow(damping, safeDt * 60));
  state.swingOffset.add(state.swingVel.clone().multiplyScalar(safeDt));

  const maxOffset = maxSwingOffset();
  const offsetLen = Math.hypot(state.swingOffset.x, state.swingOffset.z);
  if (offsetLen > maxOffset) {
    const scale = maxOffset / offsetLen;
    state.swingOffset.x *= scale;
    state.swingOffset.z *= scale;
    state.swingVel.x *= scale;
    state.swingVel.z *= scale;
  }

  if (reducedMotion) {
    state.swingOffset.set(0, 0, 0);
    state.swingVel.set(0, 0, 0);
  }

  const pendLen = pendulumLength();
  _bottom.set(
    state.rimPos.x + state.swingOffset.x,
    state.rimPos.y - pendLen,
    state.rimPos.z + state.swingOffset.z,
  );

  poseFromTopAndBottom(state.rimPos, _bottom, _targetPose);
  const tiltBlend = reducedMotion ? 1 : expSmoothing(KOOZIE.tiltSmooth, safeDt);
  state.pose.position.copy(_targetPose.position);
  state.pose.quaternion.slerp(_targetPose.quaternion, tiltBlend);

  state.prevRimPos.copy(state.rimPos);

  return state.pose;
}

export type TippingState = {
  origin: THREE.Vector3;
  from: THREE.Quaternion;
  to: THREE.Quaternion;
  /** World direction the open end should point at full pour. */
  pourDir: THREE.Vector3;
  startMs: number;
};

/** Down + toward the player (+Z) — dice exit over the near rim. */
export function pourDirectionFromVelocity(velocity: ThrowVelocity): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.clamp(velocity.x * 0.05, -0.22, 0.22),
    -0.96,
    THREE.MathUtils.clamp(0.58 + velocity.z * 0.04, 0.32, 0.82),
  ).normalize();
}

/** Target rotation: open end points down toward the felt (not just a partial drag-axis tilt). */
export function computeReleaseTiltTarget(pose: KooziePose, velocity: ThrowVelocity): THREE.Quaternion {
  const pour = pourDirectionFromVelocity(velocity);
  const target = new THREE.Quaternion().setFromUnitVectors(_up, pour);
  // Continue from drag pose but finish at a full pour (past horizontal).
  return pose.quaternion.clone().slerp(target, 0.92);
}

/** Kinematic tip — lowers slightly while rotating so dice can fall out. */
export function tippingPoseAt(state: TippingState, nowMs: number): { pose: KooziePose; progress: number } {
  const u = Math.min(1, (nowMs - state.startMs) / KOOZIE.tiltDurationMs);
  const eased = u * u * (3 - 2 * u);
  const q = state.from.clone().slerp(state.to, eased);
  const drop = eased * KOOZIE.tipDropY;
  const slide = eased * 0.1;
  return {
    progress: u,
    pose: {
      position: new THREE.Vector3(
        state.origin.x + state.pourDir.x * slide,
        KOOZIE.floatCenterY - drop,
        state.origin.z + state.pourDir.z * slide,
      ),
      quaternion: q,
    },
  };
}

const _local = new THREE.Vector3();

/** True when a world-space point is still inside the cup volume. */
export function isInsideCup(
  worldPos: { x: number; y: number; z: number },
  cupPos: { x: number; y: number; z: number },
  cupRot: { x: number; y: number; z: number; w: number },
): boolean {
  _local.set(worldPos.x, worldPos.y, worldPos.z);
  const inv = _quat.set(cupRot.x, cupRot.y, cupRot.z, cupRot.w).invert();
  _local.sub(new THREE.Vector3(cupPos.x, cupPos.y, cupPos.z));
  _local.applyQuaternion(inv);

  const halfH = KOOZIE.height * 0.5;
  const r = Math.hypot(_local.x, _local.z);
  if (_local.y < -halfH + KOOZIE.bottomThickness) return false;
  if (_local.y > halfH - KOOZIE.rimInset + 0.02) return false;
  return r < KOOZIE.emptyCheckRadius;
}
