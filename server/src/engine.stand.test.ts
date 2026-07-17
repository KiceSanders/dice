import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bonusRoll, makeEngine, makePlayers, roll } from './engine.testkit.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GameEngine: voluntary stand gating', () => {
  it('rejects standing while losing to the roll-to-beat; roll-cap auto-stand still fires', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p0', [6, 6, 1, 2, 3])).toBeNull();
    expect(roll(engine, 'p0', [6, 6, 6, 4, 5], [0, 1])).toBeNull(); // three 6s in 2 rolls
    expect(engine.standVoluntarily('p0')).toBeNull(); // no roll-to-beat yet

    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(roll(engine, 'p1', [5, 5, 1, 2, 4])).toBeNull(); // losing to p0
    const blocked = engine.standVoluntarily('p1');
    expect(blocked?.code).toBe('STAND_NOT_ALLOWED');
    expect(engine.currentTurnPlayerId).toBe('p1'); // turn did not advance

    // Second roll hits the roll cap — the internal auto-stand bypasses the gate.
    expect(roll(engine, 'p1', [5, 5, 2, 3, 4], [0, 1])).toBeNull();
    expect(engine.currentTurnPlayerId).toBe('p2');

    expect(roll(engine, 'p2', [6, 6, 6, 6, 1])).toBeNull();
    expect(bonusRoll(engine, 'p2', 3)).toBeNull(); // quint owes its bonus die first
    expect(engine.currentTurnPlayerId).not.toBe('p2'); // bonus resolution auto-stands
  });

  it('allows standing on a beat and on a full tie (tie starts the sub-round)', () => {
    const players = makePlayers();
    const { engine, events } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p0', [4, 4, 4, 1, 2])).toBeNull();
    expect(roll(engine, 'p0', [4, 4, 4, 3, 5], [0, 1, 2])).toBeNull(); // three 4s in 2 rolls
    expect(engine.standVoluntarily('p0')).toBeNull();
    expect(engine.publicState().rollToBeat?.playerIds).toEqual(['p0']);

    expect(roll(engine, 'p1', [4, 4, 4, 3, 5])).toBeNull(); // same hand in 1 roll — beats p0
    expect(engine.standVoluntarily('p1')).toBeNull();
    expect(engine.publicState().rollToBeat?.playerIds).toEqual(['p1']);

    expect(roll(engine, 'p2', [4, 4, 4, 5, 3])).toBeNull(); // full tie with p1
    expect(engine.standVoluntarily('p2')).toBeNull(); // full tie — allowed

    // Round resolves into a sub-round (clears rollToBeat); leaders were p1 + p2.
    const subRound = events.find((e) => e.type === 'subRoundStarted');
    expect(subRound).toBeDefined();
    expect(subRound && subRound.type === 'subRoundStarted' && subRound.tiedPlayerIds).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('appends a mid-round tier to rollToBeat.playerIds', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p0', [5, 5, 2, 3, 4])).toBeNull();
    expect(roll(engine, 'p0', [5, 5, 5, 2, 3], [0, 1])).toBeNull(); // three 5s in 2
    expect(engine.standVoluntarily('p0')).toBeNull();
    expect(engine.publicState().rollToBeat?.playerIds).toEqual(['p0']);

    // Matching hand in the same rollsUsed — second roll hits the round cap and
    // auto-stands, appending p1 while p2 still has a turn.
    expect(roll(engine, 'p1', [5, 5, 2, 3, 4])).toBeNull();
    expect(roll(engine, 'p1', [5, 5, 5, 2, 4], [0, 1])).toBeNull();
    expect(engine.publicState().rollToBeat?.playerIds).toEqual(['p0', 'p1']);
    expect(engine.currentTurnPlayerId).toBe('p2');
  });

  it('forceStand bypasses the gate for disconnects/kicks', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p0', [6, 6, 1, 2, 3])).toBeNull();
    expect(roll(engine, 'p0', [6, 6, 6, 4, 5], [0, 1])).toBeNull();
    expect(engine.standVoluntarily('p0')).toBeNull();

    expect(roll(engine, 'p1', [5, 5, 1, 2, 4])).toBeNull();
    expect(engine.standVoluntarily('p1')?.code).toBe('STAND_NOT_ALLOWED');

    engine.forceStand('p1');
    expect(engine.currentTurnPlayerId).toBe('p2');
  });

  it('still requires a first roll before standing', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();
    expect(engine.standVoluntarily('p0')?.code).toBe('BAD_REQUEST');
  });

  it('auto-stands the last player once they beat the roll-to-beat', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p0', [4, 4, 4, 2, 3])).toBeNull();
    expect(engine.standVoluntarily('p0')).toBeNull();

    expect(roll(engine, 'p1', [5, 5, 5, 1, 2])).toBeNull(); // four 5s — already won
    expect(engine.phase).toBe('roundEnd');
    expect(events.find((e) => e.type === 'stood' && e.playerId === 'p1')).toBeDefined();
    expect(events.find((e) => e.type === 'roundEnded')).toMatchObject({
      type: 'roundEnded',
      winnerId: 'p1',
    });
  });

  it('does not auto-stand a non-last player who beats the roll-to-beat', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p0', [3, 3, 2, 4, 5])).toBeNull();
    expect(roll(engine, 'p0', [3, 3, 3, 2, 4], [0, 1])).toBeNull(); // three 3s in 2 → cap 2
    expect(engine.standVoluntarily('p0')).toBeNull();

    expect(roll(engine, 'p1', [4, 4, 4, 1, 2])).toBeNull(); // beats, but p2 still to act
    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(engine.standVoluntarily('p1')).toBeNull(); // voluntary still works
    expect(engine.currentTurnPlayerId).toBe('p2');
  });

  it('lets the last player keep rolling on a mere tie', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();

    // First stander sets a high roll cap; a later leader resets roll-to-beat
    // without lowering the cap, leaving the last player room to keep rolling.
    expect(roll(engine, 'p0', [3, 3, 2, 4, 5])).toBeNull();
    expect(roll(engine, 'p0', [3, 3, 3, 2, 4], [0, 1])).toBeNull();
    expect(roll(engine, 'p0', [3, 3, 3, 5, 6], [0, 1, 2])).toBeNull(); // three 3s in 3
    expect(engine.standVoluntarily('p0')).toBeNull();

    expect(roll(engine, 'p1', [4, 4, 4, 2, 5])).toBeNull(); // three 4s in 1 — new leader
    expect(engine.standVoluntarily('p1')).toBeNull();

    expect(roll(engine, 'p2', [4, 4, 4, 5, 2])).toBeNull(); // full tie — may keep rolling
    expect(engine.currentTurnPlayerId).toBe('p2');
    expect(engine.phase).toBe('playing');
    expect(roll(engine, 'p2', [5, 5, 5, 1, 2])).toBeNull(); // full reroll beats → auto-stand
    expect(engine.phase).toBe('roundEnd');
  });
});
