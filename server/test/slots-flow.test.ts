import {
  DEFAULT_BETALOT_SETTINGS,
  isBetALotState,
  type LiveSlotBonus,
  type RoomSnapshot,
} from '@dice/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StartedServer } from '../src/startServer.js';
import { FakeClient, startTestServer } from './harness.js';

vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomInt: () => 0,
}));

async function state(client: FakeClient, predicate: (room: RoomSnapshot) => boolean) {
  const message = await client.nextWhere(
    (m) => m.type === 'room:state' && predicate(m.snapshot),
    'slot room state',
  );
  if (message.type !== 'room:state') throw new Error('missing snapshot');
  return message.snapshot;
}

function active(room: RoomSnapshot): LiveSlotBonus | null {
  return isBetALotState(room.game) ? room.game.slots.active : null;
}

describe('earned slots over real WebSockets', () => {
  let server: StartedServer;
  const a = new FakeClient('Alice');
  const b = new FakeClient('Bob');
  const viewer = new FakeClient('Viewer');
  const rejoined = new FakeClient('Alice rejoined');
  beforeAll(async () => {
    server = await startTestServer();
    await Promise.all(
      [a, b, viewer].map((client) => client.connect(`ws://127.0.0.1:${server.port}/ws`)),
    );
  });
  afterAll(async () => {
    for (const client of [a, b, viewer, rejoined]) client.close();
    await server?.close();
  });

  it('shares the bonus, restricts controls, survives a mid-spin rejoin, pays once and resumes the ladder', async () => {
    a.send({
      type: 'room:create',
      playerName: 'Alice',
      settings: { ...DEFAULT_BETALOT_SETTINGS, afterRollDelayMs: 0 },
    });
    const created = await a.next('room:created');
    if (created.type !== 'room:created') throw new Error('room missing');
    b.send({ type: 'room:join', roomId: created.roomId, playerName: 'Bob' });
    const joined = await b.next('room:joined');
    if (joined.type !== 'room:joined') throw new Error('player missing');
    a.send({ type: 'seat:request', buyIn: 100 });
    b.send({ type: 'seat:request', buyIn: 100 });
    await a.next('seat:requested');
    a.send({ type: 'seat:approve', playerId: joined.playerId });
    await state(a, (room) => room.players.every((p) => p.seat !== null));
    viewer.send({ type: 'room:join', roomId: created.roomId, playerName: 'Viewer' });
    await viewer.next('room:joined');
    a.send({ type: 'game:start' });
    await state(a, (room) => room.phase === 'playing');
    for (const [index, opener] of [a, b, a].entries()) {
      const opponent = opener === a ? b : a;
      const openerId = opener === a ? created.playerId : joined.playerId;
      opener.send({ type: 'betalot:call', face: 3 });
      opener.send({ type: 'betalot:throwStart' });
      opener.send({ type: 'betalot:throwResult', dice: [3] });
      for (const client of [a, b, viewer]) {
        expect(await client.next('betalot:slotTicket')).toMatchObject({ playerId: openerId });
      }
      await state(
        opponent,
        (room) =>
          isBetALotState(room.game) &&
          room.game.roundNumber === index + 1 &&
          room.game.currentDiceCount === 2,
      );
      opponent.send({ type: 'betalot:throwStart' });
      opponent.send({ type: 'betalot:throwResult', dice: [1, 2] });
      await a.next('betalot:roundEnded');
      a.send({ type: 'round:continue' });
      if (index < 2) {
        const next = await state(
          a,
          (room) => isBetALotState(room.game) && room.game.roundNumber === index + 2,
        );
        expect(isBetALotState(next.game) && next.game.slots).toEqual({
          tickets: index === 0 ? [created.playerId] : [created.playerId, joined.playerId],
          active: null,
        });
      }
    }
    const initial = active(await state(a, (room) => active(room)?.round.phase === 'ready'))!;
    expect(active(await state(viewer, (room) => active(room)?.id === initial.id))).toEqual(initial);
    const spin = {
      type: 'betalot:slotsAction',
      bonusId: initial.id,
      revision: initial.revision,
      action: 'spin',
    } as const;
    viewer.send(spin);
    expect(await viewer.next('error')).toMatchObject({ code: 'NOT_YOUR_TURN' });
    b.send(spin);
    expect(await b.next('error')).toMatchObject({ code: 'NOT_YOUR_TURN' });
    b.send({ type: 'round:continue' });
    a.send(spin);
    a.send(spin);
    expect(await a.next('error')).toMatchObject({ code: 'BAD_REQUEST' });
    const pending = active(
      await state(viewer, (room) => active(room)?.round.phase === 'spinning'),
    )!;
    a.close();
    await rejoined.connect(`ws://127.0.0.1:${server.port}/ws`);
    rejoined.send({
      type: 'room:join',
      roomId: created.roomId,
      playerName: 'Alice',
      rejoinToken: created.rejoinToken,
    });
    const recovery = await rejoined.next('room:joined');
    if (recovery.type !== 'room:joined') throw new Error('rejoin missing');
    expect(active(recovery.snapshot)?.id).toBe(initial.id);
    expect(active(recovery.snapshot)?.round.spinsUsed).toBe(1);
    const settled = active(
      await state(rejoined, (room) => active(room)?.round.phase === 'choosing'),
    )!;
    expect(settled.round.dice).toEqual(pending.round.pendingDice);
    rejoined.send({
      type: 'betalot:slotsAction',
      bonusId: settled.id,
      revision: settled.revision,
      action: 'lock',
      index: 0,
      locked: true,
    });
    const locked = active(await state(viewer, (room) => active(room)?.round.locked[0] === true))!;
    rejoined.send({
      type: 'betalot:slotsAction',
      bonusId: locked.id,
      revision: locked.revision,
      action: 'collect',
    });
    for (const client of [b, viewer, rejoined]) {
      expect(
        await client.nextWhere(
          (m) => m.type === 'betalot:paid' && m.reason === 'slots',
          'slot payment',
        ),
      ).toMatchObject({ amount: 30, toPlayerId: created.playerId });
    }
    const result = await state(rejoined, (room) => active(room)?.round.phase === 'complete');
    expect(result.players.find((p) => p.id === created.playerId)?.chips).toBe(138);
    expect(result.players.find((p) => p.id === joined.playerId)?.chips).toBe(62);
    const bonus = active(result)!;
    rejoined.send({
      type: 'betalot:slotsAction',
      bonusId: bonus.id,
      revision: bonus.revision,
      action: 'continue',
    });
    await state(
      viewer,
      (room) =>
        isBetALotState(room.game) &&
        room.game.roundNumber === 4 &&
        room.game.currentPlayerId === joined.playerId &&
        !room.game.slots.active,
    );
  }, 10_000);
});
