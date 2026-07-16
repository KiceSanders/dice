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
    const before = players.reduce((sum, p) => sum + p.chips, 0);
    const { engine, events } = makeEngine(players, {
      settings: payoutSettings({ amountPerPlayer: 10 }),
    });
    engine.start();
    expect(roll(engine, 'p0', LOW_STRAIGHT)).toBeNull();

    expect(ofType(events, 'straightPaid')[0]).toMatchObject({
      total: 12, // 2 (p1 short) + 10 (p2)
      payments: [
        { playerId: 'p1', amount: 2 },
        { playerId: 'p2', amount: 10 },
      ],
    });
    expect(players.map((p) => p.chips)).toEqual([111, 0, 89]);
    expect(players.reduce((sum, p) => sum + p.chips, 0) + engine.pot).toBe(before);
  });

  it('payer-only clamp: short payer pays less; short roller still collects full', () => {
    // After ante: rich 99, poor 4. Nominal payout 5.
    const richRolls = makePlayers([100, 5]);
    const beforeRich = richRolls.reduce((sum, p) => sum + p.chips, 0);
    const { engine: e1, events: ev1 } = makeEngine(richRolls, {
      settings: payoutSettings({ amountPerPlayer: 5 }),
    });
    e1.start();
    expect(richRolls.map((p) => p.chips)).toEqual([99, 4]);

    expect(roll(e1, 'p0', LOW_STRAIGHT)).toBeNull(); // rich rolls — short payer pays 4
    expect(ofType(ev1, 'straightPaid')[0]).toMatchObject({
      total: 4,
      payments: [{ playerId: 'p1', amount: 4 }],
    });
    expect(richRolls.map((p) => p.chips)).toEqual([103, 0]);
    expect(richRolls.reduce((sum, p) => sum + p.chips, 0) + e1.pot).toBe(beforeRich);

    const poorRolls = makePlayers([100, 5]);
    const beforePoor = poorRolls.reduce((sum, p) => sum + p.chips, 0);
    const { engine: e2, events: ev2 } = makeEngine(poorRolls, {
      settings: payoutSettings({ amountPerPlayer: 5 }),
    });
    e2.start();
    // Junk stand (not a straight) so only p1's later straight triggers a payout.
    expect(roll(e2, 'p0', [2, 2, 3, 4, 5])).toBeNull();
    e2.stand('p0');
    expect(poorRolls.map((p) => p.chips)).toEqual([99, 4]);

    expect(roll(e2, 'p1', HIGH_STRAIGHT)).toBeNull(); // poor rolls — collects full 5
    expect(ofType(ev2, 'straightPaid')[0]).toMatchObject({
      total: 5,
      payments: [{ playerId: 'p0', amount: 5 }],
    });
    // Straight pays 5, then the round ends (p0's pair beats the straight's group)
    // and p0 takes the 2-chip pot → 99 - 5 + 2 = 96.
    expect(poorRolls.map((p) => p.chips)).toEqual([96, 9]);
    expect(poorRolls.reduce((sum, p) => sum + p.chips, 0) + e2.pot).toBe(beforePoor);
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
    expect(engine.replayRolled('p0', LOW_STRAIGHT, [], null)).toBeNull();

    expect(ofType(events, 'straightPaid')).toHaveLength(1);
    expect(players.map((p) => p.chips)).toEqual([104, 94]);
  });
});
