import {
  type BlackjackStatePublic,
  DEFAULT_BLACKJACK_SETTINGS,
  isBlackjackState,
  polyhedralFaceUp,
  type RoomSnapshot,
} from '@dice/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StartedServer } from '../src/startServer.js';
import { FakeClient, startTestServer } from './harness.js';

async function state(
  client: FakeClient,
  predicate: (game: BlackjackStatePublic, room: RoomSnapshot) => boolean,
) {
  const message = await client.nextWhere(
    (m) =>
      m.type === 'room:state' &&
      isBlackjackState(m.snapshot.game) &&
      predicate(m.snapshot.game, m.snapshot),
    'blackjack state',
  );
  if (message.type !== 'room:state' || !isBlackjackState(message.snapshot.game))
    throw new Error('expected blackjack snapshot');
  return message.snapshot.game;
}

describe('Blackjack over real WebSockets', () => {
  let server: StartedServer;
  const a = new FakeClient('Alice'),
    b = new FakeClient('Bob'),
    spectator = new FakeClient('Viewer');
  beforeAll(async () => {
    server = await startTestServer();
    const url = `ws://127.0.0.1:${server.port}/ws`;
    await Promise.all([a, b, spectator].map((client) => client.connect(url)));
  });
  afterAll(async () => {
    a.close();
    b.close();
    spectator.close();
    await server?.close();
  });

  it('plays ties, d12 overtime, broadcasts both totals and standing status, and pays once', async () => {
    a.send({
      type: 'room:create',
      playerName: 'Alice',
      settings: { ...DEFAULT_BLACKJACK_SETTINGS, afterRollDelayMs: 10 },
    });
    const created = await a.next('room:created');
    if (created.type !== 'room:created') throw new Error('missing room');
    b.send({ type: 'room:join', roomId: created.roomId, playerName: 'Bob' });
    const joined = await b.next('room:joined');
    if (joined.type !== 'room:joined') throw new Error('missing identity');
    const aId = created.playerId,
      bId = joined.playerId;
    a.send({ type: 'seat:request', buyIn: 100 });
    b.send({ type: 'seat:request', buyIn: 100 });
    await a.next('seat:requested');
    a.send({ type: 'seat:approve', playerId: bId });
    await a.nextWhere(
      (m) => m.type === 'room:state' && m.snapshot.players.every((p) => p.seat !== null),
      'seated',
    );
    a.send({ type: 'game:start' });
    await state(a, (g) => g.currentPlayerId === aId);
    b.send({ type: 'blackjack:throwStart' });
    expect(await b.next('error')).toMatchObject({ code: 'NOT_YOUR_TURN' });
    a.send({ type: 'turn:throwStart', keepIndices: [] });
    expect(await a.next('error')).toMatchObject({ code: 'BAD_REQUEST' });
    a.send({ type: 'room:list' });
    expect(await a.next('rooms:list')).toMatchObject({ rooms: [{ roundNumber: 1 }] });

    async function roll(client: FakeClient, id: string, die: number, overtime: number) {
      client.send({ type: 'blackjack:throwStart' });
      await client.nextWhere(
        (m) => m.type === 'blackjack:throwStarted' && m.playerId === id,
        'throw started',
      );
      const restPose: [number, number, number, number, number, number, number][] = [
        [0, 0.07, 0, ...polyhedralFaceUp(die, overtime ? 12 : 6)],
      ];
      client.send({
        type: 'dice:frames',
        frames: [{ t: 100, cupVisible: false, bodies: [[0, 0, 0, 0, 0, 0, 1], ...restPose] }],
      });
      client.send({ type: 'blackjack:throwResult', die, restPose });
      await client.nextWhere(
        (m) => m.type === 'blackjack:rolled' && m.playerId === id && m.die === die,
        'rolled',
      );
      await state(
        client,
        (g) =>
          g.overtime === overtime &&
          g.currentPlayerId === id &&
          g.awaitingDecision &&
          g.tableDie?.die === die,
      );
      client.send({ type: 'blackjack:decide', decision: 'stand' });
    }
    await roll(a, aId, 5, 0);
    await state(b, (g) => g.currentPlayerId === bId && g.hands[0]?.stood === true);
    spectator.send({ type: 'room:join', roomId: created.roomId, playerName: 'Viewer' });
    const view = await spectator.next('room:joined');
    expect(view.type === 'room:joined' && view.snapshot.game).toMatchObject({
      hands: [{ playerId: aId, total: 5, stood: true }, { total: 0 }],
    });
    await roll(b, bId, 5, 0);
    await state(
      a,
      (g) => g.overtime === 1 && g.payout === 20 && g.hands.every((h) => h.total === 0),
    );
    await roll(b, bId, 11, 1);
    await state(a, (g) => g.overtime === 1 && g.currentPlayerId === aId && !g.tableDie);
    await roll(a, aId, 11, 1);
    await state(b, (g) => g.overtime === 2 && g.payout === 40);
    await roll(a, aId, 12, 2);
    await state(b, (g) => g.overtime === 2 && g.currentPlayerId === bId && !g.tableDie);
    await roll(b, bId, 10, 2);
    for (const viewer of [a, b, spectator]) {
      expect(await viewer.next('blackjack:roundEnded')).toMatchObject({
        winnerId: aId,
        loserId: bId,
        amount: 40,
      });
      await state(
        viewer,
        (g, room) =>
          Boolean(g.result) &&
          room.players.find((p) => p.id === aId)?.chips === 140 &&
          room.players.find((p) => p.id === bId)?.chips === 60,
      );
    }
    expect(await spectator.next('dice:frames')).toMatchObject({ playerId: bId });
    spectator.send({ type: 'round:continue' });
    expect(await spectator.next('error')).toMatchObject({ code: 'NOT_SEATED' });
    a.send({ type: 'round:continue' });
    b.send({ type: 'round:continue' });
    await state(
      a,
      (g) =>
        g.roundNumber === 2 && g.dieSides === 6 && g.payout === 10 && g.currentPlayerId === bId,
    );
  });
});
