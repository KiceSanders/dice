import type { BetALotStatePublic } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { FakeClient, startTestServer } from './harness.js';
import { createVisualFixture, finishVisualFixture } from './visual-betalot-fixture.js';
import { visualScenarios } from './visual-betalot-scenarios.js';

describe('on-demand Bet-a-lot visual fixtures over real WebSockets', () => {
  it.each(
    Object.keys(visualScenarios),
  )('%s reaches the target and produces the advertised payments', async (name) => {
    const server = await startTestServer();
    const observer = new FakeClient('Verifier');
    const url = `ws://127.0.0.1:${server.port}/ws`;
    const fixture = await createVisualFixture(url, name, 0);
    try {
      await observer.connect(url);
      observer.send({ type: 'room:join', roomId: fixture.roomId, playerName: observer.name });
      await observer.next('room:joined');
      const before = fixture.snapshot.game as BetALotStatePublic;
      expect(before.resolving).toBe(false);
      expect(before.currentDiceCount).toBe(fixture.scenario.rolls[0]!.length);
      if (fixture.scenario.sameWinner) {
        expect(
          before.fire.find((fire) => fire.playerId === fixture.identities[0]!.playerId)?.onFire,
        ).toBe(true);
      }
      if (name === 'history') expect(before.roundHistory).toHaveLength(10);
      if (name === 'payout-sequence') expect(before.sevensPot).toBe(1);
      await finishVisualFixture(fixture);
      for (const reason of fixture.scenario.payments) {
        const payment = await observer.next('betalot:paid');
        expect(payment).toMatchObject({ type: 'betalot:paid', reason });
        if (name === 'fire') expect(payment).toMatchObject({ amount: 2 });
        if (name === 'bankruptcy') expect(payment).toMatchObject({ amount: 10 });
      }
      if (name === 'bankruptcy') {
        const ended = await observer.nextWhere(
          (m) => m.type === 'room:state' && m.snapshot.phase === 'lobby',
          'bankruptcy',
        );
        if (ended.type === 'room:state') {
          expect(
            ended.snapshot.players.find((p) => p.id === fixture.identities[1]!.playerId)?.chips,
          ).toBe(0);
        }
      }
    } finally {
      observer.close();
      fixture.close();
      await server.close();
    }
  });
});
