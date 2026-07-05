import type { Die } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THROW_TIMEOUT_MS } from './engine.js';
import { makeEngine, makePlayers, ofType } from './engine.testkit.js';

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

  it('forfeits the turn when the first throw result never arrives', () => {
    const { engine, events } = makeEngine(makePlayers());
    engine.start();
    engine.beginThrow('p0', []);

    vi.advanceTimersByTime(THROW_TIMEOUT_MS);
    // No server rng exists to synthesize a roll (ADR 004): the turn is forfeited.
    expect(ofType(events, 'rolled')).toHaveLength(0);
    expect(ofType(events, 'forfeited')).toMatchObject([{ playerId: 'p0' }]);
    expect(engine.currentTurnPlayerId).toBe('p1');
    // A late physics result is rejected; the turn already moved on.
    expect(engine.commitThrow('p0', [6, 6, 6, 6, 6])).toMatchObject({ code: 'NOT_YOUR_TURN' });
  });

  it('stands on already-settled dice when a reroll result never arrives', () => {
    const { engine, events } = makeEngine(makePlayers());
    engine.start();
    engine.beginThrow('p0', []);
    engine.commitThrow('p0', [4, 4, 4, 2, 1]);
    engine.beginThrow('p0', [0, 1, 2]);

    vi.advanceTimersByTime(THROW_TIMEOUT_MS);
    // The abandoned reroll falls back to the previously settled dice.
    expect(ofType(events, 'stood')).toMatchObject([{ playerId: 'p0', dice: [4, 4, 4, 2, 1] }]);
    expect(engine.currentTurnPlayerId).toBe('p1');
  });

  it('turn timeout during a pending first throw forfeits cleanly', () => {
    const { engine, events } = makeEngine(makePlayers(), {
      throwTimeoutMs: 120_000, // keep the throw pending past the 60s turn timer
    });
    engine.start();
    engine.beginThrow('p0', []);

    vi.advanceTimersByTime(60_000);
    // forceStand abandoned the throw; with no settled dice the turn is forfeited.
    expect(ofType(events, 'forfeited')).toMatchObject([{ playerId: 'p0' }]);
    expect(engine.currentTurnPlayerId).toBe('p1');
    // The abandoned throw is gone: p1 has no throw in flight to commit.
    expect(engine.commitThrow('p1', [1, 1, 1, 1, 1])).toMatchObject(bad);
  });

  it('auto-stands when commitThrow reaches the roll cap', () => {
    const { engine, events } = makeEngine(makePlayers());
    engine.start();

    engine.beginThrow('p0', []);
    engine.commitThrow('p0', [4, 4, 4, 2, 1]);
    engine.beginThrow('p0', [0]);
    engine.commitThrow('p0', [4, 1, 2, 3, 5]);
    engine.beginThrow('p0', [0]);
    engine.commitThrow('p0', [4, 2, 2, 6, 6]); // rollsUsed 3 = maxRolls

    expect(events.some((e) => e.type === 'stood' && e.playerId === 'p0')).toBe(true);
    expect(engine.currentTurnPlayerId).toBe('p1');
  });
});
