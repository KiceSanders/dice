import type { Die } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEngine, makePlayers, ofType, restPoseFor, roll } from './engine.testkit.js';

const bad = { code: 'BAD_REQUEST' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GameEngine: physics throws (ADR 004)', () => {
  it('first throw: beginThrow marks the turn, commitThrow applies client dice', () => {
    const { engine, events } = makeEngine(makePlayers());
    engine.start();

    expect(engine.beginThrow('p0', [])).toBeNull();
    expect(events.find((e) => e.type === 'throwStarted')).toMatchObject({
      playerId: 'p0',
      kept: [],
      rollNumber: 1,
    });
    expect(engine.publicState().currentTurn?.throwing).toBe(true);

    expect(engine.commitThrow('p0', [4, 4, 4, 2, 1])).toBeNull();
    expect(events.find((e) => e.type === 'rolled')).toMatchObject({
      playerId: 'p0',
      dice: [4, 4, 4, 2, 1],
      rollNumber: 1,
      kept: [],
    });
    const turn = engine.publicState().currentTurn;
    expect(turn?.dice).toEqual([4, 4, 4, 2, 1]);
    expect(turn?.rollsUsed).toBe(1);
    expect(turn?.throwing).toBe(false);
  });

  it('reroll: kept positions must keep their value', () => {
    const { engine } = makeEngine(makePlayers());
    engine.start();
    engine.beginThrow('p0', []);
    engine.commitThrow('p0', [4, 4, 4, 2, 1]);

    expect(engine.beginThrow('p0', [0, 1, 2])).toBeNull();
    // Index 2 changed 4 → 5: the one integrity check client rolls must pass.
    expect(engine.commitThrow('p0', [4, 4, 5, 6, 6])).toMatchObject(bad);
    // The throw stays in flight; a valid result still lands.
    expect(engine.commitThrow('p0', [4, 4, 4, 6, 6])).toBeNull();
    expect(engine.publicState().currentTurn?.rollsUsed).toBe(2);
  });

  it('rejects out-of-order and malformed throws', () => {
    const { engine } = makeEngine(makePlayers());
    engine.start();

    expect(engine.commitThrow('p0', [1, 1, 1, 1, 1])).toMatchObject(bad); // no begin
    expect(engine.beginThrow('p0', [0])).toMatchObject(bad); // keeps on first roll
    expect(engine.beginThrow('p1', [])).toMatchObject({ code: 'NOT_YOUR_TURN' });

    expect(engine.beginThrow('p0', [])).toBeNull();
    expect(engine.beginThrow('p0', [])).toMatchObject(bad); // double begin
    expect(engine.commitThrow('p0', [1, 1, 1] as Die[])).toMatchObject(bad); // wrong count
    expect(engine.commitThrow('p0', [7, 1, 1, 1, 1] as unknown as Die[])).toMatchObject(bad);
    expect(engine.commitThrow('p0', [2, 3, 3, 5, 6])).toBeNull();

    expect(engine.beginThrow('p0', [0, 1, 2, 3, 4])).toMatchObject(bad); // keep-all → stand
  });

  it('blocks stand() while a throw is in flight', () => {
    const { engine } = makeEngine(makePlayers());
    engine.start();
    engine.beginThrow('p0', []);
    engine.commitThrow('p0', [4, 4, 4, 2, 1]);

    engine.beginThrow('p0', [0]);
    expect(engine.stand('p0')).toMatchObject(bad);
    expect(engine.commitThrow('p0', [4, 1, 2, 3, 5])).toBeNull();
  });

  it('leaves the throw in flight until commitThrow or forceStand', () => {
    const { engine, events } = makeEngine(makePlayers());
    engine.start();
    engine.beginThrow('p0', []);

    vi.advanceTimersByTime(120_000);
    expect(ofType(events, 'rolled')).toHaveLength(0);
    expect(ofType(events, 'forfeited')).toHaveLength(0);
    expect(engine.publicState().currentTurn?.throwing).toBe(true);
    expect(engine.commitThrow('p0', [6, 6, 6, 6, 6])).toBeNull();
  });

  it('auto-stands when commitThrow reaches the roll cap', () => {
    const { engine, events } = makeEngine(makePlayers());
    engine.start();

    engine.beginThrow('p0', []);
    engine.commitThrow('p0', [4, 4, 4, 2, 1]);
    engine.beginThrow('p0', [0]);
    engine.commitThrow('p0', [4, 1, 2, 3, 5]);
    engine.beginThrow('p0', [0]);
    engine.commitThrow('p0', [4, 2, 2, 6, 6]);
    engine.beginThrow('p0', [0]);
    engine.commitThrow('p0', [4, 2, 2, 5, 5]);
    engine.beginThrow('p0', [0]);
    engine.commitThrow('p0', [4, 2, 2, 3, 3]); // rollsUsed 5 = maxRolls

    expect(events.some((e) => e.type === 'stood' && e.playerId === 'p0')).toBe(true);
    expect(engine.currentTurnPlayerId).toBe('p1');
  });
});

describe('GameEngine: authoritative rest pose (ADR 005)', () => {
  const DICE: Die[] = [4, 4, 4, 2, 1];

  it('stores a valid pose on the turn, the rolled event, and the snapshot', () => {
    const { engine, events } = makeEngine(makePlayers());
    engine.start();
    const pose = restPoseFor(DICE);

    expect(roll(engine, 'p0', DICE, [], pose)).toBeNull();
    expect(ofType(events, 'rolled')[0]?.restPose).toEqual(pose);
    expect(engine.publicState().currentTurn?.restPose).toEqual(pose);
  });

  it('drops an invalid pose but never the throw', () => {
    const { engine, events } = makeEngine(makePlayers());
    engine.start();

    // Faces disagree with the reported values (e.g. dev face override).
    const wrongFaces = restPoseFor([6, 6, 6, 6, 6]);
    expect(roll(engine, 'p0', DICE, [], wrongFaces)).toBeNull();
    expect(ofType(events, 'rolled')[0]?.restPose).toBeNull();
    expect(engine.publicState().currentTurn?.dice).toEqual(DICE);

    // Off the table.
    const offTable = restPoseFor(DICE).map(
      (p) => [p[0] + 10, p[1], p[2], p[3], p[4], p[5], p[6]] as typeof p,
    );
    expect(roll(engine, 'p0', [4, 4, 4, 2, 2], [0, 1, 2], offTable)).toBeNull();
    expect(ofType(events, 'rolled')[1]?.restPose).toBeNull();
    expect(engine.publicState().currentTurn?.restPose).toBeNull();
  });

  it('a reroll without a pose clears the previous roll pose', () => {
    const { engine } = makeEngine(makePlayers());
    engine.start();
    expect(roll(engine, 'p0', DICE, [], restPoseFor(DICE))).toBeNull();
    expect(roll(engine, 'p0', [4, 4, 4, 6, 6], [0, 1, 2])).toBeNull();
    expect(engine.publicState().currentTurn?.restPose).toBeNull();
  });

  it('carries the pose into rollToBeat on a voluntary stand', () => {
    const { engine } = makeEngine(makePlayers());
    engine.start();
    const pose = restPoseFor(DICE);
    expect(roll(engine, 'p0', DICE, [], pose)).toBeNull();
    expect(engine.stand('p0')).toBeNull();

    const state = engine.publicState();
    expect(state.rollToBeat?.playerIds).toEqual(['p0']);
    expect(state.rollToBeat?.restPose).toEqual(pose);
    // The next player's fresh turn has no pose of its own.
    expect(state.currentTurn?.restPose).toBeNull();
  });

  it('carries the capping roll pose into rollToBeat on the roll-cap auto-stand', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();

    const hands: Die[][] = [
      [4, 4, 4, 2, 1],
      [4, 1, 2, 3, 5],
      [4, 2, 2, 6, 6],
      [4, 2, 2, 5, 5],
      [4, 2, 2, 3, 3],
    ];
    let lastPose: ReturnType<typeof restPoseFor> = [];
    hands.forEach((dice, i) => {
      lastPose = restPoseFor(dice);
      expect(roll(engine, 'p0', dice, i === 0 ? [] : [0], lastPose)).toBeNull();
    });

    // rollsUsed hit maxRolls → auto-stand; the final roll's pose must be the
    // one on rollToBeat (settleRoll sets it before stand runs).
    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(engine.publicState().rollToBeat?.restPose).toEqual(lastPose);
  });

  it('replayRolled restores the recorded pose', () => {
    const { engine } = makeEngine(makePlayers());
    engine.start();
    const pose = restPoseFor(DICE);
    expect(engine.replayRolled('p0', DICE, [], pose)).toBeNull();
    expect(engine.publicState().currentTurn?.restPose).toEqual(pose);
    // Legacy log lines replay as null.
    expect(engine.replayRolled('p0', [4, 4, 4, 6, 6], [0, 1, 2], null)).toBeNull();
    expect(engine.publicState().currentTurn?.restPose).toBeNull();
  });
});
