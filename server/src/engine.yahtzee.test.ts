import type { Die, RoomSettings, YahtzeeBonusConfig } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bonusRoll, makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

const QUINT: Die[] = [6, 6, 6, 6, 6];
const WILD_QUINT: Die[] = [6, 6, 6, 1, 1]; // scores five 6s

function bonusSettings(over: Partial<YahtzeeBonusConfig>): RoomSettings {
  return {
    ...DEFAULT_SETTINGS,
    yahtzeeBonus: { ...DEFAULT_SETTINGS.yahtzeeBonus, ...over },
    firstRollYahtzeePayout: { ...DEFAULT_SETTINGS.firstRollYahtzeePayout, enabled: false },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Yahtzee bonus (single-die throw, instant zero-sum side payment)', () => {
  it('a quint offers the bonus; a literal match pays every other player, zero-sum', () => {
    const players = makePlayers([100, 100, 100]);
    const before = players.reduce((sum, p) => sum + p.chips, 0);
    const { engine, events } = makeEngine(players, {
      settings: bonusSettings({ amountPerPlayer: 10 }),
    });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(ofType(events, 'bonusOffered')).toEqual([
      { type: 'bonusOffered', playerId: 'p0', face: 6 },
    ]);
    expect(engine.publicState().currentTurn?.bonusPending).toEqual({ face: 6 });

    expect(bonusRoll(engine, 'p0', 6)).toBeNull();
    expect(ofType(events, 'bonusRolled')).toEqual([
      { type: 'bonusRolled', playerId: 'p0', die: 6, face: 6, matched: true },
    ]);
    expect(ofType(events, 'yahtzeeBonusPaid')[0]).toMatchObject({
      playerId: 'p0',
      amountPerPlayer: 10,
      total: 20,
      payments: [
        { playerId: 'p1', amount: 10 },
        { playerId: 'p2', amount: 10 },
      ],
    });
    // 99 (after ante) + 20 collected; payers at 99 - 10. Zero-sum: pot untouched.
    expect(players.map((p) => p.chips)).toEqual([119, 89, 89]);
    expect(engine.pot).toBe(3);
    expect(players.reduce((sum, p) => sum + p.chips, 0) + engine.pot + engine.classicPot).toBe(
      before,
    );
    expect(engine.currentTurnPlayerId).toBe('p1');
  });

  it('wild-composed quints trigger too, targeting the scored face', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, { settings: bonusSettings({}) });
    engine.start();

    expect(roll(engine, 'p0', WILD_QUINT)).toBeNull();
    expect(ofType(events, 'bonusOffered')[0]).toMatchObject({ face: 6 });
    expect(bonusRoll(engine, 'p0', 6)).toBeNull();
    expect(ofType(events, 'yahtzeeBonusPaid')).toHaveLength(1);
  });

  it('a bonus die of 1 is NOT wild — no match, no payout', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, { settings: bonusSettings({}) });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(bonusRoll(engine, 'p0', 1)).toBeNull();
    expect(ofType(events, 'bonusRolled')[0]).toMatchObject({ die: 1, face: 6, matched: false });
    expect(ofType(events, 'yahtzeeBonusPaid')).toHaveLength(0);
    expect(players.map((p) => p.chips)).toEqual([99, 99]); // antes only
  });

  it('all-wild quint (1,1,1,1,1) scores five 6s, so the target is 6', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, { settings: bonusSettings({}) });
    engine.start();

    expect(roll(engine, 'p0', [1, 1, 1, 1, 1])).toBeNull();
    expect(ofType(events, 'bonusOffered')[0]).toMatchObject({ face: 6 });
  });

  it('rerolling and voluntary standing are rejected while pending; resolving auto-stands', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, { settings: bonusSettings({}) });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(roll(engine, 'p0', QUINT, [0, 1, 2, 3])).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'resolve the bonus throw first',
    });
    expect(engine.standVoluntarily('p0')).toMatchObject({ code: 'STAND_NOT_ALLOWED' });

    // Resolving the bonus (miss) stands immediately and advances the turn.
    expect(bonusRoll(engine, 'p0', 2)).toBeNull();
    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(ofType(events, 'stood')).toContainEqual(
      expect.objectContaining({ type: 'stood', playerId: 'p0', dice: QUINT }),
    );
  });

  it('offers exactly once, then ends the turn after the bonus throw', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, { settings: bonusSettings({}) });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(bonusRoll(engine, 'p0', 3)).toBeNull(); // miss

    expect(ofType(events, 'bonusOffered')).toHaveLength(1);
    expect(engine.currentTurnPlayerId).toBe('p1');
  });

  it('defers a capped stand until the bonus die resolves', () => {
    const players = makePlayers([100, 100]);
    const { engine } = makeEngine(players, {
      settings: { ...bonusSettings({}), maxRolls: 1 },
    });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(engine.currentTurnPlayerId).toBe('p0'); // cap reached, stand deferred
    expect(bonusRoll(engine, 'p0', 6)).toBeNull();
    expect(engine.currentTurnPlayerId).toBe('p1'); // deferred auto-stand fired
  });

  it('forceStand mid-bonus stands on the quint with no payout', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, { settings: bonusSettings({}) });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    engine.forceStand('p0');

    expect(engine.currentTurnPlayerId).toBe('p1');
    expect(ofType(events, 'yahtzeeBonusPaid')).toHaveLength(0);
    expect(ofType(events, 'stood')[0]).toMatchObject({ playerId: 'p0' });
  });

  it('payments clamp to short payers — chips never go negative', () => {
    const players = makePlayers([100, 5, 100]); // p1 has 4 left after the 1-chip ante
    const before = players.reduce((sum, p) => sum + p.chips, 0);
    const { engine, events } = makeEngine(players, {
      settings: bonusSettings({ amountPerPlayer: 10 }),
    });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(bonusRoll(engine, 'p0', 6)).toBeNull();

    expect(ofType(events, 'yahtzeeBonusPaid')[0]).toMatchObject({
      total: 14, // 4 (p1 short) + 10 (p2)
      payments: [
        { playerId: 'p1', amount: 4 },
        { playerId: 'p2', amount: 10 },
      ],
    });
    expect(players.map((p) => p.chips)).toEqual([113, 0, 89]);
    expect(players.reduce((sum, p) => sum + p.chips, 0) + engine.pot).toBe(before);
  });

  it('short roller still collects the full amount from a solvent payer', () => {
    // After ante: poor 4, rich 99. Nominal payout 10 → poor collects full 10.
    const players = makePlayers([5, 100]);
    const before = players.reduce((sum, p) => sum + p.chips, 0);
    const { engine, events } = makeEngine(players, {
      settings: bonusSettings({ amountPerPlayer: 10 }),
    });
    engine.start();
    expect(players.map((p) => p.chips)).toEqual([4, 99]);

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(bonusRoll(engine, 'p0', 6)).toBeNull();

    expect(ofType(events, 'yahtzeeBonusPaid')[0]).toMatchObject({
      total: 10,
      payments: [{ playerId: 'p1', amount: 10 }],
    });
    expect(players.map((p) => p.chips)).toEqual([14, 89]);
    expect(players.reduce((sum, p) => sum + p.chips, 0) + engine.pot).toBe(before);
  });

  it('never offers when disabled', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: bonusSettings({ enabled: false }),
    });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(ofType(events, 'bonusOffered')).toHaveLength(0);
    expect(engine.publicState().currentTurn?.bonusPending).toBeNull();
    expect(engine.beginBonusThrow('p0')).toMatchObject({ code: 'BAD_REQUEST' });
    expect(engine.standVoluntarily('p0')).toBeNull(); // turn not blocked
  });

  it('disabling between offer and commit announces the match but pays nothing', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, { settings: bonusSettings({}) });
    engine.start();

    expect(roll(engine, 'p0', QUINT)).toBeNull();
    engine.updateSettings(bonusSettings({ enabled: false }));
    expect(bonusRoll(engine, 'p0', 6)).toBeNull();

    expect(ofType(events, 'bonusRolled')[0]).toMatchObject({ matched: true });
    expect(ofType(events, 'yahtzeeBonusPaid')).toHaveLength(0);
    expect(players.map((p) => p.chips)).toEqual([99, 99]);
  });

  it('rejects bonus throws with no bonus pending or already in flight', () => {
    const players = makePlayers([100, 100]);
    const { engine } = makeEngine(players, { settings: bonusSettings({}) });
    engine.start();

    expect(engine.beginBonusThrow('p0')).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'no bonus throw pending',
    });
    expect(roll(engine, 'p0', QUINT)).toBeNull();
    expect(engine.commitBonusThrow('p0', 6)).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'no bonus throw in flight',
    });
    expect(engine.beginBonusThrow('p0')).toBeNull();
    expect(engine.beginBonusThrow('p0')).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'a throw is already in flight',
    });
    expect(engine.beginBonusThrow('p1')).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect(engine.commitBonusThrow('p0', 0 as Die)).toMatchObject({ code: 'BAD_REQUEST' });
    expect(engine.commitBonusThrow('p0', 6)).toBeNull();
  });

  it('replayed quint + bonusRolled re-apply the payout identically', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: bonusSettings({ amountPerPlayer: 10 }),
    });
    engine.start();

    expect(engine.replayRolled('p0', QUINT, [], null)).toBeNull();
    expect(engine.publicState().currentTurn?.bonusPending).toEqual({ face: 6 });
    expect(engine.replayBonusRolled('p0', 6)).toBeNull();

    expect(ofType(events, 'yahtzeeBonusPaid')).toHaveLength(1);
    expect(players.map((p) => p.chips)).toEqual([109, 89]);
  });
});
