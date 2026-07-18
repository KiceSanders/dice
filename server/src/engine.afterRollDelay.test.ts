import { DEFAULT_SETTINGS, type Die } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EngineEvent, GameEngine } from './engine.js';
import { bonusRoll, makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

const STRAIGHT: Die[] = [1, 2, 3, 4, 5];
const QUINT: Die[] = [6, 6, 6, 6, 6];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('after-roll delay', () => {
  it('holds outcomes while allowing immediate ordinary rerolls with snapshotted dice', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, { afterRollDelayMs: 2_000 });
    engine.start();

    expect(roll(engine, 'p0', STRAIGHT)).toBeNull();

    expect(ofType(events, 'rolled')).toHaveLength(1);
    expect(ofType(events, 'rollResolved')).toHaveLength(0);
    expect(ofType(events, 'straightPaid')).toHaveLength(0);
    expect(players.map((player) => player.chips)).toEqual([99, 99]);
    expect(engine.publicState().currentTurn?.resolving).toBe(true);
    expect(engine.publicState().currentTurn?.koozieLocked).toBe(false);
    expect(roll(engine, 'p0', [2, 2, 3, 5, 6])).toBeNull();
    expect(engine.standVoluntarily('p0')).toMatchObject({ code: 'BAD_REQUEST' });

    vi.advanceTimersByTime(1_999);
    expect(ofType(events, 'straightPaid')).toHaveLength(0);
    expect(players.map((player) => player.chips)).toEqual([99, 99]);

    vi.advanceTimersByTime(1);
    expect(ofType(events, 'rollResolved')).toEqual([
      { type: 'rollResolved', playerId: 'p0', dice: STRAIGHT, rollNumber: 1 },
      {
        type: 'rollResolved',
        playerId: 'p0',
        dice: [2, 2, 3, 5, 6],
        rollNumber: 2,
      },
    ]);
    expect(ofType(events, 'straightPaid')).toHaveLength(1);
    expect(players.map((player) => player.chips)).toEqual([102, 96]);
    expect(engine.publicState().currentTurn?.resolving).toBe(false);
  });

  it('holds Classic Pot and first-roll Yahtzee consequences behind the same gate', () => {
    const classic = makeEngine(makePlayers([100, 100]), { afterRollDelayMs: 2_000 });
    classic.engine.start();
    expect(roll(classic.engine, 'p0', [3, 3, 3, 3, 2])).toBeNull();
    expect(ofType(classic.events, 'classicDonated')).toHaveLength(0);
    vi.advanceTimersByTime(2_000);
    expect(ofType(classic.events, 'classicDonated')).toHaveLength(1);

    const yahtzee = makeEngine(makePlayers([100, 100]), { afterRollDelayMs: 2_000 });
    yahtzee.engine.start();
    expect(roll(yahtzee.engine, 'p0', QUINT)).toBeNull();
    expect(yahtzee.engine.publicState().currentTurn?.koozieLocked).toBe(true);
    expect(ofType(yahtzee.events, 'firstRollYahtzeePaid')).toHaveLength(0);
    expect(ofType(yahtzee.events, 'bonusOffered')).toHaveLength(0);
    vi.advanceTimersByTime(2_000);
    expect(ofType(yahtzee.events, 'firstRollYahtzeePaid')).toHaveLength(1);
    expect(ofType(yahtzee.events, 'bonusOffered')).toHaveLength(1);
  });

  it('also delays bonus-die outcomes, chip transfers, and the automatic stand', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      afterRollDelayMs: 2_000,
      settings: {
        ...DEFAULT_SETTINGS,
        firstRollYahtzeePayout: {
          ...DEFAULT_SETTINGS.firstRollYahtzeePayout,
          enabled: false,
        },
      },
    });
    engine.start();
    expect(roll(engine, 'p0', QUINT)).toBeNull();
    vi.advanceTimersByTime(2_000);
    expect(ofType(events, 'bonusOffered')).toHaveLength(1);

    expect(bonusRoll(engine, 'p0', 6)).toBeNull();
    expect(ofType(events, 'bonusSettled')).toEqual([
      { type: 'bonusSettled', playerId: 'p0', die: 6 },
    ]);
    expect(ofType(events, 'bonusRolled')).toHaveLength(0);
    expect(ofType(events, 'yahtzeeBonusPaid')).toHaveLength(0);
    expect(engine.currentTurnPlayerId).toBe('p0');
    expect(players.map((player) => player.chips)).toEqual([99, 99]);

    vi.advanceTimersByTime(2_000);
    expect(ofType(events, 'bonusRolled')[0]).toMatchObject({ matched: true });
    expect(ofType(events, 'yahtzeeBonusPaid')).toHaveLength(1);
    expect(players.map((player) => player.chips)).toEqual([102, 96]);
    expect(engine.currentTurnPlayerId).toBe('p1');
  });

  it('delays last-roll auto-stand, pot award, and round end', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      afterRollDelayMs: 2_000,
      settings: {
        ...DEFAULT_SETTINGS,
        maxRolls: 1,
        yahtzeeBonus: { ...DEFAULT_SETTINGS.yahtzeeBonus, enabled: false },
        firstRollYahtzeePayout: {
          ...DEFAULT_SETTINGS.firstRollYahtzeePayout,
          enabled: false,
        },
      },
    });
    engine.start();

    expect(roll(engine, 'p0', [4, 4, 4, 2, 3])).toBeNull();
    vi.advanceTimersByTime(2_000);
    expect(engine.currentTurnPlayerId).toBe('p1');

    expect(roll(engine, 'p1', [2, 2, 3, 4, 5])).toBeNull();
    expect(engine.publicState().currentTurn?.koozieLocked).toBe(true);
    expect(engine.beginThrow('p1', [])).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'the koozie is still locked',
    });
    expect(engine.phase).toBe('playing');
    expect(ofType(events, 'roundEnded')).toHaveLength(0);
    expect(players.map((player) => player.chips)).toEqual([99, 99]);
    expect(engine.pot).toBe(2);

    vi.advanceTimersByTime(2_000);
    expect(engine.phase).toBe('roundEnd');
    expect(ofType(events, 'roundEnded')[0]).toMatchObject({ winnerId: 'p0', potWon: 2 });
    expect(players.map((player) => player.chips)).toEqual([101, 99]);
  });

  it('captures the duration at settlement and uses an updated setting on the next roll', () => {
    const players = makePlayers([100, 100]);
    const settings = {
      ...DEFAULT_SETTINGS,
      afterRollDelayMs: 2_000,
      maxRolls: 2,
      yahtzeeBonus: { ...DEFAULT_SETTINGS.yahtzeeBonus, enabled: false },
    };
    const events: EngineEvent[] = [];
    const engine = new GameEngine(
      () => players,
      settings,
      (event) => events.push(event),
      { roundEndDelayMs: 5_000 },
    );
    engine.start();

    expect(roll(engine, 'p0', [2, 2, 3, 4, 6])).toBeNull();
    engine.updateSettings({ ...settings, afterRollDelayMs: 0 });
    expect(roll(engine, 'p0', [2, 2, 3, 5, 6])).toBeNull();
    expect(ofType(events, 'rollResolved')).toEqual([
      {
        type: 'rollResolved',
        playerId: 'p0',
        dice: [2, 2, 3, 5, 6],
        rollNumber: 2,
      },
    ]);
    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(engine.publicState().currentTurn).toMatchObject({
      resolving: false,
      koozieLocked: false,
    });

    vi.advanceTimersByTime(1_999);
    expect(ofType(events, 'rollResolved')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ofType(events, 'rollResolved')).toHaveLength(2);
  });

  it('delays last-player beat auto-stand and locks the koozie until then', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, { afterRollDelayMs: 2_000 });
    engine.start();

    expect(roll(engine, 'p0', [4, 4, 4, 2, 3])).toBeNull();
    vi.advanceTimersByTime(2_000);
    expect(engine.standVoluntarily('p0')).toBeNull();

    expect(roll(engine, 'p1', [5, 5, 5, 1, 2])).toBeNull();
    expect(engine.publicState().currentTurn?.koozieLocked).toBe(true);
    expect(engine.beginThrow('p1', [])).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'the koozie is still locked',
    });
    expect(engine.phase).toBe('playing');
    expect(ofType(events, 'stood').filter((e) => e.playerId === 'p1')).toHaveLength(0);

    vi.advanceTimersByTime(2_000);
    expect(engine.phase).toBe('roundEnd');
    expect(ofType(events, 'stood').some((e) => e.playerId === 'p1')).toBe(true);
    expect(ofType(events, 'roundEnded')[0]).toMatchObject({ winnerId: 'p1', potWon: 2 });
  });
});
