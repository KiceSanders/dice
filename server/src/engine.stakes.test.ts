import { DEFAULT_SETTINGS, type Die, type RoomSettings } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnginePlayer } from './engine.js';
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

describe('bet multiplier', () => {
  it('scales the round ante', () => {
    const players = makePlayers([100, 100]);
    const { engine } = makeEngine(players, { settings: stakesSettings({ betMultiplier: 3 }) });
    engine.start();
    expect(players.map((p) => p.chips)).toEqual([97, 97]);
    expect(engine.pot).toBe(6);
  });

  it('scales the sub-round ante', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({ betMultiplier: 2 }),
    });
    engine.start();
    roll(engine, 'p0', JUNK);
    engine.stand('p0');
    roll(engine, 'p1', JUNK); // full tie → sub-round
    engine.stand('p1');

    // Base ante 1 × multiplier 2 × 2^depth(1) = 4 per tied player.
    expect(ofType(events, 'subRoundStarted')[0]).toMatchObject({ anteAmount: 4, depth: 1 });
    expect(players.map((p) => p.chips)).toEqual([94, 94]);
  });

  it('scales every instant side bet, zero-sum against stacks', () => {
    const players = makePlayers([100, 100, 100]);
    const settings = stakesSettings({ betMultiplier: 2 });
    const { engine, events } = makeEngine(players, { settings });
    engine.start();
    const before = totalChips(players) + engine.pot + engine.classicPot;

    // p0: straight → 3 × 2 = 6 per player. Two rolls so the round cap allows
    // p2 a second (non-first) roll below.
    roll(engine, 'p0', JUNK);
    roll(engine, 'p0', [2, 3, 4, 5, 6]);
    expect(ofType(events, 'straightPaid')[0]).toMatchObject({ amountPerPlayer: 6, total: 12 });
    engine.stand('p0');

    // p1: first-roll four of a kind donates 1 × 2 = 2 to the classic pot.
    roll(engine, 'p1', [4, 4, 4, 4, 2]);
    expect(ofType(events, 'classicDonated')[0]).toMatchObject({ amount: 2 });
    engine.stand('p1');

    // p2: later-roll Yahtzee (no first-roll payout), bonus match → 3 × 2 = 6 per player.
    roll(engine, 'p2', JUNK);
    roll(engine, 'p2', [5, 5, 5, 5, 5]);
    bonusRoll(engine, 'p2', 5);
    expect(ofType(events, 'firstRollYahtzeePaid')).toHaveLength(0);
    expect(ofType(events, 'yahtzeeBonusPaid')[0]).toMatchObject({ amountPerPlayer: 6, total: 12 });

    expect(totalChips(players) + engine.pot + engine.classicPot).toBe(before);
  });

  it('scales the first-roll Yahtzee payout', () => {
    const players = makePlayers([100, 100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({ betMultiplier: 3 }),
    });
    engine.start();

    // 4 × 3 = 12 per player.
    roll(engine, 'p0', [6, 6, 6, 6, 1]);
    bonusRoll(engine, 'p0', 2); // bonus miss — only the first-roll payout fires
    expect(ofType(events, 'firstRollYahtzeePaid')[0]).toMatchObject({
      amountPerPlayer: 12,
      total: 24,
    });
  });
});

describe('auto-increment', () => {
  const playRound = (engine: ReturnType<typeof makeEngine>['engine'], ids: string[]) => {
    for (const [i, id] of ids.entries()) {
      roll(engine, id, i === ids.length - 1 ? BEATS_JUNK : JUNK);
      if (i < ids.length - 1) engine.stand(id);
    }
    expect(engine.phase).toBe('roundEnd');
    vi.advanceTimersByTime(5_000);
  };

  it('bumps the effective multiplier every everyRounds rounds', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({ autoIncrement: { enabled: true, everyRounds: 2 } }),
    });
    engine.start();
    expect(ofType(events, 'roundStarted')[0]!.antes[0]).toMatchObject({ amount: 1 });

    playRound(engine, ['p0', 'p1']); // → round 2, still ×1
    expect(ofType(events, 'roundStarted')[1]!.antes[0]).toMatchObject({ amount: 1 });

    playRound(engine, ['p1', 'p0']); // → round 3, ×2
    expect(engine.roundNumber).toBe(3);
    expect(ofType(events, 'roundStarted')[2]!.antes[0]).toMatchObject({ amount: 2 });
  });

  it('scales instant bets in later rounds and stacks on the base multiplier', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({
        betMultiplier: 2,
        autoIncrement: { enabled: true, everyRounds: 1 },
      }),
    });
    engine.start();
    playRound(engine, ['p0', 'p1']); // → round 2: effective multiplier 2 × 2 = 4

    roll(engine, engine.currentTurnPlayerId!, [2, 3, 4, 5, 6]);
    expect(ofType(events, 'straightPaid')[0]).toMatchObject({ amountPerPlayer: 12 });
  });
});
