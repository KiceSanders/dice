import { DEFAULT_BETALOT_SETTINGS, type Die, SLOT_REVEAL_MS } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnginePlayer } from '../../engine.js';
import { BetALotEngine, type BetALotEvent } from './engine.js';
import { SLOT_DECISION_MS, SLOT_RESULT_MS, type SlotCommand } from './slots.js';

const engines: BetALotEngine[] = [];
const settings = { ...DEFAULT_BETALOT_SETTINGS, afterRollDelayMs: 0 };

function setup(
  players: EnginePlayer[] = [
    { id: 'a', chips: 100, seat: 0, connected: true },
    { id: 'b', chips: 100, seat: 1, connected: true },
  ],
) {
  const events: BetALotEvent[] = [];
  const draw = vi.fn(() => 0);
  const engine = new BetALotEngine(
    () => players,
    settings,
    (event) => events.push(event),
    draw,
  );
  engines.push(engine);
  return { engine, players, events, draw };
}

function roll(engine: BetALotEngine, id: string, dice: Die[]) {
  expect(engine.beginThrow(id)).toBeNull();
  expect(engine.commitThrow(id, dice)).toBeNull();
}

function earn(engine: BetALotEngine) {
  engine.start();
  for (const [index, opener] of ['a', 'b', 'a'].entries()) {
    expect(engine.call(opener, 3)).toBeNull();
    roll(engine, opener, [3]);
    roll(engine, opener === 'a' ? 'b' : 'a', [1, 2]);
    engine.continueRound();
    if (index < 2) {
      expect(engine.publicState().slots).toEqual({
        tickets: index === 0 ? ['a'] : ['a', 'b'],
        active: null,
      });
      expect(engine.roundNumber).toBe(index + 2);
    }
  }
}

function command(engine: BetALotEngine, action: 'spin' | 'collect' | 'continue'): SlotCommand {
  const bonus = engine.publicState().slots.active!;
  return { type: 'betalot:slotsAction', bonusId: bonus.id, revision: bonus.revision, action };
}

describe('live Bet-a-lot slot bonuses', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    for (const engine of engines.splice(0)) engine.stop();
    vi.useRealTimers();
  });

  it('carries separate balances across rounds and spends two tickets only between rounds', () => {
    const { engine, events } = setup();
    earn(engine);
    expect(events.filter((event) => event.type === 'slotTicketEarned')).toEqual([
      { type: 'slotTicketEarned', playerId: 'a' },
      { type: 'slotTicketEarned', playerId: 'b' },
      { type: 'slotTicketEarned', playerId: 'a' },
    ]);
    expect(engine.publicState().slots).toMatchObject({ tickets: ['b'], active: { playerId: 'a' } });
    expect(engine.phase).toBe('roundEnd');
    engine.continueRound();
    vi.advanceTimersByTime(8_000);
    expect(engine.roundNumber).toBe(3);
    expect(engine.beginThrow('a')?.code).toBe('BAD_REQUEST');
  });

  it('does not award a ticket for an unmatched opening call', () => {
    const { engine } = setup();
    engine.start();
    engine.call('a', 6);
    roll(engine, 'a', [3]);
    roll(engine, 'b', [1, 2]);
    engine.continueRound();
    expect(engine.publicState().slots).toEqual({ tickets: [], active: null });
    expect(engine.roundNumber).toBe(2);
  });

  it('rejects other players, spectators, stale revisions and duplicate spins without drawing again', () => {
    const { engine, draw } = setup();
    earn(engine);
    const spin = command(engine, 'spin');
    expect(engine.slotsAction('b', spin)?.code).toBe('NOT_YOUR_TURN');
    expect(engine.slotsAction('spectator', spin)?.code).toBe('NOT_YOUR_TURN');
    expect(engine.slotsAction('a', { ...spin, bonusId: 'old-bonus' })?.code).toBe('BAD_REQUEST');
    expect(draw).toHaveBeenCalledTimes(3);
    expect(engine.slotsAction('a', spin)).toBeNull();
    expect(draw).toHaveBeenCalledTimes(8);
    expect(engine.slotsAction('a', spin)?.code).toBe('BAD_REQUEST');
    expect(draw).toHaveBeenCalledTimes(8);
    expect(engine.publicState().slots.active?.round.spinsUsed).toBe(1);
  });

  it('holds locks, limits play to five spins, and conserves chips with one payout', () => {
    const { engine, players, events, draw } = setup();
    earn(engine);
    for (let spin = 0; spin < 5; spin += 1) {
      expect(engine.slotsAction('a', command(engine, 'spin'))).toBeNull();
      expect(engine.publicState().slots.active?.round.phase).toBe('spinning');
      vi.advanceTimersByTime(SLOT_REVEAL_MS);
      if (spin === 0) {
        const bonus = engine.publicState().slots.active!;
        expect(
          engine.slotsAction('a', {
            type: 'betalot:slotsAction',
            bonusId: bonus.id,
            revision: bonus.revision,
            action: 'lock',
            index: 0,
            locked: true,
          }),
        ).toBeNull();
        draw.mockReturnValue(1);
      }
    }
    const result = engine.publicState().slots.active!;
    expect(result.round.dice).toEqual([1, 2, 2, 2, 2]);
    expect(result.round.phase).toBe('complete');
    expect(result.round.payout).toBe(0);
    expect(engine.slotsAction('a', command(engine, 'spin'))?.code).toBe('BAD_REQUEST');
    expect(
      events.filter((event) => event.type === 'paid' && event.reason === 'slots'),
    ).toHaveLength(0);
    expect(players.reduce((sum, p) => sum + p.chips, engine.publicState().sevensPot)).toBe(200);
    engine.slotsAction('a', command(engine, 'continue'));
    expect(engine.roundNumber).toBe(4);
    expect(engine.publicState().openerId).toBe('b');
  });

  it('pays the highest match once, including when collection is repeated', () => {
    const { engine, players, events } = setup();
    earn(engine);
    engine.slotsAction('a', command(engine, 'spin'));
    vi.advanceTimersByTime(SLOT_REVEAL_MS);
    const collect = command(engine, 'collect');
    expect(engine.slotsAction('a', collect)).toBeNull();
    expect(engine.slotsAction('a', collect)?.code).toBe('BAD_REQUEST');
    expect(engine.publicState().slots.active?.round.payout).toBe(30);
    expect(players.map((p) => p.chips)).toEqual([138, 62]);
    expect(
      events.filter((event) => event.type === 'paid' && event.reason === 'slots'),
    ).toHaveLength(1);
    expect(engine.publicState().roundHistory).toHaveLength(3);
  });

  it('displays Fire and the payer cap up front, pays exactly that amount, then ends a bankrupt game', () => {
    const { engine, players } = setup();
    earn(engine);
    const saved = engine.persistedState();
    saved.publicState.slots = { tickets: ['a', 'a'], active: null };
    saved.publicState.fire = [{ playerId: 'a', streak: 3, onFire: true }];
    players[1]!.chips = 40;
    engine.restore(saved);
    engine.continueRound();
    expect(engine.publicState().slots.active).toMatchObject({
      fireMultiplier: 2,
      payoutLimit: 40,
      round: { targets: [{ payout: 6 }, { payout: 20 }, { payout: 40 }] },
    });
    engine.slotsAction('a', command(engine, 'spin'));
    vi.advanceTimersByTime(SLOT_REVEAL_MS);
    engine.slotsAction('a', command(engine, 'collect'));
    expect(engine.publicState().slots.active?.round.payout).toBe(40);
    expect(players.map((p) => p.chips)).toEqual([148, 0]);
    vi.advanceTimersByTime(SLOT_RESULT_MS);
    expect(engine.phase).toBe('ended');
  });

  it('restores the exact in-flight faces and locked dice without rerolling or double paying', () => {
    const first = setup();
    earn(first.engine);
    first.engine.slotsAction('a', command(first.engine, 'spin'));
    vi.advanceTimersByTime(SLOT_REVEAL_MS);
    const bonus = first.engine.publicState().slots.active!;
    first.engine.slotsAction('a', {
      ...command(first.engine, 'spin'),
      action: 'lock',
      index: 0,
      locked: true,
    });
    first.engine.slotsAction('a', command(first.engine, 'spin'));
    const saved = first.engine.persistedState();
    first.engine.stop();
    const restored = setup(structuredClone(first.players));
    restored.engine.restore(saved);
    restored.engine.pause();
    restored.engine.resume();
    expect(restored.engine.publicState().slots.active?.id).toBe(bonus.id);
    expect(restored.engine.publicState().slots.active?.round.locked[0]).toBe(true);
    vi.advanceTimersByTime(SLOT_REVEAL_MS);
    expect(restored.draw).not.toHaveBeenCalled();
    expect(restored.engine.publicState().slots.active?.round.spinsUsed).toBe(2);
    restored.engine.slotsAction('a', command(restored.engine, 'collect'));
    const paidState = restored.engine.persistedState();
    restored.engine.stop();
    const paid = setup(structuredClone(restored.players));
    paid.engine.restore(paidState);
    paid.engine.pause();
    paid.engine.resume();
    vi.advanceTimersByTime(SLOT_RESULT_MS);
    expect(paid.players.map((p) => p.chips)).toEqual([138, 62]);
    expect(paid.events.filter((event) => event.type === 'paid')).toHaveLength(0);
    expect(paid.engine.roundNumber).toBe(4);
  });

  it('collects an idle hand and continues even if the owner disconnects', () => {
    const { engine, players } = setup();
    earn(engine);
    engine.slotsAction('a', command(engine, 'spin'));
    vi.advanceTimersByTime(SLOT_REVEAL_MS);
    players[0]!.connected = false;
    vi.advanceTimersByTime(SLOT_DECISION_MS);
    expect(engine.publicState().slots.active?.round.payout).toBe(30);
    vi.advanceTimersByTime(SLOT_RESULT_MS);
    expect(engine.roundNumber).toBe(4);
  });

  it('expires an unused ticket at zero without fabricating a spin', () => {
    const { engine } = setup();
    earn(engine);
    vi.advanceTimersByTime(SLOT_DECISION_MS);
    expect(engine.publicState().slots.active?.round).toMatchObject({
      phase: 'complete',
      payout: 0,
      spinsUsed: 0,
    });
    vi.advanceTimersByTime(SLOT_RESULT_MS);
    expect(engine.roundNumber).toBe(4);
  });

  it('does not pay a kicked ticket owner and still clears the bonus', () => {
    const { engine, players } = setup();
    earn(engine);
    engine.slotsAction('a', command(engine, 'spin'));
    vi.advanceTimersByTime(SLOT_REVEAL_MS);
    players[0]!.seat = null;
    vi.advanceTimersByTime(SLOT_DECISION_MS);
    expect(engine.publicState().slots.active?.round.payout).toBe(0);
    vi.advanceTimersByTime(SLOT_RESULT_MS);
    expect(engine.phase).toBe('ended');
  });

  it('cannot charge a removed opponent after a replacement takes their seat', () => {
    const { engine, players } = setup();
    earn(engine);
    engine.slotsAction('a', command(engine, 'spin'));
    vi.advanceTimersByTime(SLOT_REVEAL_MS);
    players[1]!.seat = null;
    players.push({ id: 'replacement', chips: 100, seat: 1, connected: true });
    expect(engine.slotsAction('a', command(engine, 'collect'))?.code).toBe('NOT_YOUR_TURN');
    vi.advanceTimersByTime(SLOT_DECISION_MS);
    expect(engine.publicState().slots.active?.round.payout).toBe(0);
    expect(players.map((p) => p.chips)).toEqual([108, 92, 100]);
  });
});
