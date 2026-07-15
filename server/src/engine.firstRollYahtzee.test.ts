import type { Die, FirstRollYahtzeePayoutConfig, RoomSettings } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

const QUINT: Die[] = [6, 6, 6, 6, 6];
const WILD_QUINT: Die[] = [6, 6, 6, 1, 1];

function payoutSettings(over: Partial<FirstRollYahtzeePayoutConfig>): RoomSettings {
  return {
    ...DEFAULT_SETTINGS,
    firstRollYahtzeePayout: { ...DEFAULT_SETTINGS.firstRollYahtzeePayout, ...over },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('first-roll Yahtzee payout (instant zero-sum side payment)', () => {
  it('pays every other seated player immediately for a natural first-roll Yahtzee', () => {
    const players = makePlayers([100, 100, 100]);
    const before = players.reduce((sum, p) => sum + p.chips, 0);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 10 }),
    });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();

    expect(ofType(events, 'firstRollYahtzeePaid')).toEqual([
      {
        type: 'firstRollYahtzeePaid',
        playerId: 'p0',
        amountPerPlayer: 10,
        total: 20,
        payments: [
          { playerId: 'p1', amount: 10 },
          { playerId: 'p2', amount: 10 },
        ],
      },
    ]);
    expect(players.map((p) => p.chips)).toEqual([119, 89, 89]);
    expect(engine.pot).toBe(3);
    expect(players.reduce((sum, p) => sum + p.chips, 0) + engine.pot).toBe(before);
  });

  it('treats wild-composed Yahtzees as normal Yahtzees', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 7 }),
    });
    engine.start();

    expect(roll(engine, 'p0', WILD_QUINT)).toBeNull();
    expect(ofType(events, 'firstRollYahtzeePaid')[0]).toMatchObject({ total: 7 });
    expect(players.map((p) => p.chips)).toEqual([106, 92]);
  });

  it('does not pay a Yahtzee made after the first roll', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players);
    engine.start();

    expect(roll(engine, 'p0', [6, 6, 6, 6, 5])).toBeNull();
    expect(roll(engine, 'p0', QUINT, [0, 1, 2, 3])).toBeNull();
    expect(ofType(events, 'firstRollYahtzeePaid')).toHaveLength(0);
    // The first-roll four-of-a-kind donates to the Classic Pot; no Yahtzee payout fires.
    expect(players.map((p) => p.chips)).toEqual([98, 99]);
  });

  it('respects the toggle and reciprocal short-stack cap', () => {
    const players = makePlayers([100, 5, 100]);
    const before = players.reduce((sum, p) => sum + p.chips, 0);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 10 }),
    });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(ofType(events, 'firstRollYahtzeePaid')[0]).toMatchObject({
      total: 14,
      payments: [
        { playerId: 'p1', amount: 4 },
        { playerId: 'p2', amount: 10 },
      ],
    });
    expect(players.map((p) => p.chips)).toEqual([113, 0, 89]);
    expect(players.reduce((sum, p) => sum + p.chips, 0) + engine.pot).toBe(before);

    const disabled = makeEngine(makePlayers([100, 100]), {
      settings: payoutSettings({ enabled: false }),
    });
    disabled.engine.start();
    expect(roll(disabled.engine, 'p0', QUINT)).toBeNull();
    expect(ofType(disabled.events, 'firstRollYahtzeePaid')).toHaveLength(0);
  });

  it('replays the payout identically after crash recovery', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 10 }),
    });
    engine.start();

    expect(engine.replayRolled('p0', QUINT, [], null)).toBeNull();
    expect(ofType(events, 'firstRollYahtzeePaid')).toHaveLength(1);
    expect(players.map((p) => p.chips)).toEqual([109, 89]);
  });
});
