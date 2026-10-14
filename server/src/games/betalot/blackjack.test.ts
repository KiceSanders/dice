import { DEFAULT_BETALOT_SETTINGS, isBetALotState, type ServerMessage } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedRoomState } from '../../events.js';
import { replayRoom } from '../../persistence.js';
import { Room } from '../../room.js';
import type { BlackjackEngine } from '../blackjack/engine.js';
import type { BetALotEngine } from './engine.js';

const rooms: Room[] = [];
const link = { send: () => {} };
function make(reverseSeats = false) {
  const messages: ServerMessage[] = [];
  const room = new Room('BONUS', { ...DEFAULT_BETALOT_SETTINGS, afterRollDelayMs: 0 });
  rooms.push(room);
  const a = room.addPlayer('Alice', { send: (m) => messages.push(m) }, { host: true });
  const b = room.addPlayer('Bob', link);
  room.requestSeat(a.id, 500);
  room.requestSeat(b.id, 500);
  room.approveSeat(b.id);
  if (reverseSeats) {
    a.seat = 1;
    b.seat = 0;
  }
  expect(room.startGame(a.id)).toBeNull();
  return { room, a, b, messages, engine: room.betALotEngine! };
}
function ladder(engine: BetALotEngine) {
  const opener = engine.currentTurnPlayerId!;
  expect(engine.call(opener, 6)).toBeNull();
  expect(engine.beginThrow(opener)).toBeNull();
  expect(engine.commitThrow(opener, [3])).toBeNull();
  const opponent = engine.currentTurnPlayerId!;
  expect(engine.beginThrow(opponent)).toBeNull();
  expect(engine.commitThrow(opponent, [1, 2])).toBeNull();
  expect(engine.phase).toBe('roundEnd');
}
function throughTen(engine: BetALotEngine) {
  for (let i = 1; i <= 10; i++) {
    ladder(engine);
    if (i < 10) engine.continueRound();
  }
}
function roll(engine: BlackjackEngine, die: number, stand = true) {
  const id = engine.currentTurnPlayerId!;
  expect(engine.beginThrow(id)).toBeNull();
  expect(engine.commitThrow(id, die)).toBeNull();
  if (stand && !engine.publicState().result) expect(engine.decide(id, 'stand')).toBeNull();
}
function recover(saved: PersistedRoomState) {
  const room = replayRoom('BONUS', [
    { type: 'snapshot', state: JSON.parse(JSON.stringify(saved)) },
  ])!;
  rooms.push(room);
  return room;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  rooms.splice(0).forEach((room) => {
    room.destroy();
  });
  vi.useRealTimers();
});

describe('Bet-a-lot tenth-round Blackjack', () => {
  it('keeps seat order rather than join order for the first ladder and bonus opener', () => {
    const { engine, b } = make(true);
    expect(engine.currentTurnPlayerId).toBe(b.id);
    throughTen(engine);
    engine.continueRound();
    expect(engine.blackjackEngine!.currentTurnPlayerId).toBe(b.id);
  });
  it('runs once after 10 and 20, pauses the ladder, alternates bonus openers, and preserves ladder state', () => {
    const { room, engine, a, b, messages } = make();
    for (let round = 1; round <= 21; round++) {
      expect(engine.roundNumber).toBe(round);
      expect(engine.blackjackEngine).toBeNull();
      ladder(engine);
      const before = engine.publicState();
      engine.continueRound();
      if (round % 10 !== 0) continue;
      const bonus = engine.blackjackEngine!;
      expect(bonus.publicState()).toMatchObject({
        bonus: { afterRound: round },
        dieSides: 6,
        payout: 10,
        openerId: round === 10 ? a.id : b.id,
      });
      engine.continueRound();
      expect(engine.roundNumber).toBe(round);
      expect(engine.beginThrow(a.id)?.code).toBe('BAD_REQUEST');
      roll(bonus, 5);
      roll(bonus, 4);
      expect(bonus.publicState().result?.amount).toBe(10);
      const after = engine.publicState();
      for (const key of [
        'roundNumber',
        'openerId',
        'fire',
        'ladder',
        'roundHistory',
        'slots',
        'sevensPot',
      ] as const) {
        expect(after[key]).toEqual(before[key]);
      }
      expect([...room.players.values()].reduce((n, p) => n + p.chips, 0)).toBe(1000);
      expect(messages.filter((m) => m.type === 'blackjack:roundEnded')).toHaveLength(round / 10);
      engine.continueRound();
      engine.continueRound();
      expect(engine.roundNumber).toBe(round + 1);
    }
  });

  it('keeps tied hands inside the same bonus with d12 and repeated doubling, then returns via fallback', () => {
    const { engine } = make();
    throughTen(engine);
    vi.advanceTimersByTime(8000);
    const bonus = engine.blackjackEngine!;
    roll(bonus, 5);
    roll(bonus, 5);
    expect(bonus.publicState()).toMatchObject({ overtime: 1, payout: 20, dieSides: 12 });
    roll(bonus, 12);
    roll(bonus, 12);
    expect(bonus.publicState()).toMatchObject({ overtime: 2, payout: 40, dieSides: 12 });
    roll(bonus, 12);
    roll(bonus, 11);
    expect(bonus.publicState().result?.amount).toBe(40);
    vi.advanceTimersByTime(8000);
    expect(engine.roundNumber).toBe(11);
    expect(engine.blackjackEngine).toBeNull();
    vi.advanceTimersByTime(16000);
    expect(engine.roundNumber).toBe(11);
  });

  it('plays Blackjack before queued slots, without spending tickets early or repeating either bonus', () => {
    const { engine, a } = make();
    throughTen(engine);
    engine.stop();
    const saved = engine.persistedState();
    saved.publicState.slots.tickets = [a.id, a.id];
    engine.restore(saved);
    engine.continueRound();
    expect(engine.publicState().slots).toEqual({ tickets: [a.id, a.id], active: null });
    const bonus = engine.blackjackEngine!;
    roll(bonus, 5);
    roll(bonus, 4);
    engine.continueRound();
    expect(engine.publicState().slots.active?.playerId).toBe(a.id);
    expect(engine.blackjackEngine).toBeNull();
    expect(engine.roundNumber).toBe(10);
    vi.advanceTimersByTime(68000);
    expect(engine.roundNumber).toBe(11);
    expect(engine.publicState().slots).toEqual({ tickets: [], active: null });
  });

  it('applies Fire to the bonus payout without changing the streak and caps payment at the loser’s chips', () => {
    const { engine, a, b, messages } = make();
    throughTen(engine);
    engine.stop();
    const saved = engine.persistedState();
    saved.publicState.fire = [
      { playerId: a.id, streak: 3, onFire: true },
      { playerId: b.id, streak: 0, onFire: false },
    ];
    engine.restore(saved);
    engine.continueRound();
    expect(engine.blackjackEngine!.publicState().bonus?.firePlayerId).toBe(a.id);
    b.chips = 17;
    const total = a.chips + b.chips;
    roll(engine.blackjackEngine!, 5);
    roll(engine.blackjackEngine!, 4);
    expect(engine.blackjackEngine!.publicState().result?.amount).toBe(17);
    expect(a.chips + b.chips).toBe(total);
    expect(b.chips).toBe(0);
    expect(engine.publicState().fire).toEqual(saved.publicState.fire);
    expect(messages.filter((m) => m.type === 'blackjack:roundEnded')).toHaveLength(1);
    engine.continueRound();
    expect(engine.phase).toBe('ended');
  });

  it('restores an overtime decision, then a paid result without adding dice, paying twice or repeating the bonus', () => {
    const { room, engine, a, b } = make();
    throughTen(engine);
    engine.continueRound();
    roll(engine.blackjackEngine!, 5);
    roll(engine.blackjackEngine!, 5);
    roll(engine.blackjackEngine!, 12, false);
    const saved = room.buildPersistedState();
    room.destroy();
    const restored = recover(saved);
    const next = restored.betALotEngine!;
    expect(next.blackjackEngine!.publicState()).toMatchObject({
      overtime: 1,
      payout: 20,
      awaitingDecision: true,
    });
    restored.rejoin(a.rejoinToken, link);
    restored.rejoin(b.rejoinToken, link);
    expect(next.blackjackEngine!.decide(b.id, 'stand')).toBeNull();
    roll(next.blackjackEngine!, 11);
    expect(restored.players.get(b.id)?.chips).toBe(520);
    const paid = restored.buildPersistedState();
    restored.destroy();
    const again = recover(paid);
    again.rejoin(a.rejoinToken, link);
    again.rejoin(b.rejoinToken, link);
    vi.advanceTimersByTime(8000);
    expect(again.players.get(b.id)?.chips).toBe(520);
    expect(again.betALotEngine!.roundNumber).toBe(11);
    expect(again.betALotEngine!.blackjackEngine).toBeNull();
  });

  it('recovers a committed reveal and a kick of the waiting opponent before resolving the forfeit once', () => {
    const { room, engine, a, b } = make();
    throughTen(engine);
    engine.continueRound();
    room.updateSettings({ ...DEFAULT_BETALOT_SETTINGS, afterRollDelayMs: 10000 });
    roll(engine.blackjackEngine!, 4, false);
    expect(room.kick(b.id)).toBeNull();
    const saved = room.buildPersistedState();
    room.destroy();
    const restored = recover(saved);
    expect(restored.betALotEngine!.blackjackEngine!.publicState().result).toMatchObject({
      winnerId: a.id,
      reason: 'forfeit',
      amount: 10,
    });
    expect(restored.players.get(a.id)?.chips).toBe(510);
    expect(restored.players.get(b.id)?.chips).toBe(490);
  });

  it('forfeits a disconnected waiting player and shows identical bonus state to a spectator', () => {
    const { room, engine, a, b } = make();
    throughTen(engine);
    engine.continueRound();
    const spectator = room.addPlayer('Watcher', link);
    const watched = room.buildSnapshot(spectator.id).game;
    expect(isBetALotState(watched) && watched.blackjack).toEqual(
      engine.blackjackEngine!.publicState(),
    );
    expect(room.continueRound(spectator.id)?.code).toBe('NOT_SEATED');
    room.handleDisconnect(b.id);
    expect(engine.blackjackEngine!.publicState().result).toMatchObject({
      winnerId: a.id,
      reason: 'forfeit',
    });
  });
});
