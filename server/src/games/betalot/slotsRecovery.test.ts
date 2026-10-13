import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_BETALOT_SETTINGS, SLOT_REVEAL_MS } from '@dice/shared';
import { expect, it, vi } from 'vitest';
import { RoomLogStore, recoverRooms } from '../../persistence.js';
import { RoomManager } from '../../roomManager.js';
import type { BetALotEngine } from './engine.js';
import { SLOT_RESULT_MS } from './slots.js';

vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomInt: () => 0,
}));

it('persists pending faces, locks and spent tickets, then recovers a paid bonus without paying twice', async () => {
  vi.useFakeTimers();
  const dir = await mkdtemp(path.join(tmpdir(), 'dice-slots-recovery-'));
  const managers: RoomManager[] = [];
  const stores: RoomLogStore[] = [];
  const make = () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    stores.push(store);
    managers.push(manager);
    return { store, manager };
  };
  const link = { send: () => {} };
  const action = (engine: BetALotEngine, playerId: string, kind: 'spin' | 'collect') => {
    const bonus = engine.publicState().slots.active!;
    expect(
      engine.slotsAction(playerId, {
        type: 'betalot:slotsAction',
        bonusId: bonus.id,
        revision: bonus.revision,
        action: kind,
      }),
    ).toBeNull();
  };
  try {
    const first = make();
    const room = first.manager.create({ ...DEFAULT_BETALOT_SETTINGS, afterRollDelayMs: 0 });
    const a = room.addPlayer('Alice', link, { host: true });
    const b = room.addPlayer('Bob', link);
    room.requestSeat(a.id, 100);
    room.requestSeat(b.id, 100);
    room.approveSeat(b.id);
    room.startGame(a.id);
    let engine = room.betALotEngine!;
    engine.call(a.id, 3);
    engine.beginThrow(a.id);
    engine.commitThrow(a.id, [3]);
    engine.beginThrow(b.id);
    engine.commitThrow(b.id, [1, 2]);
    engine.continueRound();
    expect(engine.publicState().slots).toEqual({ tickets: [a.id], active: null });
    await first.store.flush();
    first.manager.stop();

    const banked = make();
    expect(await recoverRooms(banked.store, banked.manager)).toBe(1);
    const savedRoom = banked.manager.get(room.id)!;
    engine = savedRoom.betALotEngine!;
    expect(engine.publicState().slots).toEqual({ tickets: [a.id], active: null });
    savedRoom.rejoin(a.rejoinToken, link);
    for (const [opener, opponent] of [
      [b.id, a.id],
      [a.id, b.id],
    ] as const) {
      engine.call(opener, 3);
      engine.beginThrow(opener);
      engine.commitThrow(opener, [3]);
      engine.beginThrow(opponent);
      engine.commitThrow(opponent, [1, 2]);
      engine.continueRound();
    }
    action(engine, a.id, 'spin');
    vi.advanceTimersByTime(SLOT_REVEAL_MS);
    const bonus = engine.publicState().slots.active!;
    engine.slotsAction(a.id, {
      type: 'betalot:slotsAction',
      bonusId: bonus.id,
      revision: bonus.revision,
      action: 'lock',
      index: 0,
      locked: true,
    });
    action(engine, a.id, 'spin');
    const pending = engine.publicState().slots;
    await banked.store.flush();
    banked.manager.stop();

    const second = make();
    expect(await recoverRooms(second.store, second.manager)).toBe(1);
    const restored = second.manager.get(room.id)!;
    expect(restored.betALotEngine!.publicState().slots).toEqual(pending);
    restored.rejoin(a.rejoinToken, link);
    vi.advanceTimersByTime(SLOT_REVEAL_MS);
    expect(restored.betALotEngine!.publicState().slots.active?.round.dice).toEqual(
      pending.active?.round.pendingDice,
    );
    expect(restored.betALotEngine!.publicState().slots.tickets).toEqual([b.id]);
    action(restored.betALotEngine!, a.id, 'collect');
    expect(restored.players.get(a.id)?.chips).toBe(138);
    expect(restored.players.get(b.id)?.chips).toBe(62);
    await second.store.flush();
    second.manager.stop();

    const third = make();
    expect(await recoverRooms(third.store, third.manager)).toBe(1);
    const paid = third.manager.get(room.id)!;
    paid.rejoin(a.rejoinToken, link);
    vi.advanceTimersByTime(SLOT_RESULT_MS);
    expect(paid.players.get(a.id)?.chips).toBe(138);
    expect(paid.players.get(b.id)?.chips).toBe(62);
    expect(paid.betALotEngine!.roundNumber).toBe(4);
  } finally {
    for (const manager of managers) manager.stop();
    for (const store of stores) await store.flush();
    await rm(dir, { recursive: true, force: true });
    vi.useRealTimers();
  }
});
