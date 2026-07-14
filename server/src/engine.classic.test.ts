import type { ClassicPotConfig, Die, RoomSettings } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

const FOUR_THREES: Die[] = [3, 3, 3, 3, 2];
const FOUR_WITH_WILD: Die[] = [3, 3, 3, 1, 2];
const YAHTZEE: Die[] = [4, 4, 4, 4, 4];
const THREE_SIXES: Die[] = [6, 6, 6, 2, 3];
const THREE_SIXES_WILD: Die[] = [6, 6, 1, 2, 3];
const WEAK: Die[] = [2, 3, 4, 5, 2];

function classicSettings(over: Partial<ClassicPotConfig>): RoomSettings {
  return {
    ...DEFAULT_SETTINGS,
    classicPot: { ...DEFAULT_SETTINGS.classicPot, ...over },
    straightPayout: { ...DEFAULT_SETTINGS.straightPayout, enabled: false },
  };
}

function chipsPlusClassic(players: { chips: number }[], classicPot: number): number {
  return players.reduce((sum, p) => sum + p.chips, 0) + classicPot;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('classic pot', () => {
  it('donates on first-roll exact four-of-a-kind; ante pot untouched', () => {
    const players = makePlayers([100, 100]);
    const before = chipsPlusClassic(players, 0);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 1 }),
    });
    engine.start();
    const antePot = engine.pot;

    expect(roll(engine, 'p0', FOUR_THREES)).toBeNull();

    const donated = ofType(events, 'classicDonated');
    expect(donated).toHaveLength(1);
    expect(donated[0]).toMatchObject({
      playerId: 'p0',
      amount: 1,
      classicPot: 1,
    });
    expect(engine.classicPot).toBe(1);
    expect(engine.pot).toBe(antePot);
    expect(chipsPlusClassic(players, engine.classicPot) + engine.pot).toBe(before);
  });

  it('counts wilds toward four-of-a-kind donation', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 2 }),
    });
    engine.start();
    expect(roll(engine, 'p0', FOUR_WITH_WILD)).toBeNull();
    expect(ofType(events, 'classicDonated')[0]).toMatchObject({ amount: 2, classicPot: 2 });
  });

  it('does not donate on Yahtzee (count === 5)', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 1 }),
    });
    engine.start();
    expect(roll(engine, 'p0', YAHTZEE)).toBeNull();
    expect(ofType(events, 'classicDonated')).toHaveLength(0);
    expect(engine.classicPot).toBe(0);
  });

  it('donates only on the first roll of the turn', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 1 }),
    });
    engine.start();
    expect(roll(engine, 'p0', WEAK)).toBeNull();
    expect(ofType(events, 'classicDonated')).toHaveLength(0);

    // Second roll: four of a kind — no donation (keep empty so all faces can change).
    expect(roll(engine, 'p0', FOUR_THREES, [])).toBeNull();
    expect(ofType(events, 'classicDonated')).toHaveLength(0);
    expect(engine.classicPot).toBe(0);
  });

  it('skips donation when disabled', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ enabled: false }),
    });
    engine.start();
    expect(roll(engine, 'p0', FOUR_THREES)).toBeNull();
    expect(ofType(events, 'classicDonated')).toHaveLength(0);
  });

  it('clamps donation to roller chips (skips when broke)', () => {
    const players = makePlayers([1, 100]);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 5 }),
    });
    engine.start();
    expect(players[0]?.chips).toBe(0);
    expect(roll(engine, 'p0', FOUR_THREES)).toBeNull();
    expect(ofType(events, 'classicDonated')).toHaveLength(0);
    expect(engine.classicPot).toBe(0);
  });

  it('wins classic pot on three 6s (wilds OK) when nobody has stood', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 1 }),
    });
    engine.start();
    const antePot = engine.pot;

    engine.classicPot = 7;
    const beforeWithPot = chipsPlusClassic(players, 0) + antePot + 7;

    expect(roll(engine, 'p0', THREE_SIXES_WILD)).toBeNull();

    const won = ofType(events, 'classicWon');
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({ playerId: 'p0', amount: 7 });
    expect(engine.classicPot).toBe(0);
    expect(engine.pot).toBe(antePot);
    expect(chipsPlusClassic(players, engine.classicPot) + engine.pot).toBe(beforeWithPot);
  });

  it('does not pay classic on three 6s after the first roll of the turn', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 1 }),
    });
    engine.start();
    engine.classicPot = 5;

    expect(roll(engine, 'p0', WEAK)).toBeNull();
    expect(roll(engine, 'p0', WEAK, [])).toBeNull();
    events.length = 0;
    expect(roll(engine, 'p0', THREE_SIXES, [])).toBeNull();

    expect(ofType(events, 'classicWon')).toHaveLength(0);
    expect(engine.classicPot).toBe(5);
  });

  it('does not pay classic when roll-to-beat is already set', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 1 }),
    });
    engine.start();
    engine.classicPot = 5;

    expect(roll(engine, 'p0', WEAK)).toBeNull();
    engine.stand('p0');
    expect(engine.publicState().rollToBeat).not.toBeNull();

    events.length = 0;
    expect(roll(engine, 'p1', THREE_SIXES)).toBeNull();
    expect(ofType(events, 'classicWon')).toHaveLength(0);
    expect(engine.classicPot).toBe(5);
  });

  it('does not pay when disabled (pool freezes)', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: classicSettings({ enabled: false }),
    });
    engine.start();
    engine.classicPot = 5;
    expect(roll(engine, 'p0', THREE_SIXES)).toBeNull();
    expect(ofType(events, 'classicWon')).toHaveLength(0);
    expect(engine.classicPot).toBe(5);
  });

  it('carries classic pot across round end', () => {
    const players = makePlayers([100, 100]);
    const { engine } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 1 }),
    });
    engine.start();
    expect(roll(engine, 'p0', FOUR_THREES)).toBeNull();
    expect(engine.classicPot).toBe(1);
    engine.stand('p0');
    expect(roll(engine, 'p1', WEAK)).toBeNull();
    engine.stand('p1');

    expect(engine.phase).toBe('roundEnd');
    expect(engine.classicPot).toBe(1);

    vi.advanceTimersByTime(5_000);
    expect(engine.phase).toBe('playing');
    expect(engine.classicPot).toBe(1);
  });

  it('persistedState / restore keep classicPot', () => {
    const players = makePlayers([100, 100]);
    const { engine } = makeEngine(players, {
      settings: classicSettings({ donationAmount: 1 }),
    });
    engine.start();
    expect(roll(engine, 'p0', FOUR_THREES)).toBeNull();
    expect(engine.classicPot).toBe(1);
    engine.stand('p0');
    expect(roll(engine, 'p1', WEAK)).toBeNull();
    engine.stand('p1');

    const snap = engine.persistedState();
    expect(snap.classicPot).toBe(1);

    const players2 = makePlayers([100, 100]);
    const { engine: engine2 } = makeEngine(players2, {
      settings: classicSettings({ donationAmount: 1 }),
    });
    engine2.restore(snap);
    expect(engine2.classicPot).toBe(1);
  });
});
