import { type BlackjackStatePublic, isBlackjackState } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { startTestServer } from './harness.js';
import {
  blackjackVisualScenarios,
  createBlackjackVisualFixture,
} from './visual-blackjack-fixture.js';

describe('Blackjack recording presets', () => {
  it.each(Object.keys(blackjackVisualScenarios))('%s reaches the intended result', async (name) => {
    const server = await startTestServer();
    let fixture: Awaited<ReturnType<typeof createBlackjackVisualFixture>> | undefined;
    try {
      fixture = await createBlackjackVisualFixture(`ws://127.0.0.1:${server.port}/ws`, name, 0);
      const { scenario, clients, actor, identities, waitState } = fixture;
      const game = fixture.snapshot.game as BlackjackStatePublic;
      expect(game.dieSides).toBe(name === 'blackjack-overtime' ? 12 : 6);
      expect(game.payout).toBe(scenario.payout);
      const player = clients[actor]!;
      let snapshot = fixture.snapshot;
      for (const [i, dice] of scenario.rolls.entries()) {
        const before = snapshot.game as BlackjackStatePublic;
        player.send({ type: 'blackjack:throwStart' });
        player.send({ type: 'blackjack:throwResult', die: dice[0]! });
        snapshot = await waitState(
          (_s, g) =>
            g.turnNumber === before.turnNumber &&
            !g.resolving &&
            (g.awaitingDecision || g.result !== null),
        );
        const decision = scenario.decisions[i];
        if (decision) {
          player.send({ type: 'blackjack:decide', decision });
          snapshot = await waitState((_s, g) => g.turnNumber > before.turnNumber);
        }
      }
      expect(isBlackjackState(snapshot.game) && snapshot.game.result).toMatchObject({
        amount: scenario.payout,
        winnerId: identities[scenario.winner === 'actor' ? actor : 1 - actor]!.playerId,
      });
      expect(snapshot.players.reduce((sum, player) => sum + player.chips, 0)).toBe(200);
    } finally {
      fixture?.close();
      await server.close();
    }
  });
});
