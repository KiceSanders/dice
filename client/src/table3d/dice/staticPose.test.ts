import type { BodyPose, Die, GameStatePublic, PoseFrame } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { viewRotationY } from '../layout';
import { poseFrameToCanonical } from '../seatTransform';
import { DICE_COUNT } from './constants';
import { quaternionForFace } from './faceValue';
import {
  diceDebug,
  type HeldRollInput,
  pickHeldRollInput,
  resolveTableRestPose,
  restPoseToFrame,
  staticPoseFromDice,
} from './staticPose';

const DICE: Die[] = [3, 1, 4, 6, 5];

/** A plausible scattered rest pose: on-felt positions, exact face-up quats. */
function makeRestPose(dice: Die[]): BodyPose[] {
  return dice.map((value, i) => {
    const q = quaternionForFace(value);
    return [0.3 * i - 0.6, 0.063, 0.4 - 0.25 * i, q.x, q.y, q.z, q.w];
  });
}

function makeGame(overrides: Partial<GameStatePublic> = {}): GameStatePublic {
  return {
    roundNumber: 1,
    pot: 2,
    turnQueue: [],
    currentTurn: null,
    rollToBeat: null,
    subRound: null,
    ...overrides,
  };
}

describe('staticPoseFromDice', () => {
  it('lays out a hidden cup plus one pose per die, kept dice railed', () => {
    const pose = staticPoseFromDice([1, 2, 3, 4, 5], [1, 3]);
    expect(pose).not.toBeNull();
    expect(pose!.bodies).toHaveLength(DICE_COUNT + 1);
    expect(pose!.cupVisible).toBe(false);
    // Kept dice sit on the near rail (larger +Z than the felt slots).
    const feltZ = pose!.bodies[1]![2];
    expect(pose!.bodies[2]![2]).toBeGreaterThan(feltZ);
    expect(pose!.bodies[4]![2]).toBeGreaterThan(feltZ);
  });

  it('returns null for incomplete hands', () => {
    expect(staticPoseFromDice([1, 2])).toBeNull();
  });
});

describe('pickHeldRollInput', () => {
  const lastRoll: HeldRollInput = { dice: DICE, kept: [0], restPose: makeRestPose(DICE) };

  it('prefers the live lastRoll', () => {
    const game = makeGame({
      rollToBeat: {
        playerIds: ['px'],
        score: { count: 2, face: 2, rollsUsed: 1, straight: 'none' },
        dice: [2, 2, 1, 3, 4],
        restPose: null,
      },
    });
    expect(pickHeldRollInput(lastRoll, game)).toEqual(lastRoll);
  });

  it('falls back to the snapshot current turn after a rejoin mid-turn', () => {
    const restPose = makeRestPose(DICE);
    const game = makeGame({
      currentTurn: {
        playerId: 'p1',
        dice: DICE,
        keptIndices: [2],
        rollsUsed: 1,
        rollCap: 5,
        throwing: false,
        restPose,
      },
    });
    expect(pickHeldRollInput(null, game)).toEqual({ dice: DICE, kept: [2], restPose });
  });

  it('skips a current turn that has not rolled yet and uses rollToBeat', () => {
    const restPose = makeRestPose([2, 2, 1, 3, 4]);
    const game = makeGame({
      currentTurn: {
        playerId: 'p1',
        dice: [],
        keptIndices: [],
        rollsUsed: 0,
        rollCap: 5,
        throwing: false,
        restPose: null,
      },
      rollToBeat: {
        playerIds: ['px'],
        score: { count: 2, face: 2, rollsUsed: 1, straight: 'none' },
        dice: [2, 2, 1, 3, 4],
        restPose,
      },
    });
    expect(pickHeldRollInput(null, game)).toEqual({
      dice: [2, 2, 1, 3, 4],
      kept: [],
      restPose,
    });
  });

  it('returns null when nothing has been rolled', () => {
    expect(pickHeldRollInput(null, makeGame())).toBeNull();
    expect(pickHeldRollInput(null, null)).toBeNull();
  });
});

describe('restPoseToFrame', () => {
  it('round-trips a view-local settle frame through canonical space for every seat', () => {
    for (let seat = 0; seat < 3; seat++) {
      // The roller samples view-local, sends canonical (poseFrameToCanonical);
      // a viewer at the same seat must see the identical layout back.
      const viewLocal: PoseFrame = {
        t: 0,
        bodies: [[0, 0, 0, 0, 0, 0, 1], ...makeRestPose(DICE)],
        cupVisible: false,
      };
      const canonical = poseFrameToCanonical(viewLocal, seat);
      const frame = restPoseToFrame(canonical.bodies.slice(1), seat);
      expect(frame.cupVisible).toBe(false);
      for (let i = 0; i < DICE_COUNT; i++) {
        const original = viewLocal.bodies[i + 1]!;
        const roundTripped = frame.bodies[i + 1]!;
        for (let k = 0; k < 7; k++) {
          expect(roundTripped[k]).toBeCloseTo(original[k]!, 10);
        }
      }
    }
  });

  it('rotates canonical poses into the viewer seat frame', () => {
    const restPose = makeRestPose(DICE);
    const seat = 1;
    const frame = restPoseToFrame(restPose, seat);
    expect(viewRotationY(seat)).not.toBe(0);
    // Same layout, different orientation: positions move, heights do not.
    expect(frame.bodies[1]![0]).not.toBeCloseTo(restPose[0]![0]!, 3);
    expect(frame.bodies[1]![1]).toBeCloseTo(restPose[0]![1]!, 10);
  });
});

describe('resolveTableRestPose', () => {
  it('uses the authoritative rest pose without re-checking faces', () => {
    // Tilted quats (norm-preserving) must NOT knock us into the fallback —
    // the server already validated the pose; re-reading faces here was the
    // old regression (slightly tilted settled dice failing the match).
    const restPose = makeRestPose(DICE).map(
      (p): BodyPose => [p[0], p[1], p[2], 0.19, 0.02, 0.03, 0.981],
    );
    const before = diceDebug.slotFallbackCount;
    const { frame, source } = resolveTableRestPose({ dice: DICE, kept: [], restPose }, 0);
    expect(source).toBe('authoritative');
    expect(frame).not.toBeNull();
    expect(frame!.bodies).toHaveLength(DICE_COUNT + 1);
    expect(diceDebug.slotFallbackCount).toBe(before);
  });

  it('falls back to the slot layout and counts it when no pose exists', () => {
    const before = diceDebug.slotFallbackCount;
    const { frame, source } = resolveTableRestPose({ dice: DICE, kept: [1], restPose: null }, 0);
    expect(source).toBe('slot-fallback');
    expect(frame).toEqual(staticPoseFromDice(DICE, [1]));
    expect(diceDebug.slotFallbackCount).toBe(before + 1);
  });

  it('treats a malformed (short) pose as missing', () => {
    const restPose = makeRestPose(DICE).slice(0, 3);
    const { source } = resolveTableRestPose({ dice: DICE, kept: [], restPose }, 0);
    expect(source).toBe('slot-fallback');
  });
});
