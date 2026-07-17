import { DEFAULT_SETTINGS } from '@dice/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StartedServer } from '../src/startServer.js';
import { FakeClient, startTestServer } from './harness.js';

const settings = {
  ...DEFAULT_SETTINGS,
  chipsPerRound: 2,
  maxRolls: 3,
  minBuyIn: 10,
  maxBuyIn: 1000,
};

describe('WS integration: throw handshake', () => {
  let server: StartedServer;
  let host: FakeClient;
  let guest: FakeClient;
  let url: string;

  beforeAll(async () => {
    server = await startTestServer();
    url = `ws://127.0.0.1:${server.port}/ws`;
    host = new FakeClient('host');
    guest = new FakeClient('guest');
    await Promise.all([host.connect(url), guest.connect(url)]);
  }, 15_000);

  afterAll(async () => {
    host?.close();
    guest?.close();
    await server?.close();
  });

  it('create → seat → start → throwStart/Result → stand', async () => {
    host.send({ type: 'room:create', playerName: 'Host', settings });
    const created = await host.next('room:created');
    expect(created.type).toBe('room:created');
    if (created.type !== 'room:created') return;

    guest.send({ type: 'room:join', roomId: created.roomId, playerName: 'Guest' });
    await guest.next('room:joined');

    host.send({ type: 'seat:request', buyIn: 50 });
    guest.send({ type: 'seat:request', buyIn: 50 });
    const req = await host.next('seat:requested');
    expect(req.type).toBe('seat:requested');
    if (req.type === 'seat:requested') {
      host.send({ type: 'seat:approve', playerId: req.playerId });
    }

    await host.nextWhere(
      (m) =>
        m.type === 'room:state' && m.snapshot.players.filter((p) => p.seat !== null).length === 2,
      'both seated',
    );

    host.send({ type: 'game:start' });
    await host.next('round:started');
    const playing = await host.nextWhere(
      (m) =>
        m.type === 'room:state' &&
        m.snapshot.phase === 'playing' &&
        m.snapshot.game?.currentTurn != null,
      'game started with turn',
    );
    expect(playing.type).toBe('room:state');
    if (playing.type !== 'room:state' || !playing.snapshot.game?.currentTurn) return;

    const rollerId = playing.snapshot.game.currentTurn.playerId;
    const roller = rollerId === created.playerId ? host : guest;

    roller.send({ type: 'turn:throwStart', keepIndices: [] });
    await roller.nextWhere(
      (m) => m.type === 'turn:throwStarted' && m.playerId === rollerId,
      'throwStarted',
    );

    const dice = [2, 2, 2, 4, 5] as const;
    roller.send({ type: 'turn:throwResult', dice: [...dice] });
    const rolled = await roller.nextWhere(
      (m) => m.type === 'turn:rolled' && m.playerId === rollerId,
      'turn:rolled',
    );
    expect(rolled.type).toBe('turn:rolled');
    if (rolled.type === 'turn:rolled') {
      expect(rolled.dice).toEqual([...dice]);
    }

    roller.send({ type: 'turn:stand' });
    await host.nextWhere(
      (m) =>
        m.type === 'room:state' &&
        m.snapshot.game?.currentTurn?.playerId !== undefined &&
        m.snapshot.game.currentTurn.playerId !== rollerId,
      'turn advanced',
    );
  }, 20_000);
});
