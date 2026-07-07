import type { BodyPose, Die, PlayerId, PoseFrame } from '@dice/shared';
import * as THREE from 'three';
import { DICE_COUNT, dieSlotPosition } from './constants';
import { keepSlotForIndex, keptDieRailPosition } from './diceLayout';
import { quaternionForFace, readTopFace } from './faceValue';

const HIDDEN_CUP_POSE: BodyPose = [0, 0, 0, 0, 0, 0, 1];
const _quat = new THREE.Quaternion();

function diePose(position: [number, number, number], value: Die): BodyPose {
  const q = quaternionForFace(value);
  return [position[0], position[1], position[2], q.x, q.y, q.z, q.w];
}

/** Build a stable non-physics table pose from committed dice values. */
export function staticPoseFromDice(dice: Die[], keepIndices: number[] = []): PoseFrame | null {
  if (dice.length < DICE_COUNT) return null;

  const kept = new Set(keepIndices);
  const keptSorted = [...keepIndices].sort((a, b) => a - b);
  const bodies: BodyPose[] = [HIDDEN_CUP_POSE];

  for (let i = 0; i < DICE_COUNT; i++) {
    const value = dice[i];
    if (value === undefined) return null;
    const position = kept.has(i)
      ? keptDieRailPosition(keepSlotForIndex(i, keptSorted), keptSorted.length)
      : dieSlotPosition(i);
    bodies.push(diePose(position, value));
  }

  return { t: 0, bodies, cupVisible: false };
}

/**
 * True when a captured table pose shows exactly these dice values, per die
 * index (frame bodies are cup-first, then hand-index order; seat-localizing
 * Y-rotations preserve top faces). Used to validate a physically captured
 * "last roll" pose against the authoritative turn:rolled values before
 * showing it between turns — capture pipelines (local sim frames vs streamed
 * frames) can be stale after refreshes, missed streams, or turns that ended
 * without a throw, and a pretty pose with wrong faces is worse than none.
 */
export function poseFrameMatchesDice(frame: PoseFrame, dice: Die[]): boolean {
  if (dice.length < DICE_COUNT) return false;
  for (let i = 0; i < DICE_COUNT; i++) {
    const pose = frame.bodies[i + 1];
    if (!pose) return false;
    _quat.set(pose[3], pose[4], pose[5], pose[6]);
    if (readTopFace(_quat) !== dice[i]) return false;
  }
  return true;
}

/** Authoritative identity for a committed roll (`turn:rolled`). */
export interface RollIdentity {
  playerId: PlayerId;
  rollNumber: number;
}

/** Physically or streamed captured table pose tagged with the roll it came from. */
export interface CapturedRollPose {
  frame: PoseFrame;
  /** Capture time — newest matching pose wins in Room. */
  at: number;
  rollId: RollIdentity;
}

export function rollIdentityMatches(captured: RollIdentity, lastRoll: RollIdentity): boolean {
  return captured.playerId === lastRoll.playerId && captured.rollNumber === lastRoll.rollNumber;
}

/**
 * Pick the best pose for `lastRoll`: a tagged capture whose roll id and faces
 * both match, else a rebuilt static pose from the authoritative dice values.
 */
export function resolveLastRollPose(
  lastRoll: RollIdentity & { dice: Die[]; kept: number[] },
  local: CapturedRollPose | null,
  remote: CapturedRollPose | null,
): PoseFrame | null {
  const candidates = [local, remote].filter((c): c is CapturedRollPose => c !== null);
  const newestMatching = candidates
    .filter((c) => rollIdentityMatches(c.rollId, lastRoll))
    .sort((a, b) => b.at - a.at)[0];
  if (newestMatching && poseFrameMatchesDice(newestMatching.frame, lastRoll.dice)) {
    return newestMatching.frame;
  }
  return staticPoseFromDice(lastRoll.dice, lastRoll.kept);
}
