import { type BetALotSettings, DEFAULT_BETALOT_SETTINGS, type Die } from '@dice/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnginePlayer } from '../../engine.js';
import { BetALotEngine, type BetALotEvent } from './engine.js';

function makeEngine(
  settings: BetALotSettings = { ...DEFAULT_BETALOT_SETTINGS, afterRollDelayMs: 0 },
  autoCall = true,
) {
  const players: EnginePlayer[] = [
    { id: 'a', chips: 100, seat: 0, connected: true },
    { id: 'b', chips: 100, seat: 1, connected: true },
  ];
  const events: BetALotEvent[] = [];
  const engine = new BetALotEngine(
    () => players,
    settings,
    (event) => events.push(event),
  );
  engine.start();
  if (autoCall) expect(engine.call('a', 6)).toBeNull();
  return { engine, players, events };
}

function roll(engine: BetALotEngine, playerId: string, dice: Die[]) {
  expect(engine.beginThrow(playerId)).toBeNull();
  expect(engine.commitThrow(playerId, dice)).toBeNull();
}

describe('BetALotEngine', () => {
  afterEach(() => vi.useRealTimers());

  it('requires the opener to call before rung one can start', () => {
    const { engine } = makeEngine({ ...DEFAULT_BETALOT_SETTINGS, afterRollDelayMs: 0 }, false);
    expect(engine.beginThrow('a')).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'call a face before the opening throw',
    });
    expect(engine.call('a', 4)).toBeNull();
    expect(engine.beginThrow('a')).toBeNull();
  });

  it('requires a strictly higher score and makes ties lose', () => {
    const { engine, players, events } = makeEngine();
    roll(engine, 'a', [3]);
    roll(engine, 'b', [1, 2]);
    expect(players[0]?.chips).toBe(105);
    expect(players[1]?.chips).toBe(95);
    expect(events.some((event) => event.type === 'roundEnded' && event.winnerId === 'a')).toBe(
      true,
    );
    expect(engine.publicState().roundHistory).toEqual([{ roundNumber: 1, winnerId: 'a' }]);
  });

  it('keeps the authoritative round history newest-first and capped at ten', () => {
    const { engine } = makeEngine();

    for (let round = 1; round <= 11; round += 1) {
      const opener = engine.publicState().openerId;
      const opponent = opener === 'a' ? 'b' : 'a';
      if (round > 1) expect(engine.call(opener, 6)).toBeNull();
      roll(engine, opener, [3]);
      roll(engine, opponent, [1, 2]);
      if (round < 11) engine.continueRound();
    }

    expect(engine.publicState().roundHistory).toHaveLength(10);
    expect(engine.publicState().roundHistory.map((entry) => entry.roundNumber)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
  });

  it('pays a successful opening call before the ladder continues', () => {
    const { engine, players } = makeEngine();
    expect(engine.call('a', 4)).toBeNull();
    roll(engine, 'a', [4]);
    expect(players[0]?.chips).toBe(103);
    expect(players[1]?.chips).toBe(97);
  });

  it('moves a seven contribution into the persistent pot and awards a twenty-one', () => {
    const { engine, players } = makeEngine();
    expect(engine.call('a', 5)).toBeNull();
    roll(engine, 'a', [6]);
    roll(engine, 'b', [3, 4]);
    expect(engine.publicState().sevensPot).toBe(1);
    expect(players[0]?.chips).toBe(101);
    expect(players[1]?.chips).toBe(98);
    roll(engine, 'a', [2, 3, 4]);
    roll(engine, 'b', [6, 6, 4, 5]);
    roll(engine, 'a', [5, 5, 5, 4, 4]);
    roll(engine, 'b', [4, 5, 5, 5, 5, 5]);
    expect(engine.publicState().sevensPot).toBe(0);
  });

  it('offers an extra die after three matching dice and pays a match', () => {
    const { engine, players, events } = makeEngine();
    roll(engine, 'a', [2]);
    roll(engine, 'b', [2, 2]);
    roll(engine, 'a', [4, 4, 4]);
    expect(engine.beginExtraThrow('a')).toBeNull();
    expect(engine.commitExtraThrow('a', 4)).toBeNull();
    expect(players[0]?.chips).toBe(107);
    expect(events.some((event) => event.type === 'extraRolled' && event.matched)).toBe(true);
  });

  it('holds all consequences and the next rung behind the configured reveal delay', () => {
    vi.useFakeTimers();
    const { engine, players, events } = makeEngine({
      ...DEFAULT_BETALOT_SETTINGS,
      afterRollDelayMs: 2_000,
    });

    expect(engine.beginThrow('a')).toBeNull();
    expect(engine.commitThrow('a', [3])).toBeNull();
    expect(engine.publicState()).toMatchObject({
      currentPlayerId: 'a',
      resolving: true,
    });
    expect(players.map((player) => player.chips)).toEqual([100, 100]);
    expect(events.filter((event) => event.type === 'rolled')).toHaveLength(1);

    vi.advanceTimersByTime(1_999);
    expect(engine.currentTurnPlayerId).toBe('a');
    vi.advanceTimersByTime(1);
    expect(engine.publicState()).toMatchObject({
      currentPlayerId: 'b',
      currentDiceCount: 2,
      resolving: false,
    });
  });

  it('plays all six rungs, uses the distinct rung-six payout, and alternates openers', () => {
    const settings = {
      ...DEFAULT_BETALOT_SETTINGS,
      afterRollDelayMs: 0,
      successfulRungSixPayout: 9,
    };
    const { engine, players, events } = makeEngine(settings);
    const startingTotal = players.reduce((sum, player) => sum + player.chips, 0);

    roll(engine, 'a', [2]);
    roll(engine, 'b', [2, 2]);
    roll(engine, 'a', [1, 2, 3]);
    roll(engine, 'b', [1, 1, 2, 3]);
    roll(engine, 'a', [1, 1, 2, 2, 3]);
    roll(engine, 'b', [1, 1, 2, 2, 3, 3]);

    expect(events.at(-2)).toMatchObject({
      type: 'roundEnded',
      winnerId: 'b',
      loserId: 'a',
      amount: 9,
    });
    expect(
      players.reduce((sum, player) => sum + player.chips, engine.publicState().sevensPot),
    ).toBe(startingTotal);

    engine.continueRound();
    expect(engine.publicState()).toMatchObject({
      roundNumber: 2,
      openerId: 'b',
      currentPlayerId: 'b',
      currentDiceCount: 1,
    });
  });

  it('ends the game immediately when a side bet empties a stack', () => {
    const { engine, players, events } = makeEngine();
    players[1]!.chips = 2;

    roll(engine, 'a', [2]);
    roll(engine, 'b', [1, 2]);
    roll(engine, 'a', [1, 2, 3]);

    expect(players[1]?.chips).toBe(0);
    expect(engine.phase).toBe('ended');
    expect(events).toContainEqual({
      type: 'gameEnded',
      reason: 'a player ran out of chips',
    });
  });
});
