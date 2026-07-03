import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Die } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import {
  GameEngine,
  THROW_TIMEOUT_MS,
  type EngineEvent,
  type EngineOptions,
  type EnginePlayer,
} from './engine.js';

/** Rng stub yielding the given die faces in order. */
function rngFor(faces: Die[]) {
  let i = 0;
  return () => {
    const face = faces[i++];
    if (face === undefined) throw new Error(`rng exhausted after ${i - 1} dice`);
    return (face - 1) / 6;
  };
}

function makePlayers(chips = [100, 100, 100]): EnginePlayer[] {
  return chips.map((c, i) => ({ id: `p${i}`, chips: c, seat: i, connected: true }));
}

function makeEngine(players: EnginePlayer[], faces: Die[], opts: EngineOptions = {}) {
  const events: EngineEvent[] = [];
  const engine = new GameEngine(() => players, DEFAULT_SETTINGS, (e) => events.push(e), {
    rng: rngFor(faces),
    turnTimeoutMs: 60_000,
    roundEndDelayMs: 5_000,
    ...opts,
  });
  return { engine, events };
}

const bad = { code: 'BAD_REQUEST' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GameEngine: physics throws (ADR 004)', () => {
  it('first throw: beginThrow marks the turn, commitThrow applies client dice', () => {
    const { engine, events } = makeEngine(makePlayers(), []);
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
    const { engine } = makeEngine(makePlayers(), []);
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
    const { engine } = makeEngine(makePlayers(), []);
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

  it('blocks legacy roll() and stand() while a throw is in flight', () => {
    const { engine } = makeEngine(makePlayers(), []);
    engine.start();
    engine.beginThrow('p0', []);
    engine.commitThrow('p0', [4, 4, 4, 2, 1]);

    engine.beginThrow('p0', [0]);
    expect(engine.roll('p0', [0])).toMatchObject(bad);
    expect(engine.stand('p0')).toMatchObject(bad);
    expect(engine.commitThrow('p0', [4, 1, 2, 3, 5])).toBeNull();
  });

  it('falls back to a server rng roll when the result never arrives', () => {
    const { engine, events } = makeEngine(makePlayers(), [2, 2, 3, 4, 5]);
    engine.start();
    engine.beginThrow('p0', []);

    vi.advanceTimersByTime(THROW_TIMEOUT_MS);
    expect(events.find((e) => e.type === 'rolled')).toMatchObject({
      playerId: 'p0',
      dice: [2, 2, 3, 4, 5],
      rollNumber: 1,
    });
    expect(engine.publicState().currentTurn?.throwing).toBe(false);
    // A late physics result is rejected; the fallback roll already counted.
    expect(engine.commitThrow('p0', [6, 6, 6, 6, 6])).toMatchObject(bad);
    expect(engine.publicState().currentTurn?.rollsUsed).toBe(1);
  });

  it('auto-stands when commitThrow reaches the roll cap', () => {
    const { engine, events } = makeEngine(makePlayers(), []);
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

  it('turn timeout during a pending throw force-stands cleanly', () => {
    const { engine, events } = makeEngine(makePlayers(), [3, 3, 1, 1, 2], {
      throwTimeoutMs: 120_000, // keep the throw pending past the 60s turn timer
    });
    engine.start();
    engine.beginThrow('p0', []);

    vi.advanceTimersByTime(60_000);
    // forceStand abandoned the throw: rng-rolled once and stood.
    expect(events.find((e) => e.type === 'rolled')).toMatchObject({
      playerId: 'p0',
      dice: [3, 3, 1, 1, 2],
    });
    expect(events.some((e) => e.type === 'stood' && e.playerId === 'p0')).toBe(true);
    expect(engine.currentTurnPlayerId).toBe('p1');
    // The abandoned throw is gone: p1 has no throw in flight to commit.
    expect(engine.commitThrow('p1', [1, 1, 1, 1, 1])).toMatchObject(bad);
  });
});
