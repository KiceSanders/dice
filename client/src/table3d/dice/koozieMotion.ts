import * as THREE from 'three';
import { DICE_FELT_Y, KOOZIE } from './constants';
import { koozieRestPosition } from './diceLayout';
import {
  getDicePhysicsTuning,
  type DicePhysicsTuning,
} from './tuning';
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

function safeTuning(tuning?: DicePhysicsTuning): DicePhysicsTuning {
  return tuning ?? getDicePhysicsTuning();
}

function topOffsetFromCenter(tuning = safeTuning()): number {
  return tuning.cup.height * 0.5 - tuning.cup.rimInset;
}

export function pendulumLength(tuning = safeTuning()): number {
  return Math.max(tuning.pendulum.length, tuning.cup.height - tuning.cup.rimInset);
}

function maxSwingOffset(tuning = safeTuning()): number {
  return pendulumLength(tuning) * Math.sin(tuning.pendulum.maxTilt);
}

export type KooziePose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

export type KoozieHeldState = {
  /** Smoothed hang point at the open rim. */
  pivot: THREE.Vector3;
  prevPivot: THREE.Vector3;
  pivotVel: THREE.Vector3;
  pivotAccel: THREE.Vector3;
  /** Horizontal bottom offset from a vertical hang (XZ only). */
  bobOffset: THREE.Vector3;
  bobVel: THREE.Vector3;
  pose: KooziePose;
};

export type KooziePourState = {
  origin: THREE.Vector3;
  from: THREE.Quaternion;
  to: THREE.Quaternion;
  pourDir: THREE.Vector3;
  releaseVelocity: THREE.Vector3;
  releaseSpeed: number;
  elapsedMs: number;
};

export function createHomePose(tuning = safeTuning()): KooziePose {
  const [x, y, z] = koozieRestPosition(tuning.cup);
  return {
    position: new THREE.Vector3(x, y, z),
    quaternion: new THREE.Quaternion(),
  };
}

function topAndBottomFromPose(
  pose: KooziePose,
  tuning = safeTuning(),
): { top: THREE.Vector3; bottom: THREE.Vector3 } {
  const topOff = topOffsetFromCenter(tuning);
  const len = pendulumLength(tuning);
  const up = _scratch.set(0, 1, 0).applyQuaternion(pose.quaternion);
  return {
    top: pose.position.clone().addScaledVector(up, topOff),
    bottom: pose.position.clone().addScaledVector(up, topOff - len),
  };
}

export function createHeldState(home = createHomePose(), tuning = safeTuning()): KoozieHeldState {
  const { top } = topAndBottomFromPose(home, tuning);
  return {
    pivot: top.clone(),
    prevPivot: top.clone(),
    pivotVel: new THREE.Vector3(),
    pivotAccel: new THREE.Vector3(),
    bobOffset: new THREE.Vector3(),
    bobVel: new THREE.Vector3(),
    pose: {
      position: home.position.clone(),
      quaternion: home.quaternion.clone(),
    },
  };
}

export function createHeldStateFromPose(pose: KooziePose, tuning = safeTuning()): KoozieHeldState {
  const { top, bottom } = topAndBottomFromPose(pose, tuning);
  return {
    pivot: top.clone(),
    prevPivot: top.clone(),
    pivotVel: new THREE.Vector3(),
    pivotAccel: new THREE.Vector3(),
    bobOffset: new THREE.Vector3(bottom.x - top.x, 0, bottom.z - top.z),
    bobVel: new THREE.Vector3(),
    pose: {
      position: pose.position.clone(),
      quaternion: pose.quaternion.clone(),
    },
  };
}

function poseFromPivotAndBob(
  pivot: THREE.Vector3,
  bobOffset: THREE.Vector3,
  out: KooziePose,
  tuning = safeTuning(),
): KooziePose {
  const len = pendulumLength(tuning);
  const topOff = topOffsetFromCenter(tuning);
  _bottom.set(pivot.x + bobOffset.x, pivot.y - len, pivot.z + bobOffset.z);
  _axis.subVectors(pivot, _bottom);
  const axisLen = _axis.length();
  if (axisLen < 0.001) {
    out.position.copy(pivot).addScaledVector(_up, -topOff);
    out.quaternion.identity();
    return out;
  }

  _axis.divideScalar(axisLen);
  out.position.copy(pivot).addScaledVector(_axis, -topOff);
  _quat.setFromUnitVectors(_up, _axis);
  out.quaternion.copy(_quat);
  return out;
}

/**
 * Pointer pivot follows the cursor while the cup bottom behaves like a damped
 * pendulum bob. Pointer acceleration, gravity, and damping are the only forces.
 */
export function stepHeldPose(
  state: KoozieHeldState,
  pivotTarget: THREE.Vector3,
  dt: number,
  reducedMotion = false,
  tuning = safeTuning(),
): KooziePose {
  const safeDt = Math.max(Math.min(dt, 1 / 20), 1 / 240);
  const maxStep = tuning.pendulum.maxPivotSpeed * safeDt;
  const target = pivotTarget.clone();
  const toTarget = pivotTarget.clone().sub(state.pivot);
  if (toTarget.length() > maxStep) {
    toTarget.setLength(maxStep);
    target.copy(state.pivot).add(toTarget);
  } else {
    target.copy(pivotTarget);
  }

  state.pivot.lerp(target, expSmoothing(tuning.pendulum.follow, safeDt));

  const rawVel = _scratch.subVectors(state.pivot, state.prevPivot).divideScalar(safeDt);
  const rawAccel = rawVel.clone().sub(state.pivotVel).divideScalar(safeDt);
  state.pivotVel.lerp(rawVel, expSmoothing(tuning.pendulum.velocitySmooth, safeDt));
  state.pivotAccel.lerp(rawAccel, expSmoothing(tuning.pendulum.accelerationSmooth, safeDt));

  if (reducedMotion) {
    state.bobOffset.set(0, 0, 0);
    state.bobVel.set(0, 0, 0);
  } else {
    const len = pendulumLength(tuning);
    const omega = Math.sqrt(Math.abs(tuning.world.gravityY) / Math.max(len, 0.01));
    const damping = 2 * tuning.pendulum.dampingRatio * omega;
    state.bobVel.x += (-omega * omega * state.bobOffset.x - damping * state.bobVel.x - state.pivotAccel.x) * safeDt;
    state.bobVel.z += (-omega * omega * state.bobOffset.z - damping * state.bobVel.z - state.pivotAccel.z) * safeDt;
    state.bobOffset.addScaledVector(state.bobVel, safeDt);

    const maxOffset = maxSwingOffset(tuning);
    const offsetLen = Math.hypot(state.bobOffset.x, state.bobOffset.z);
    if (offsetLen > maxOffset) {
      const scale = maxOffset / offsetLen;
      state.bobOffset.x *= scale;
      state.bobOffset.z *= scale;
      state.bobVel.x *= scale;
      state.bobVel.z *= scale;
    }
  }

  poseFromPivotAndBob(state.pivot, state.bobOffset, _targetPose, tuning);
  state.pose.position.copy(_targetPose.position);
  state.pose.quaternion.copy(_targetPose.quaternion);
  state.prevPivot.copy(state.pivot);
  return state.pose;
}

/** Cup local +Y (open rim) in world space. */
export function openAxisFromPose(pose: KooziePose): THREE.Vector3 {
  return _scratch.set(0, 1, 0).applyQuaternion(pose.quaternion).clone();
}

/** Blend release velocity, current cup tilt, and a downward bias into a pour direction. */
export function pourDirectionFromRelease(
  pose: KooziePose,
  velocity: ThrowVelocity,
  tuning = safeTuning(),
): THREE.Vector3 {
  const speed = Math.hypot(velocity.x, velocity.z);
  const velocityHoriz =
    speed >= tuning.release.speedThreshold
      ? _axis.set(velocity.x, 0, velocity.z).normalize()
      : _axis.set(0, 0, 1);

  const tiltDir = openAxisFromPose(pose);
  const tiltHoriz = new THREE.Vector3(tiltDir.x, 0, tiltDir.z);
  if (tiltHoriz.lengthSq() > 1e-6) {
    tiltHoriz.normalize();
  } else {
    tiltHoriz.copy(velocityHoriz);
  }

  return new THREE.Vector3(
    velocityHoriz.x * 0.72 + tiltHoriz.x * 0.28,
    -tuning.release.downBias,
    velocityHoriz.z * 0.72 + tiltHoriz.z * 0.28,
  ).normalize();
}

export function computeReleaseTiltTarget(
  pose: KooziePose,
  pourDir: THREE.Vector3,
  tuning = safeTuning(),
): THREE.Quaternion {
  const openAxis = openAxisFromPose(pose);
  const axis = new THREE.Vector3().crossVectors(openAxis, pourDir);
  if (axis.lengthSq() < 1e-8) {
    return pose.quaternion.clone();
  }
  axis.normalize();
  const angle = Math.acos(THREE.MathUtils.clamp(openAxis.dot(pourDir), -1, 1));
  const step = Math.min(angle, tuning.release.tipAngle);
  const delta = new THREE.Quaternion().setFromAxisAngle(axis, step);
  return delta.multiply(pose.quaternion);
}

export function createPourState(
  pose: KooziePose,
  velocity: ThrowVelocity,
  heldVelocity?: THREE.Vector3,
  tuning = safeTuning(),
): KooziePourState {
  const blended = new THREE.Vector3(
    velocity.x + (heldVelocity?.x ?? 0) * tuning.release.velocityBlend,
    velocity.y + (heldVelocity?.y ?? 0) * tuning.release.velocityBlend,
    velocity.z + (heldVelocity?.z ?? 0) * tuning.release.velocityBlend,
  );
  const pourDir = pourDirectionFromRelease(pose, { x: blended.x, y: blended.y, z: blended.z }, tuning);
  return {
    origin: pose.position.clone(),
    from: pose.quaternion.clone(),
    to: computeReleaseTiltTarget(pose, pourDir, tuning),
    pourDir,
    releaseVelocity: blended,
    releaseSpeed: Math.hypot(blended.x, blended.z),
    elapsedMs: 0,
  };
}

/** Kinematic pour pose: glide in release direction while the cup tips open. */
export function pouringPoseAt(
  state: KooziePourState,
  elapsedMs: number,
  tuning = safeTuning(),
): { pose: KooziePose; progress: number } {
  const duration = Math.max(tuning.release.tipDurationMs, 1);
  const u = Math.min(1, Math.max(0, elapsedMs / duration));
  const eased = u * u * (3 - 2 * u);
  const q = state.from.clone().slerp(state.to, eased);
  const horizontal = new THREE.Vector3(state.releaseVelocity.x, 0, state.releaseVelocity.z);
  if (horizontal.lengthSq() < 1e-6) horizontal.set(state.pourDir.x, 0, state.pourDir.z);
  horizontal.normalize();
  const seconds = elapsedMs / 1000;
  const decay = Math.max(tuning.release.glideDecay, 0.01);
  const glide =
    Math.min(
      state.releaseSpeed * tuning.release.glideVelocityScale * (1 - Math.exp(-decay * seconds)) / decay,
      tuning.release.glideMaxDistance,
    ) *
    (0.35 + 0.65 * eased);
  const y = THREE.MathUtils.lerp(state.origin.y, tuning.release.pourCenterY, eased);
  return {
    progress: u,
    pose: {
      position: new THREE.Vector3(
        state.origin.x + horizontal.x * glide,
        Math.max(y, DICE_FELT_Y + KOOZIE.radius * 0.38),
        state.origin.z + horizontal.z * glide,
      ),
      quaternion: q,
    },
  };
}

/** True when a world-space point is still inside the cup volume. */
export function isInsideCup(
  worldPos: { x: number; y: number; z: number },
  cupPos: { x: number; y: number; z: number },
  cupRot: { x: number; y: number; z: number; w: number },
  tuning = safeTuning(),
): boolean {
  const local = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
  const inv = _quat.set(cupRot.x, cupRot.y, cupRot.z, cupRot.w).invert();
  local.sub(new THREE.Vector3(cupPos.x, cupPos.y, cupPos.z));
  local.applyQuaternion(inv);

  const halfH = tuning.cup.height * 0.5;
  const r = Math.hypot(local.x, local.z);
  if (local.y < -halfH + tuning.cup.bottomThickness) return false;
  if (local.y > halfH - tuning.cup.rimInset + tuning.cup.lidThickness) return false;
  return r < tuning.cup.emptyCheckRadius;
}
