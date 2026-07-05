import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Die } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { GameEngine, type EngineEvent, type EnginePlayer } from './engine.js';

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

function makeEngine(players: EnginePlayer[], faces: Die[], settings = DEFAULT_SETTINGS) {
  const events: EngineEvent[] = [];
  const engine = new GameEngine(() => players, settings, (e) => events.push(e), {
    rng: rngFor(faces),
    turnTimeoutMs: 60_000,
    roundEndDelayMs: 5_000,
  });
  return { engine, events };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GameEngine: voluntary stand gating', () => {
  it('rejects standing while losing to the roll-to-beat; roll-cap auto-stand still fires', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, [
      6, 6, 1, 2, 3, /* p0 roll 1: two 6s */ 6, 4, 5, /* p0 reroll → three 6s in 2 rolls */
      5, 5, 1, 2, 3, /* p1 roll 1: two 5s — losing */
      5, 1, 2, /* p1 reroll (cap reached → forced stand while still losing) */
      6, 6, 6, 6, 1, /* p2 roll 1: four 6s */
    ]);
    engine.start();

    expect(engine.roll('p0', [])).toBeNull();
    expect(engine.roll('p0', [0, 1])).toBeNull();
    expect(engine.standVoluntarily('p0')).toBeNull(); // no roll-to-beat yet

    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(engine.roll('p1', [])).toBeNull();
    const blocked = engine.standVoluntarily('p1');
    expect(blocked?.code).toBe('STAND_NOT_ALLOWED');
    expect(engine.currentTurnPlayerId).toBe('p1'); // turn did not advance

    // Second roll hits the roll cap — the internal auto-stand bypasses the gate.
    expect(engine.roll('p1', [0, 1])).toBeNull();
    expect(engine.currentTurnPlayerId).toBe('p2');

    expect(engine.roll('p2', [])).toBeNull();
    expect(engine.standVoluntarily('p2')).toBeNull(); // beating the roll-to-beat
  });

  it('allows standing on a beat and on a full tie (tie starts the sub-round)', () => {
    const players = makePlayers();
    const { engine, events } = makeEngine(players, [
      4, 4, 4, 1, 2, /* p0 roll 1: three 4s */ 3, 5, /* p0 reroll → three 4s in 2 rolls */
      4, 4, 4, 1, 2, /* p1 roll 1: three 4s in 1 roll — beats p0 on fewer rolls */
      4, 4, 4, 2, 1, /* p2 roll 1: three 4s in 1 roll — full tie with p1 */
    ]);
    engine.start();

    expect(engine.roll('p0', [])).toBeNull();
    expect(engine.roll('p0', [0, 1, 2])).toBeNull();
    expect(engine.standVoluntarily('p0')).toBeNull();

    expect(engine.roll('p1', [])).toBeNull();
    expect(engine.standVoluntarily('p1')).toBeNull(); // strictly better (fewer rolls)

    expect(engine.roll('p2', [])).toBeNull();
    expect(engine.standVoluntarily('p2')).toBeNull(); // full tie — allowed

    const subRound = events.find((e) => e.type === 'subRoundStarted');
    expect(subRound).toBeDefined();
  });

  it('forceStand bypasses the gate for timeouts/disconnects/kicks', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, [
      6, 6, 1, 2, 3, /* p0 roll 1 */ 6, 4, 5, /* p0 reroll → three 6s */
      5, 5, 1, 2, 3, /* p1 roll 1 — losing */
    ]);
    engine.start();

    expect(engine.roll('p0', [])).toBeNull();
    expect(engine.roll('p0', [0, 1])).toBeNull();
    expect(engine.standVoluntarily('p0')).toBeNull();

    expect(engine.roll('p1', [])).toBeNull();
    expect(engine.standVoluntarily('p1')?.code).toBe('STAND_NOT_ALLOWED');

    engine.forceStand('p1');
    expect(engine.currentTurnPlayerId).toBe('p2');
  });

  it('still requires a first roll before standing', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, []);
    engine.start();
    expect(engine.standVoluntarily('p0')?.code).toBe('BAD_REQUEST');
  });
});
