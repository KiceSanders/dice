import { DEFAULT_SETTINGS, type Die, type RoomSettings } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnginePlayer, GameEngine } from './engine.js';
import { bonusRoll, makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** No straight, no four-of-a-kind, no three 6s, no Yahtzee: pair of 6s. */
const JUNK: Die[] = [2, 3, 4, 6, 6];
/** Beats JUNK (three 5s) with none of the side-bet patterns. */
const BEATS_JUNK: Die[] = [5, 5, 5, 3, 2];

function stakesSettings(over: Partial<RoomSettings> = {}): RoomSettings {
  return {
    ...DEFAULT_SETTINGS,
    chipsPerRound: 1,
    betMultiplier: 1,
    autoIncrement: { enabled: false, everyRounds: 7 },
    ...over,
  };
}

const totalChips = (players: EnginePlayer[]) => players.reduce((sum, p) => sum + p.chips, 0);

/** Both players roll; the last one beats the leader, ending the round. */
const playRound = (engine: GameEngine, ids: string[]) => {
  for (const [i, id] of ids.entries()) {
    roll(engine, id, i === ids.length - 1 ? BEATS_JUNK : JUNK);
    if (i < ids.length - 1) engine.stand(id);
  }
  expect(engine.phase).toBe('roundEnd');
  vi.advanceTimersByTime(5_000);
};

describe('bet multiplier', () => {
  it('scales the initial round and sub-round antes even when auto-raise is off', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({ betMultiplier: 2 }),
    });
    engine.start();
    expect(players.map((p) => p.chips)).toEqual([98, 98]);

    roll(engine, 'p0', JUNK);
    engine.stand('p0');
    roll(engine, 'p1', JUNK);
    engine.stand('p1');

    // Configured ante 1 × multiplier 2 × 2^depth(1) = 4.
    expect(ofType(events, 'subRoundStarted')[0]).toMatchObject({ anteAmount: 4, depth: 1 });
    expect(players.map((p) => p.chips)).toEqual([94, 94]);
  });

  it('scales all four initial side bets and conserves chips', () => {
    const players = makePlayers([100, 100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({ betMultiplier: 2 }),
    });
    engine.start();
    const before = totalChips(players) + engine.pot + engine.classicPot;

    roll(engine, 'p0', JUNK);
    roll(engine, 'p0', [2, 3, 4, 5, 6]);
    expect(ofType(events, 'straightPaid')[0]).toMatchObject({ amountPerPlayer: 6, total: 12 });
    engine.stand('p0');

    roll(engine, 'p1', [4, 4, 4, 4, 2]);
    expect(ofType(events, 'classicDonated')[0]).toMatchObject({ amount: 2 });
    engine.stand('p1');

    roll(engine, 'p2', [5, 5, 5, 5, 5]);
    expect(ofType(events, 'firstRollYahtzeePaid')[0]).toMatchObject({
      amountPerPlayer: 8,
      total: 16,
    });
    bonusRoll(engine, 'p2', 5);
    expect(ofType(events, 'yahtzeeBonusPaid')[0]).toMatchObject({
      amountPerPlayer: 6,
      total: 12,
    });

    expect(totalChips(players) + engine.pot + engine.classicPot).toBe(before);
  });
});

describe('stakes auto-raise', () => {
  it('adds one chip to every configured stake after each period at multiplier 1', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({ autoIncrement: { enabled: true, everyRounds: 1 } }),
    });
    engine.start();
    expect(ofType(events, 'roundStarted')[0]!.antes[0]).toMatchObject({ amount: 1 });
    playRound(engine, ['p0', 'p1']);
    expect(ofType(events, 'stakesRaised')).toEqual([
      { type: 'stakesRaised', roundNumber: 2, incrementBy: 1 },
    ]);
    expect(ofType(events, 'roundStarted')[1]!.antes[0]).toMatchObject({ amount: 2 });

    const roller = engine.currentTurnPlayerId!;
    roll(engine, roller, [2, 3, 4, 5, 6]);
    expect(ofType(events, 'straightPaid')[0]).toMatchObject({ amountPerPlayer: 4 });
  });

  it('scales the initial stakes and adds multiplier-sized steps at multiplier 2', () => {
    const players = makePlayers([200, 200]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({
        betMultiplier: 2,
        autoIncrement: { enabled: true, everyRounds: 1 },
      }),
    });
    engine.start();
    expect(ofType(events, 'roundStarted')[0]!.antes[0]).toMatchObject({ amount: 2 });
    playRound(engine, ['p0', 'p1']);
    expect(ofType(events, 'stakesRaised')).toEqual([
      { type: 'stakesRaised', roundNumber: 2, incrementBy: 2 },
    ]);
    expect(ofType(events, 'roundStarted')[1]!.antes[0]).toMatchObject({ amount: 4 });

    const roller = engine.currentTurnPlayerId!;
    roll(engine, roller, [6, 6, 6, 6, 6]);
    expect(ofType(events, 'firstRollYahtzeePaid')[0]).toMatchObject({ amountPerPlayer: 10 });
  });

  it('does not add periodic steps when auto-raise is disabled', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({
        betMultiplier: 2,
        autoIncrement: { enabled: false, everyRounds: 1 },
      }),
    });
    engine.start();
    playRound(engine, ['p0', 'p1']);
    expect(ofType(events, 'stakesRaised')).toHaveLength(0);
    expect(ofType(events, 'roundStarted')[1]!.antes[0]).toMatchObject({ amount: 2 });
  });
});
