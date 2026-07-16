import type { BodyPose, Die, GameStatePublic, PlayerId, PoseFrame } from '@dice/shared';
import type { SeatDisplayPlacement } from '../layout';
import { poseFrameForSeatDisplay, poseFrameToCanonical } from '../seatTransform';
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
  playerId: PlayerId;
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
  // catches up.
  return lastRoll.rollNumber === turn.rollsUsed || lastRoll.rollNumber === turn.rollsUsed + 1;
}

function heldRoll(lastRoll: LiveRollInput): HeldRollInput {
  return {
    playerId: lastRoll.playerId,
    dice: lastRoll.dice,
    kept: lastRoll.kept,
    restPose: lastRoll.restPose,
  };
}

function stoodRoll(rollToBeat: NonNullable<GameStatePublic['rollToBeat']>): HeldRollInput {
  return {
    playerId: rollToBeat.playerIds[0]!,
    dice: rollToBeat.dice,
    kept: [],
    restPose: rollToBeat.restPose,
  };
}

/**
 * Which roll the felt should show between throws. A live `turn:rolled` remains
 * the visible hand across a turn/round handoff, including when it lost. If that
 * player stood as a leader, prefer rollToBeat because it carries the refined
 * stand-click pose. Snapshot sources cover rejoiners that have no live cache.
 */
export function pickHeldRollInput(
  lastRoll: LiveRollInput | null,
  game: GameStatePublic | null,
): HeldRollInput | null {
  const turn = game?.currentTurn;
  if (lastRoll && isLiveTurnRoll(lastRoll, turn)) {
    return heldRoll(lastRoll);
  }
  const rollToBeat = game?.rollToBeat ?? null;
  if (lastRoll) {
    // rollToBeat stores the first holder's dice/pose; later tied player IDs are
    // appended without replacing that hand, so only index 0 owns this pose.
    if (rollToBeat?.playerIds[0] === lastRoll.playerId) return stoodRoll(rollToBeat);
    return heldRoll(lastRoll);
  }
  if (turn && turn.dice.length >= DICE_COUNT) {
    return {
      playerId: turn.playerId,
      dice: turn.dice,
      kept: turn.keptIndices,
      restPose: turn.restPose,
    };
  }
  if (rollToBeat) return stoodRoll(rollToBeat);
  return null;
}

/** Canonical-space rest pose → this player's shared occupied-card placement. */
export function restPoseToFrame(restPose: BodyPose[], placement: SeatDisplayPlacement): PoseFrame {
  const canonicalFrame: PoseFrame = {
    t: 0,
    bodies: [HIDDEN_CUP_POSE, ...restPose],
    cupVisible: false,
  };
  return poseFrameForSeatDisplay(canonicalFrame, placement);
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
  placement: SeatDisplayPlacement,
): { frame: PoseFrame | null; source: 'authoritative' | 'slot-fallback' } {
  if (input.restPose && input.restPose.length === DICE_COUNT) {
    // No face re-check here: the server already validated pose ↔ values, and
    // re-reading faces from a slightly tilted settled quaternion is exactly
    // the misread that used to knock viewers into the slot fallback.
    return { frame: restPoseToFrame(input.restPose, placement), source: 'authoritative' };
  }
  diceDebug.slotFallbackCount += 1;
  if (import.meta.env.DEV) {
    console.warn('[dice] slot-layout fallback', { dice: input.dice, kept: input.kept });
  }
  const localFallback = staticPoseFromDice(input.dice, input.kept);
  const canonicalFallback = localFallback
    ? poseFrameToCanonical(localFallback, placement.seatIndex)
    : null;
  return {
    frame: canonicalFallback ? poseFrameForSeatDisplay(canonicalFallback, placement) : null,
    source: 'slot-fallback',
  };
}
