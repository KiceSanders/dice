import type { BodyPose, Die, GameStatePublic, PlayerId, PoseFrame } from '@dice/shared';
import { viewRotationY } from '../layout';
import { rotateBodyPoseY } from '../seatTransform';
import { DICE_COUNT, dieSlotPosition } from './constants';
import { keepSlotForIndex, keptDieRailPosition } from './diceLayout';
import { quaternionForFace } from './faceValue';

const HIDDEN_CUP_POSE: BodyPose = [0, 0, 0, 0, 0, 0, 1];

function diePose(position: [number, number, number], value: Die): BodyPose {
  const q = quaternionForFace(value);
  return [position[0], position[1], position[2], q.x, q.y, q.z, q.w];
}

/**
 * Build a stable non-physics table pose from committed dice values — the
 * LAST-RESORT layout (dice in slots across the felt, kept dice railed). All
 * between-turn dice go through `resolveTableRestPose`; this is only rendered
 * when no authoritative rest pose exists (pre-first-roll, dropped pose).
 */
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
 * Everything the resolver needs to lay out the last settled roll: the
 * authoritative dice values, locked keeps, and the server-validated rest pose
 * (canonical table space, ADR 005) when one exists.
 */
export interface HeldRollInput {
  dice: Die[];
  kept: number[];
  restPose: BodyPose[] | null;
}

export interface LiveRollInput extends HeldRollInput {
  playerId: PlayerId;
  rollNumber: number;
}

function isLiveTurnRoll(
  lastRoll: LiveRollInput,
  turn: NonNullable<GameStatePublic['currentTurn']> | null | undefined,
): boolean {
  if (!turn || turn.playerId !== lastRoll.playerId) return false;
  // `turn:rolled` can arrive one snapshot before `currentTurn.rollsUsed`
  // catches up. Once the turn advances, the snapshot's rollToBeat/currentTurn
  // pose is authoritative and the local cache must not win.
  return lastRoll.rollNumber === turn.rollsUsed || lastRoll.rollNumber === turn.rollsUsed + 1;
}

/**
 * Which roll the felt should show between throws, in priority order: the live
 * `turn:rolled` state, else the current turn from a snapshot (rejoin mid-turn),
 * else the roll to beat (rejoin between turns). Null when nothing has been
 * rolled yet.
 */
export function pickHeldRollInput(
  lastRoll: LiveRollInput | null,
  game: GameStatePublic | null,
): HeldRollInput | null {
  const turn = game?.currentTurn;
  if (lastRoll && isLiveTurnRoll(lastRoll, turn)) {
    return { dice: lastRoll.dice, kept: lastRoll.kept, restPose: lastRoll.restPose };
  }
  if (turn && turn.dice.length >= DICE_COUNT) {
    return { dice: turn.dice, kept: turn.keptIndices, restPose: turn.restPose };
  }
  const rollToBeat = game?.rollToBeat ?? null;
  if (rollToBeat) return { dice: rollToBeat.dice, kept: [], restPose: rollToBeat.restPose };
  return null;
}

/** Canonical-space rest pose → a view-local static frame for this viewer's seat. */
export function restPoseToFrame(restPose: BodyPose[], mySeat: number): PoseFrame {
  const angle = -viewRotationY(mySeat);
  return {
    t: 0,
    bodies: [HIDDEN_CUP_POSE, ...restPose.map((p) => rotateBodyPoseY(p, angle))],
    cupVisible: false,
  };
}

/**
 * Observability for the slot-layout fallback (browser-testing checklist reads
 * `window.__diceDebug`): outside pre-first-roll idles and intentionally
 * dropped poses, the counter staying at 0 is the regression guard.
 */
export const diceDebug = { slotFallbackCount: 0 };

declare global {
  interface Window {
    __diceDebug?: typeof diceDebug;
  }
}
if (typeof window !== 'undefined') window.__diceDebug = diceDebug;

/**
 * THE resolver for settled dice on the felt. Priority: the server-validated
 * rest pose (every viewer sees the dice where they physically landed), else
 * the slot layout rebuilt from values. Adding a new pose source means adding
 * a tier here — never a new per-client capture path (ADR 005).
 */
export function resolveTableRestPose(
  input: HeldRollInput,
  mySeat: number,
): { frame: PoseFrame | null; source: 'authoritative' | 'slot-fallback' } {
  if (input.restPose && input.restPose.length === DICE_COUNT) {
    // No face re-check here: the server already validated pose ↔ values, and
    // re-reading faces from a slightly tilted settled quaternion is exactly
    // the misread that used to knock viewers into the slot fallback.
    return { frame: restPoseToFrame(input.restPose, mySeat), source: 'authoritative' };
  }
  diceDebug.slotFallbackCount += 1;
  if (import.meta.env.DEV) {
    console.warn('[dice] slot-layout fallback', { dice: input.dice, kept: input.kept });
  }
  return { frame: staticPoseFromDice(input.dice, input.kept), source: 'slot-fallback' };
}
