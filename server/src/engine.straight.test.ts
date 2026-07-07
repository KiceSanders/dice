import type { Die, RoomSettings, StraightPayoutConfig } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

const LOW_STRAIGHT: Die[] = [1, 2, 3, 4, 5];
const HIGH_STRAIGHT: Die[] = [2, 3, 4, 5, 6];

function payoutSettings(over: Partial<StraightPayoutConfig>): RoomSettings {
  return {
    ...DEFAULT_SETTINGS,
    straightPayout: { ...DEFAULT_SETTINGS.straightPayout, ...over },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('straight payout (instant zero-sum side payment)', () => {
  it('every other seated player pays the roller; pot untouched', () => {
    const players = makePlayers([100, 100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 5 }),
    });
    engine.start();
    expect(engine.pot).toBe(3); // antes only

    expect(roll(engine, 'p0', LOW_STRAIGHT)).toBeNull();

    const paid = ofType(events, 'straightPaid');
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({
      playerId: 'p0',
      kind: 'straight',
      amountPerPlayer: 5,
      total: 10,
      payments: [
        { playerId: 'p1', amount: 5 },
        { playerId: 'p2', amount: 5 },
      ],
    });
    // 99 (after ante) + 10 collected; payers at 99 - 5. Zero-sum: pot untouched.
    expect(players.map((p) => p.chips)).toEqual([109, 94, 94]);
    expect(engine.pot).toBe(3);
  });

  it('both straight patterns pay the same amount', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 5 }),
    });
    engine.start();
    expect(roll(engine, 'p0', HIGH_STRAIGHT)).toBeNull();

    expect(ofType(events, 'straightPaid')[0]).toMatchObject({
      kind: 'straight',
      amountPerPlayer: 5,
      total: 5,
    });
    expect(players.map((p) => p.chips)).toEqual([104, 94]);
  });

  it('payments clamp to what a player has — chips never go negative', () => {
    const players = makePlayers([100, 3, 100]); // p1 has 2 left after the 1-chip ante
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 10 }),
    });
    engine.start();
    expect(roll(engine, 'p0', LOW_STRAIGHT)).toBeNull();

    expect(ofType(events, 'straightPaid')[0]).toMatchObject({
      total: 12, // 2 (p1 all-in) + 10 (p2)
      payments: [
        { playerId: 'p1', amount: 2 },
        { playerId: 'p2', amount: 10 },
      ],
    });
    expect(players.map((p) => p.chips)).toEqual([111, 0, 89]);
  });

  it('fires at most once per turn, even if a reroll shows another straight', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 5 }),
    });
    engine.start();
    expect(roll(engine, 'p0', LOW_STRAIGHT)).toBeNull(); // pays
    expect(roll(engine, 'p0', HIGH_STRAIGHT)).toBeNull(); // second straight, same turn — no payout

    expect(ofType(events, 'straightPaid')).toHaveLength(1);
    expect(players.map((p) => p.chips)).toEqual([104, 94]);
  });

  it('pays again on a later turn (per-turn flag resets)', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 5 }),
    });
    engine.start();
    roll(engine, 'p0', LOW_STRAIGHT);
    engine.stand('p0');
    roll(engine, 'p1', HIGH_STRAIGHT); // p1's own turn: fresh payout

    const paid = ofType(events, 'straightPaid');
    expect(paid.map((p) => p.playerId)).toEqual(['p0', 'p1']);
    expect(paid.every((p) => p.kind === 'straight')).toBe(true);
  });

  it('pays nothing when disabled', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ enabled: false }),
    });
    engine.start();
    expect(roll(engine, 'p0', LOW_STRAIGHT)).toBeNull();

    expect(ofType(events, 'straightPaid')).toHaveLength(0);
    expect(players.map((p) => p.chips)).toEqual([99, 99]); // antes only
  });

  it('replayed rolled events re-apply the payout identically', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 5 }),
    });
    engine.start();
    expect(engine.replayRolled('p0', LOW_STRAIGHT, [])).toBeNull();

    expect(ofType(events, 'straightPaid')).toHaveLength(1);
    expect(players.map((p) => p.chips)).toEqual([104, 94]);
  });
});
