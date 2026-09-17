import { DEFAULT_BLACKJACK_SETTINGS, isBlackjackState, type ServerMessage } from '@dice/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { PersistedRoomState } from '../../events.js';
import { replayRoom } from '../../persistence.js';
import { parseClientMessage } from '../../protocol.js';
import { Room } from '../../room.js';

const rooms: Room[] = [];
function room() {
  const messages: ServerMessage[] = [];
  const instance = new Room('JACK', { ...DEFAULT_BLACKJACK_SETTINGS, afterRollDelayMs: 0 });
  rooms.push(instance);
  const a = instance.addPlayer('Alice', { send: (m) => messages.push(m) }, { host: true });
  const b = instance.addPlayer('Bob', { send: () => {} });
  instance.requestSeat(a.id, 100);
  instance.requestSeat(b.id, 100);
  instance.approveSeat(b.id);
  expect(instance.startGame(a.id)).toBeNull();
  return { instance, a, b, messages };
}
afterEach(() =>
  rooms.splice(0).forEach((r) => {
    r.destroy();
  }),
);
describe('blackjack room and protocol', () => {
  it('validates settings, decisions, die ranges and pose shapes, and refuses unknown game kinds', () => {
    const parse = (value: unknown) => parseClientMessage(JSON.stringify(value)).ok;
    expect(
      parse({ type: 'room:create', playerName: 'A', settings: DEFAULT_BLACKJACK_SETTINGS }),
    ).toBe(true);
    for (const die of [1, 6, 12]) expect(parse({ type: 'blackjack:throwResult', die })).toBe(true);
    for (const die of [0, 13, 1.1, '12', null])
      expect(parse({ type: 'blackjack:throwResult', die })).toBe(false);
    expect(parse({ type: 'blackjack:throwResult', die: 12, restPose: [] })).toBe(false);
    expect(parse({ type: 'blackjack:decide', decision: 'hit' })).toBe(false);
    expect(parse({ type: 'blackjack:decide', decision: 'stand' })).toBe(true);
    expect(
      parse({
        type: 'room:create',
        playerName: 'A',
        settings: { ...DEFAULT_BLACKJACK_SETTINGS, kind: 'unknown' },
      }),
    ).toBe(false);
  });
  it('enforces two seats and an immutable game type, while snapshots expose the live total', () => {
    const { instance, a } = room();
    const spectator = instance.addPlayer('C', { send: () => {} });
    expect(instance.requestSeat(spectator.id, 100)?.code).toBe('ROOM_FULL');
    const engine = instance.blackjackEngine!;
    engine.beginThrow(a.id);
    engine.commitThrow(a.id, 5);
    const game = instance.buildSnapshot(spectator.id).game;
    expect(isBlackjackState(game) && game.hands[0]?.total).toBe(5);
    expect(instance.engine).toBeNull();
    expect(instance.betALotEngine).toBeNull();
    expect(instance.continueRound(spectator.id)?.code).toBe('NOT_SEATED');
  });
  it('recovers scores, standing decisions, overtime, tokens and payouts without paying twice', () => {
    const { instance, a, b } = room();
    let saved: PersistedRoomState | null = null;
    instance.recorder = {
      append: () => {},
      compact: (state) => {
        saved = structuredClone(state);
      },
    };
    const engine = instance.blackjackEngine!;
    for (const id of [a.id, b.id]) {
      engine.beginThrow(id);
      engine.commitThrow(id, 5);
      engine.decide(id, 'stand');
    }
    engine.beginThrow(b.id);
    engine.commitThrow(b.id, 12);
    engine.decide(b.id, 'stand');
    expect(saved).not.toBeNull();
    const restored = replayRoom('JACK', [{ type: 'snapshot', state: saved! }])!;
    rooms.push(restored);
    expect(restored.blackjackEngine!.publicState()).toMatchObject({
      overtime: 1,
      payout: 20,
      currentPlayerId: a.id,
    });
    expect(restored.rejoin(a.rejoinToken, { send: () => {} })?.id).toBe(a.id);
    expect(restored.rejoin(b.rejoinToken, { send: () => {} })?.id).toBe(b.id);
    const next = restored.blackjackEngine!;
    next.beginThrow(a.id);
    next.commitThrow(a.id, 11);
    next.decide(a.id, 'stand');
    expect(restored.players.get(b.id)?.chips).toBe(120);
    const paid = restored.buildPersistedState();
    const again = replayRoom('JACK', [{ type: 'snapshot', state: paid }])!;
    rooms.push(again);
    expect(again.players.get(b.id)?.chips).toBe(120);
    expect(again.blackjackEngine!.publicState().result?.amount).toBe(20);
  });
  it('forfeits either seated participant on kick, including the player waiting for their turn', () => {
    const { instance, a, b } = room();
    expect(instance.kick(b.id)).toBeNull();
    expect(instance.blackjackEngine!.publicState().result).toMatchObject({
      winnerId: a.id,
      reason: 'forfeit',
    });
    expect(instance.players.get(a.id)?.chips).toBe(110);
  });
});

it('recovers a kick during the reveal delay and still settles the removed player’s chips', () => {
  const { instance, a, b } = room();
  instance.updateSettings({ ...DEFAULT_BLACKJACK_SETTINGS, afterRollDelayMs: 10_000 });
  instance.blackjackEngine!.beginThrow(a.id);
  instance.blackjackEngine!.commitThrow(a.id, 4);
  instance.kick(b.id);
  const saved = instance.buildPersistedState();
  expect(saved.players.find((p) => p.id === b.id)?.seat).toBeNull();
  const restored = replayRoom('JACK', [
    { type: 'snapshot', state: JSON.parse(JSON.stringify(saved)) },
  ])!;
  rooms.push(restored);
  expect(restored.blackjackEngine!.publicState().result).toMatchObject({
    winnerId: a.id,
    reason: 'forfeit',
    amount: 10,
  });
  expect(restored.players.get(a.id)?.chips).toBe(110);
  expect(restored.players.get(b.id)?.chips).toBe(90);
});
