import { DEFAULT_SETTINGS, type Die, type RoomSettings } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnginePlayer, GameEngine } from './engine.js';
import { makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

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
    betMultiplier: 2,
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

describe('stakes auto-raise', () => {
  it('does not scale anything while auto-increment is off', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({ betMultiplier: 5 }),
    });
    engine.start();
    expect(players.map((p) => p.chips)).toEqual([99, 99]);
    playRound(engine, ['p0', 'p1']);
    expect(ofType(events, 'stakesRaised')).toHaveLength(0);
    expect(ofType(events, 'roundStarted')[1]!.antes[0]).toMatchObject({ amount: 1 });
  });

  it('multiplies the stored amounts at each boundary and emits stakesRaised', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({ autoIncrement: { enabled: true, everyRounds: 2 } }),
    });
    engine.start();
    playRound(engine, ['p0', 'p1']); // → round 2, no boundary yet
    expect(ofType(events, 'stakesRaised')).toHaveLength(0);
    expect(ofType(events, 'roundStarted')[1]!.antes[0]).toMatchObject({ amount: 1 });

    playRound(engine, ['p1', 'p0']); // → round 3, ×2 raise
    const raised = ofType(events, 'stakesRaised');
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ roundNumber: 3 });
    expect(raised[0]!.settings.chipsPerRound).toBe(2);
    expect(raised[0]!.settings.straightPayout.amountPerPlayer).toBe(6);
    expect(raised[0]!.settings.classicPot.donationAmount).toBe(2);
    expect(raised[0]!.settings.yahtzeeBonus.amountPerPlayer).toBe(6);
    expect(raised[0]!.settings.firstRollYahtzeePayout.amountPerPlayer).toBe(8);
    expect(ofType(events, 'roundStarted')[2]!.antes[0]).toMatchObject({ amount: 2 });
  });

  it('instant bets and sub-round antes use the raised stored values', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({ autoIncrement: { enabled: true, everyRounds: 1 } }),
    });
    engine.start();
    const before = totalChips(players) + engine.pot;
    playRound(engine, ['p0', 'p1']); // → round 2: amounts ×2

    // Straight now pays the raised 3 × 2 = 6 per player.
    const roller = engine.currentTurnPlayerId!;
    roll(engine, roller, [2, 3, 4, 5, 6]);
    expect(ofType(events, 'straightPaid')[0]).toMatchObject({ amountPerPlayer: 6 });
    engine.stand(roller);

    // The other player ties the straight's weak group → sub-round with the
    // raised ante: 2 × 2^1 = 4.
    const other = engine.currentTurnPlayerId!;
    roll(engine, other, [2, 3, 4, 5, 6]);
    engine.stand(other);
    expect(ofType(events, 'subRoundStarted')[0]).toMatchObject({ anteAmount: 4 });

    expect(totalChips(players) + engine.pot + engine.classicPot).toBe(before);
  });

  it('a manual edit between raises sticks; the next raise builds on it', () => {
    const players = makePlayers([100, 100]);
    const settings = stakesSettings({ autoIncrement: { enabled: true, everyRounds: 1 } });
    const { engine, events } = makeEngine(players, { settings });
    engine.start();
    playRound(engine, ['p0', 'p1']); // → round 2: ante raised to 2

    // Host lowers the ante back to 1 (and the raise interval stays).
    engine.updateSettings({ ...ofType(events, 'stakesRaised')[0]!.settings, chipsPerRound: 1 });
    playRound(engine, ['p1', 'p0']); // → round 3: raise builds on the edit → 2, not 4
    expect(ofType(events, 'roundStarted')[2]!.antes[0]).toMatchObject({ amount: 2 });
  });

  it('betMultiplier 1 keeps auto-increment a no-op', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: stakesSettings({
        betMultiplier: 1,
        autoIncrement: { enabled: true, everyRounds: 1 },
      }),
    });
    engine.start();
    playRound(engine, ['p0', 'p1']);
    expect(ofType(events, 'roundStarted')[1]!.antes[0]).toMatchObject({ amount: 1 });
  });
});
