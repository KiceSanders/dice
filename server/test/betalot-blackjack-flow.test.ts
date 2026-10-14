import { type BetALotStatePublic, DEFAULT_BETALOT_SETTINGS, isBetALotState } from '@dice/shared';
import { expect, it } from 'vitest';
import { FakeClient, startTestServer } from './harness.js';

async function state(client: FakeClient, predicate: (game: BetALotStatePublic) => boolean) {
  return client.nextWhere(
    (m) => m.type === 'room:state' && isBetALotState(m.snapshot.game) && predicate(m.snapshot.game),
    'Bet-a-lot bonus state',
  );
}

it('routes live Blackjack commands and pose frames to both players and spectators after ladder round 10', async () => {
  const server = await startTestServer();
  const a = new FakeClient('Alice'),
    b = new FakeClient('Bob'),
    watcher = new FakeClient('Watcher');
  try {
    await Promise.all([a, b, watcher].map((c) => c.connect(`ws://127.0.0.1:${server.port}/ws`)));
    a.send({
      type: 'room:create',
      playerName: 'Alice',
      settings: { ...DEFAULT_BETALOT_SETTINGS, afterRollDelayMs: 0 },
    });
    const created = await a.next('room:created');
    if (created.type !== 'room:created') throw new Error('missing room');
    b.send({ type: 'room:join', roomId: created.roomId, playerName: 'Bob' });
    const joined = await b.next('room:joined');
    if (joined.type !== 'room:joined') throw new Error('missing identity');
    const aId = created.playerId,
      bId = joined.playerId;
    watcher.send({ type: 'room:join', roomId: created.roomId, playerName: 'Watcher' });
    await watcher.next('room:joined');
    a.send({ type: 'seat:request', buyIn: 500 });
    b.send({ type: 'seat:request', buyIn: 500 });
    await a.next('seat:requested');
    a.send({ type: 'seat:approve', playerId: bId });
    await a.nextWhere(
      (m) =>
        m.type === 'room:state' && m.snapshot.players.filter((p) => p.seat !== null).length === 2,
      'seated',
    );
    a.send({ type: 'game:start' });
    for (let round = 1; round <= 10; round++) {
      const opener = round % 2 ? a : b,
        opponent = round % 2 ? b : a;
      await state(opener, (g) => g.roundNumber === round && g.awaitingCall);
      if (round === 1) {
        a.send({ type: 'blackjack:throwStart' });
        expect(await a.next('error')).toMatchObject({ code: 'BAD_REQUEST' });
      }
      opener.send({ type: 'betalot:call', face: 6 });
      opener.send({ type: 'betalot:throwStart' });
      opener.send({ type: 'betalot:throwResult', dice: [3] });
      await state(
        opponent,
        (g) => g.roundNumber === round && g.currentDiceCount === 2 && !g.resolving,
      );
      opponent.send({ type: 'betalot:throwStart' });
      opponent.send({ type: 'betalot:throwResult', dice: [1, 2] });
      await state(a, (g) => g.roundNumber === round && g.currentPlayerId === null);
      a.send({ type: 'round:continue' });
    }
    for (const c of [a, b, watcher]) await state(c, (g) => g.blackjack?.bonus?.afterRound === 10);
    b.send({ type: 'blackjack:throwStart' });
    expect(await b.next('error')).toMatchObject({ code: 'NOT_YOUR_TURN' });
    watcher.send({ type: 'blackjack:decide', decision: 'stand' });
    expect(await watcher.next('error')).toMatchObject({ code: 'NOT_YOUR_TURN' });
    a.send({ type: 'round:continue' }); // cannot skip a live hand
    a.send({ type: 'blackjack:throwStart' });
    await a.next('blackjack:throwStarted');
    a.send({
      type: 'dice:frames',
      frames: [
        {
          t: 100,
          bodies: [
            [0, 0, 0, 0, 0, 0, 1],
            [0, 0.07, 0, 0, 0, 0, 1],
          ],
        },
      ],
    });
    for (const c of [b, watcher])
      expect(await c.next('dice:frames')).toMatchObject({ playerId: aId });
    a.send({ type: 'blackjack:throwResult', die: 5 });
    await state(a, (g) => g.blackjack?.awaitingDecision === true);
    a.send({ type: 'blackjack:decide', decision: 'stand' });
    await state(b, (g) => g.blackjack?.currentPlayerId === bId);
    b.send({ type: 'blackjack:throwStart' });
    b.send({ type: 'blackjack:throwResult', die: 4 });
    await state(b, (g) => g.blackjack?.currentPlayerId === bId && g.blackjack.awaitingDecision);
    b.send({ type: 'blackjack:decide', decision: 'stand' });
    for (const c of [a, b, watcher]) {
      expect(await c.next('blackjack:roundEnded')).toMatchObject({
        winnerId: aId,
        loserId: bId,
        amount: 10,
      });
      const result = await state(c, (g) => Boolean(g.blackjack?.result));
      expect(
        result.type === 'room:state' &&
          result.snapshot.players.filter((p) => p.seat !== null).map((p) => p.chips),
      ).toEqual([510, 490]);
    }
    a.send({ type: 'round:continue' });
    b.send({ type: 'round:continue' });
    for (const c of [a, b, watcher])
      await state(c, (g) => g.roundNumber === 11 && !g.blackjack && g.currentPlayerId === aId);
  } finally {
    a.close();
    b.close();
    watcher.close();
    await server.close();
  }
});
