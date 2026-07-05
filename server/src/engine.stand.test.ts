import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEngine, makePlayers, roll } from './engine.testkit.js';

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
    expect(engine.standVoluntarily('p2')).toBeNull(); // beating the roll-to-beat
  });

  it('allows standing on a beat and on a full tie (tie starts the sub-round)', () => {
    const players = makePlayers();
    const { engine, events } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p0', [4, 4, 4, 1, 2])).toBeNull();
    expect(roll(engine, 'p0', [4, 4, 4, 3, 5], [0, 1, 2])).toBeNull(); // three 4s in 2 rolls
    expect(engine.standVoluntarily('p0')).toBeNull();

    expect(roll(engine, 'p1', [4, 4, 4, 3, 5])).toBeNull(); // same hand in 1 roll — beats p0
    expect(engine.standVoluntarily('p1')).toBeNull();

    expect(roll(engine, 'p2', [4, 4, 4, 5, 3])).toBeNull(); // full tie with p1
    expect(engine.standVoluntarily('p2')).toBeNull(); // full tie — allowed

    const subRound = events.find((e) => e.type === 'subRoundStarted');
    expect(subRound).toBeDefined();
  });

  it('forceStand bypasses the gate for timeouts/disconnects/kicks', () => {
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
});
