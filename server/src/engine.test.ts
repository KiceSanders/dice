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

const lastRoundEnd = (events: EngineEvent[]) =>
  events.filter((e) => e.type === 'roundEnded').at(-1) as Extract<
    EngineEvent,
    { type: 'roundEnded' }
  >;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GameEngine: full scripted round', () => {
  it('plays a 3-player round, collects antes, awards the pot', () => {
    const players = makePlayers();
    // p0: rolls three 4s then keeps them, ends with 4,4,4,2,1 → (3,4) in 2 rolls
    // p1: capped at 2 rolls; rolls junk, stands → (2,2)
    // p2: rolls 6,6,6,6,1 first roll and stands → (4,6) wins
    const { engine, events } = makeEngine(players, [
      4, 4, 4, 2, 1, /* p0 roll 1 */ 5, 2, /* p0 reroll idx 3,4 */
      2, 2, 3, 4, 5, /* p1 roll 1 — not a straight (2,2,3,4,5) */
      6, 6, 6, 6, 1, /* p2 roll 1 */
    ]);
    engine.start();

    // Antes collected.
    expect(players.every((p) => p.chips === 99)).toBe(true);
    expect(engine.pot).toBe(3);
    expect(engine.currentTurnPlayerId).toBe('p0');

    expect(engine.roll('p0', [])).toBeNull();
    expect(engine.roll('p0', [0, 1, 2])).toBeNull();
    expect(engine.stand('p0')).toBeNull();

    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(engine.roll('p1', [])).toBeNull();
    expect(engine.stand('p1')).toBeNull();

    expect(engine.currentTurnPlayerId).toBe('p2');
    expect(engine.roll('p2', [])).toBeNull();
    expect(engine.stand('p2')).toBeNull();

    const end = lastRoundEnd(events);
    expect(end.winnerId).toBe('p2');
    expect(end.potWon).toBe(3);
    expect(players[2]!.chips).toBe(102);
    expect(engine.phase).toBe('roundEnd');
  });

  it('next round starts after the delay, rotated left of the winner', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, [
      6, 6, 6, 6, 6, // p0 → five 6s, wins
      1, 1, 2, 3, 4, // p1
      1, 1, 2, 3, 5, // p2
      // round 2 first roll (p1 = left of winner p0)
      2, 2, 2, 2, 2,
    ]);
    engine.start();
    engine.roll('p0', []);
    engine.stand('p0');
    engine.roll('p1', []);
    engine.stand('p1');
    engine.roll('p2', []);
    engine.stand('p2');

    expect(engine.phase).toBe('roundEnd');
    vi.advanceTimersByTime(5_000);
    expect(engine.phase).toBe('playing');
    expect(engine.roundNumber).toBe(2);
    expect(engine.currentTurnPlayerId).toBe('p1'); // left of p0
  });
});

describe('GameEngine: roll-cap pressure', () => {
  it("first finisher's roll count caps everyone after", () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, [
      3, 3, 1, 1, 1, // p0 roll 1 → stands at 1 roll
      6, 6, 6, 6, 6, // p1 roll 1 → auto-stand at cap 1 despite maxRolls=3
      5, 5, 5, 5, 5, // p2 roll 1
    ]);
    engine.start();
    engine.roll('p0', []);
    engine.stand('p0'); // cap is now 1
    expect(engine.publicState().currentTurn?.rollCap).toBe(1);

    // p1's single roll auto-stands (cap reached).
    expect(engine.roll('p1', [])).toBeNull();
    expect(engine.currentTurnPlayerId).toBe('p2');
  });

  it('first player is capped by settings.maxRolls', () => {
    const players = makePlayers();
    const { engine } = makeEngine(
      players,
      [
        1, 2, 3, 1, 2, /* roll 1 */ 4, 5, 4, 1, 6, /* roll 2 (keep none) */ 2, 2, 6, 3, 1, /* roll 3 */
        6, 6, 6, 6, 6, /* p1 */ 5, 5, 5, 5, 5 /* p2 */,
      ],
      { ...DEFAULT_SETTINGS, maxRolls: 3 },
    );
    engine.start();
    engine.roll('p0', []);
    engine.roll('p0', []);
    engine.roll('p0', []); // 3rd roll → auto-stand
    expect(engine.currentTurnPlayerId).toBe('p1');
  });
});

describe('GameEngine: keep validation', () => {
  it('rejects keeps on the first roll, un-keeping, and bad indices', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, [4, 4, 4, 2, 1, 5, 5]);
    engine.start();

    expect(engine.roll('p0', [0])).toMatchObject({ code: 'BAD_REQUEST' });
    expect(engine.roll('p0', [])).toBeNull();

    expect(engine.roll('p0', [9])).toMatchObject({ code: 'BAD_REQUEST' });
    expect(engine.roll('p0', [0, 0])).toMatchObject({ code: 'BAD_REQUEST' });
    expect(engine.roll('p0', [0, 1, 2])).toBeNull();

    // Kept dice are locked: [0,1,2] must stay in the keep set.
    expect(engine.roll('p0', [0, 1])).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'kept dice cannot be released',
    });
  });

  it('keeping all 5 dice is a stand', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, [
      6, 6, 6, 6, 1, /* p0 roll 1 */ 1, 1, 2, 3, 4, /* p1 */ 1, 1, 2, 3, 5 /* p2 */,
    ]);
    engine.start();
    engine.roll('p0', []);
    expect(engine.roll('p0', [0, 1, 2, 3, 4])).toBeNull();
    expect(engine.currentTurnPlayerId).toBe('p1'); // p0 stood
  });

  it('rejects out-of-turn actions and standing before rolling', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, [1, 2, 3, 4, 6]);
    engine.start();

    expect(engine.roll('p1', [])).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect(engine.stand('p1')).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect(engine.stand('p0')).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'roll before standing',
    });
  });
});

describe('GameEngine: sit-outs and game end', () => {
  it('broke players sit out the round but keep their seats', () => {
    const players = makePlayers([100, 0, 100]); // p1 cannot ante
    const { engine, events } = makeEngine(players, [
      6, 6, 6, 6, 6, // p0
      5, 5, 5, 5, 5, // p2 (p1 skipped)
    ]);
    engine.start();
    expect(engine.pot).toBe(2);

    engine.roll('p0', []);
    engine.stand('p0');
    expect(engine.currentTurnPlayerId).toBe('p2'); // p1 never gets a turn
    engine.roll('p2', []);
    engine.stand('p2');

    const end = lastRoundEnd(events);
    expect(end.scores.map((s) => s.playerId).sort()).toEqual(['p0', 'p2']);
    expect(players[1]!.chips).toBe(0); // untouched
  });

  it('ends the game when fewer than 2 players can ante', () => {
    const players = makePlayers([5, 0, 0]);
    const { engine, events } = makeEngine(players, []);
    engine.start();
    expect(engine.phase).toBe('ended');
    expect(events.some((e) => e.type === 'gameEnded')).toBe(true);
  });
});

describe('GameEngine: auto-stand paths', () => {
  it('turn timer expiry force-stands with an auto-roll', () => {
    const players = makePlayers();
    const { engine, events } = makeEngine(players, [
      3, 3, 3, 1, 2, // p0 auto-roll on timeout
      6, 6, 6, 6, 6, // p1
      5, 5, 5, 5, 5, // p2
    ]);
    engine.start();
    expect(engine.currentTurnPlayerId).toBe('p0');

    vi.advanceTimersByTime(60_000);
    expect(engine.currentTurnPlayerId).toBe('p1');
    const rolled = events.find((e) => e.type === 'rolled');
    expect(rolled).toMatchObject({ playerId: 'p0', rollNumber: 1 });
  });

  it("a disconnected player's turn is auto-stood immediately", () => {
    const players = makePlayers();
    players[1]!.connected = false;
    const { engine } = makeEngine(players, [
      6, 6, 6, 6, 6, // p0
      1, 2, 2, 3, 4, // p1 auto-roll
      5, 5, 5, 5, 5, // p2
    ]);
    engine.start();
    engine.roll('p0', []);
    engine.stand('p0');
    // p1 was skipped straight through to p2.
    expect(engine.currentTurnPlayerId).toBe('p2');
  });

  it('forceStand mid-turn (kick path) stands with current dice', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, [
      4, 4, 1, 1, 2, // p0 roll 1
      6, 6, 6, 6, 6, // p1
      5, 5, 5, 5, 5, // p2
    ]);
    engine.start();
    engine.roll('p0', []);
    engine.forceStand('p0'); // kicked mid-turn
    expect(engine.currentTurnPlayerId).toBe('p1');
  });

  it('forceStand for a non-current player is a no-op', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, [1, 2, 3, 4, 6]);
    engine.start();
    engine.forceStand('p2');
    expect(engine.currentTurnPlayerId).toBe('p0');
  });
});
