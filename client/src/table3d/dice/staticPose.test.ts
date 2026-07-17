import type { BodyPose, Die, GameStatePublic, PoseFrame } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { seatDisplayPlacement, TABLE_SEAT_COUNT } from '../layout';
import { poseFrameToCanonical } from '../seatTransform';
import { DICE_COUNT } from './constants';
import { quaternionForFace } from './faceValue';
import {
  diceDebug,
  type LiveRollInput,
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
    classicPot: 0,
    turnQueue: [],
    currentTurn: null,
    rollToBeat: null,
    subRound: null,
    ...overrides,
  };
}

function placementFor(occupied: number[], viewerSeat: number | null, playerSeat: number) {
  const placement = seatDisplayPlacement(occupied, viewerSeat, playerSeat);
  if (!placement) throw new Error('expected seat display placement');
  return placement;
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
  const lastRoll: LiveRollInput = {
    playerId: 'p1',
    rollNumber: 1,
    dice: DICE,
    kept: [0],
    restPose: makeRestPose(DICE),
  };

  it('prefers the live lastRoll while it belongs to the current turn', () => {
    const game = makeGame({
      currentTurn: {
        playerId: 'p1',
        dice: DICE,
        keptIndices: [],
        rollsUsed: 1,
        rollCap: 5,
        throwing: false,
        resolving: false,
        koozieLocked: false,
        bonusPending: null,
        restPose: null,
      },
      rollToBeat: {
        playerIds: ['px'],
        score: { count: 2, face: 2, rollsUsed: 1, straight: 'none' },
        dice: [2, 2, 1, 3, 4],
        restPose: null,
      },
    });
    expect(pickHeldRollInput(lastRoll, game)).toEqual({
      playerId: 'p1',
      dice: DICE,
      kept: [0],
      restPose: lastRoll.restPose,
    });
  });

  it('uses lastRoll while the snapshot is one turn:rolled behind', () => {
    const game = makeGame({
      currentTurn: {
        playerId: 'p1',
        dice: [],
        keptIndices: [],
        rollsUsed: 0,
        rollCap: 5,
        throwing: false,
        resolving: false,
        koozieLocked: false,
        bonusPending: null,
        restPose: null,
      },
    });
    expect(pickHeldRollInput(lastRoll, game)).toEqual({
      playerId: 'p1',
      dice: DICE,
      kept: [0],
      restPose: lastRoll.restPose,
    });
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
        resolving: false,
        koozieLocked: false,
        bonusPending: null,
        restPose,
      },
    });
    expect(pickHeldRollInput(null, game)).toEqual({
      playerId: 'p1',
      dice: DICE,
      kept: [2],
      restPose,
    });
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
        resolving: false,
        koozieLocked: false,
        bonusPending: null,
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
      playerId: 'px',
      dice: [2, 2, 1, 3, 4],
      kept: [],
      restPose,
    });
  });

  it('ignores stale lastRoll after stand and uses rollToBeat stand pose', () => {
    const settlePose = makeRestPose(DICE);
    const standPose = makeRestPose(DICE).map(
      (p, i): BodyPose => [p[0], p[1], p[2] + 0.08 * (i + 1), p[3], p[4], p[5], p[6]],
    );
    const staleLastRoll: LiveRollInput = {
      playerId: 'p0',
      rollNumber: 2,
      dice: DICE,
      kept: [0, 2],
      restPose: settlePose,
    };
    const game = makeGame({
      currentTurn: {
        playerId: 'p1',
        dice: [],
        keptIndices: [],
        rollsUsed: 0,
        rollCap: 2,
        throwing: false,
        resolving: false,
        koozieLocked: false,
        bonusPending: null,
        restPose: null,
      },
      rollToBeat: {
        playerIds: ['p0'],
        score: { count: 1, face: 6, rollsUsed: 2, straight: 'none' },
        dice: DICE,
        restPose: standPose,
      },
    });

    expect(pickHeldRollInput(staleLastRoll, game)).toEqual({
      playerId: 'p0',
      dice: DICE,
      kept: [],
      restPose: standPose,
    });
  });

  it('keeps the latest losing hand visible after the turn advances', () => {
    const losingDice = [2, 3, 4, 5, 6] as Die[];
    const losingPose = makeRestPose(losingDice);
    const latestLosingRoll: LiveRollInput = {
      playerId: 'p0',
      rollNumber: 1,
      dice: losingDice,
      kept: [],
      restPose: losingPose,
    };
    const leaderDice = [6, 6, 3, 4, 5] as Die[];
    const game = makeGame({
      currentTurn: {
        playerId: 'p1',
        dice: [],
        keptIndices: [],
        rollsUsed: 0,
        rollCap: 1,
        throwing: false,
        resolving: false,
        koozieLocked: false,
        bonusPending: null,
        restPose: null,
      },
      rollToBeat: {
        playerIds: ['leader'],
        score: { count: 2, face: 6, rollsUsed: 1, straight: 'none' },
        dice: leaderDice,
        restPose: makeRestPose(leaderDice),
      },
    });

    expect(pickHeldRollInput(latestLosingRoll, game)).toEqual({
      playerId: 'p0',
      dice: losingDice,
      kept: [],
      restPose: losingPose,
    });
  });

  it('keeps the latest tied hand instead of the first holder stored in rollToBeat', () => {
    const tiedDice = [3, 3, 2, 4, 6] as Die[];
    const tiedPose = makeRestPose(tiedDice);
    const latestTiedRoll: LiveRollInput = {
      playerId: 'later-tie',
      rollNumber: 1,
      dice: tiedDice,
      kept: [],
      restPose: tiedPose,
    };
    const firstHolderDice = [3, 3, 4, 5, 6] as Die[];
    const game = makeGame({
      currentTurn: null,
      rollToBeat: {
        playerIds: ['first-holder', 'later-tie'],
        score: { count: 2, face: 3, rollsUsed: 1, straight: 'none' },
        dice: firstHolderDice,
        restPose: makeRestPose(firstHolderDice),
      },
    });

    expect(pickHeldRollInput(latestTiedRoll, game)).toEqual({
      playerId: 'later-tie',
      dice: tiedDice,
      kept: [],
      restPose: tiedPose,
    });
  });

  it('keeps the final losing hand visible when the round ends', () => {
    const losingDice = [2, 3, 4, 5, 6] as Die[];
    const losingPose = makeRestPose(losingDice);
    const finalRoll: LiveRollInput = {
      playerId: 'last-player',
      rollNumber: 1,
      dice: losingDice,
      kept: [],
      restPose: losingPose,
    };
    const leaderDice = [6, 6, 3, 4, 5] as Die[];
    const game = makeGame({
      currentTurn: null,
      rollToBeat: {
        playerIds: ['leader'],
        score: { count: 2, face: 6, rollsUsed: 1, straight: 'none' },
        dice: leaderDice,
        restPose: makeRestPose(leaderDice),
      },
    });

    expect(pickHeldRollInput(finalRoll, game)).toEqual({
      playerId: 'last-player',
      dice: losingDice,
      kept: [],
      restPose: losingPose,
    });
  });

  it('returns null when nothing has been rolled', () => {
    expect(pickHeldRollInput(null, makeGame())).toBeNull();
    expect(pickHeldRollInput(null, null)).toBeNull();
  });
});

describe('restPoseToFrame', () => {
  it('round-trips a view-local settle frame through canonical space for every seat', () => {
    const occupied = Array.from({ length: TABLE_SEAT_COUNT }, (_, seat) => seat);
    for (let seat = 0; seat < TABLE_SEAT_COUNT; seat++) {
      // The roller samples view-local, sends canonical (poseFrameToCanonical);
      // a viewer at the same seat must see the identical layout back.
      const viewLocal: PoseFrame = {
        t: 0,
        bodies: [[0, 0, 0, 0, 0, 0, 1], ...makeRestPose(DICE)],
        cupVisible: false,
      };
      const canonical = poseFrameToCanonical(viewLocal, seat);
      const frame = restPoseToFrame(canonical.bodies.slice(1), placementFor(occupied, seat, seat));
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

  it('rotates canonical poses into the player’s reflowed card placement', () => {
    const restPose = makeRestPose(DICE);
    const placement = placementFor([0, 3, 7], 3, 7);
    const frame = restPoseToFrame(restPose, placement);
    // Same layout, different orientation: positions move, heights do not.
    expect(frame.bodies[1]![0]).not.toBeCloseTo(restPose[0]![0]!, 3);
    expect(frame.bodies[1]![1]).toBeCloseTo(restPose[0]![1]!, 10);
  });
});

describe('resolveTableRestPose', () => {
  it('aligns authoritative and fallback kept rails with the same remote player card', () => {
    const placement = placementFor([0, 1], 0, 1);
    const local = staticPoseFromDice(DICE, [2]);
    if (!local) throw new Error('expected local fallback pose');
    const canonical = poseFrameToCanonical(local, placement.seatIndex);
    const restPose = canonical.bodies.slice(1);

    const authoritative = resolveTableRestPose(
      { playerId: 'p1', dice: DICE, kept: [2], restPose },
      placement,
    ).frame;
    const fallback = resolveTableRestPose(
      { playerId: 'p1', dice: DICE, kept: [2], restPose: null },
      placement,
    ).frame;

    for (const resolved of [authoritative, fallback]) {
      const keptPose = resolved?.bodies[3];
      if (!keptPose) throw new Error('expected kept die pose');
      const angle = Math.atan2(keptPose[2], keptPose[0]);
      expect(Math.cos(angle)).toBeCloseTo(Math.cos(placement.angle), 6);
      expect(Math.sin(angle)).toBeCloseTo(Math.sin(placement.angle), 6);
    }
  });

  it('uses the authoritative rest pose without re-checking faces', () => {
    // Tilted quats (norm-preserving) must NOT knock us into the fallback —
    // the server already validated the pose; re-reading faces here was the
    // old regression (slightly tilted settled dice failing the match).
    const restPose = makeRestPose(DICE).map(
      (p): BodyPose => [p[0], p[1], p[2], 0.19, 0.02, 0.03, 0.981],
    );
    const before = diceDebug.slotFallbackCount;
    const placement = placementFor([0, 1], 0, 1);
    const { frame, source } = resolveTableRestPose(
      { playerId: 'p1', dice: DICE, kept: [], restPose },
      placement,
    );
    expect(source).toBe('authoritative');
    expect(frame).not.toBeNull();
    expect(frame!.bodies).toHaveLength(DICE_COUNT + 1);
    expect(diceDebug.slotFallbackCount).toBe(before);
  });

  it('falls back to the slot layout and counts it when no pose exists', () => {
    const before = diceDebug.slotFallbackCount;
    const placement = placementFor([0, 1], 0, 0);
    const { frame, source } = resolveTableRestPose(
      { playerId: 'p0', dice: DICE, kept: [1], restPose: null },
      placement,
    );
    expect(source).toBe('slot-fallback');
    expect(frame).toEqual(staticPoseFromDice(DICE, [1]));
    expect(diceDebug.slotFallbackCount).toBe(before + 1);
  });

  it('treats a malformed (short) pose as missing', () => {
    const restPose = makeRestPose(DICE).slice(0, 3);
    const { source } = resolveTableRestPose(
      { playerId: 'p0', dice: DICE, kept: [], restPose },
      placementFor([0, 1], 0, 0),
    );
    expect(source).toBe('slot-fallback');
  });
});
