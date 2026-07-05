import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@dice/shared';
import type { EngineEvent } from './engine.js';
import { makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

const lastRoundEnd = (events: EngineEvent[]) => ofType(events, 'roundEnded').at(-1)!;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GameEngine: full scripted round', () => {
  it('plays a 3-player round, collects antes, awards the pot', () => {
    const players = makePlayers();
    const { engine, events } = makeEngine(players);
    engine.start();

    // Antes collected.
    expect(players.every((p) => p.chips === 99)).toBe(true);
    expect(engine.pot).toBe(3);
    expect(engine.currentTurnPlayerId).toBe('p0');

    // p0: rolls three 4s then keeps them → 4,4,4,5,2 in 2 rolls.
    expect(roll(engine, 'p0', [4, 4, 4, 2, 1])).toBeNull();
    expect(roll(engine, 'p0', [4, 4, 4, 5, 2], [0, 1, 2])).toBeNull();
    expect(engine.stand('p0')).toBeNull();

    // p1: capped at 2 rolls; rolls junk (not a straight), stands.
    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(roll(engine, 'p1', [2, 2, 3, 4, 5])).toBeNull();
    expect(engine.stand('p1')).toBeNull();

    // p2: four 6s + wild first roll, stands — wins.
    expect(engine.currentTurnPlayerId).toBe('p2');
    expect(roll(engine, 'p2', [6, 6, 6, 6, 1])).toBeNull();
    expect(engine.stand('p2')).toBeNull();

    const end = lastRoundEnd(events);
    expect(end.winnerId).toBe('p2');
    expect(end.potWon).toBe(3);
    expect(players[2]!.chips).toBe(102);
    expect(engine.phase).toBe('roundEnd');
  });

  it('next round starts after the delay, rotated left of the winner', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();
    roll(engine, 'p0', [6, 6, 6, 6, 6]); // five 6s, wins
    engine.stand('p0');
    roll(engine, 'p1', [1, 1, 2, 3, 4]);
    engine.stand('p1');
    roll(engine, 'p2', [1, 1, 2, 3, 5]);
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
    const { engine } = makeEngine(players);
    engine.start();
    roll(engine, 'p0', [3, 3, 1, 1, 1]);
    engine.stand('p0'); // cap is now 1
    expect(engine.publicState().currentTurn?.rollCap).toBe(1);

    // p1's single roll auto-stands (cap reached).
    expect(roll(engine, 'p1', [6, 6, 6, 6, 6])).toBeNull();
    expect(engine.currentTurnPlayerId).toBe('p2');
  });

  it('first player is capped by settings.maxRolls', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players, { settings: { ...DEFAULT_SETTINGS, maxRolls: 3 } });
    engine.start();
    roll(engine, 'p0', [1, 2, 3, 1, 2]);
    roll(engine, 'p0', [4, 5, 4, 1, 6]);
    roll(engine, 'p0', [2, 2, 6, 3, 1]); // 3rd roll → auto-stand
    expect(engine.currentTurnPlayerId).toBe('p1');
  });
});

describe('GameEngine: keep validation', () => {
  it('rejects keeps on the first roll, un-keeping, and bad indices', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p0', [4, 4, 4, 2, 1], [0])).toMatchObject({ code: 'BAD_REQUEST' });
    expect(roll(engine, 'p0', [4, 4, 4, 2, 1])).toBeNull();

    expect(roll(engine, 'p0', [4, 4, 4, 5, 5], [9])).toMatchObject({ code: 'BAD_REQUEST' });
    expect(roll(engine, 'p0', [4, 4, 4, 5, 5], [0, 0])).toMatchObject({ code: 'BAD_REQUEST' });
    expect(roll(engine, 'p0', [4, 4, 4, 5, 5], [0, 1, 2])).toBeNull();

    // Kept dice are locked: [0,1,2] must stay in the keep set.
    expect(roll(engine, 'p0', [4, 4, 4, 5, 5], [0, 1])).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'kept dice cannot be released',
    });
  });

  it('keeping all 5 dice is rejected — the client stands instead', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();
    roll(engine, 'p0', [6, 6, 6, 6, 1]);
    // Pre-ADR-004 a keep-all roll was an implicit stand; now beginThrow rejects it.
    expect(engine.beginThrow('p0', [0, 1, 2, 3, 4])).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'all dice kept — stand instead',
    });
    expect(engine.stand('p0')).toBeNull();
    expect(engine.currentTurnPlayerId).toBe('p1');
  });

  it('rejects out-of-turn actions and standing before rolling', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p1', [1, 2, 3, 4, 6])).toMatchObject({ code: 'NOT_YOUR_TURN' });
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
    const { engine, events } = makeEngine(players);
    engine.start();
    expect(engine.pot).toBe(2);

    roll(engine, 'p0', [6, 6, 6, 6, 6]);
    engine.stand('p0');
    expect(engine.currentTurnPlayerId).toBe('p2'); // p1 never gets a turn
    roll(engine, 'p2', [5, 5, 5, 5, 5]);
    engine.stand('p2');

    const end = lastRoundEnd(events);
    expect(end.scores.map((s) => s.playerId).sort()).toEqual(['p0', 'p2']);
    expect(players[1]!.chips).toBe(0); // untouched
  });

  it('ends the game when fewer than 2 players can ante', () => {
    const players = makePlayers([5, 0, 0]);
    const { engine, events } = makeEngine(players);
    engine.start();
    expect(engine.phase).toBe('ended');
    expect(events.some((e) => e.type === 'gameEnded')).toBe(true);
  });
});

describe('GameEngine: auto-stand paths', () => {
  it('turn timer expiry with no roll forfeits the turn (ADR 004: no server roll)', () => {
    const players = makePlayers();
    const { engine, events } = makeEngine(players);
    engine.start();
    expect(engine.currentTurnPlayerId).toBe('p0');

    vi.advanceTimersByTime(60_000);
    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(ofType(events, 'rolled')).toHaveLength(0);
    expect(ofType(events, 'forfeited')).toMatchObject([{ playerId: 'p0' }]);
  });

  it("a disconnected player's turn is forfeited immediately", () => {
    const players = makePlayers();
    players[1]!.connected = false;
    const { engine, events } = makeEngine(players);
    engine.start();
    roll(engine, 'p0', [6, 6, 6, 6, 6]);
    engine.stand('p0');
    // p1 was skipped straight through to p2.
    expect(engine.currentTurnPlayerId).toBe('p2');
    expect(ofType(events, 'forfeited')).toMatchObject([{ playerId: 'p1' }]);
  });

  it('forceStand mid-turn (kick path) stands with current dice', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();
    roll(engine, 'p0', [4, 4, 1, 1, 2]);
    engine.forceStand('p0'); // kicked mid-turn
    expect(engine.currentTurnPlayerId).toBe('p1');
  });

  it('forceStand for a non-current player is a no-op', () => {
    const players = makePlayers();
    const { engine } = makeEngine(players);
    engine.start();
    engine.forceStand('p2');
    expect(engine.currentTurnPlayerId).toBe('p0');
  });
});
