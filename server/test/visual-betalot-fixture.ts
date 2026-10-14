import {
  type BetALotStatePublic,
  DEFAULT_BETALOT_SETTINGS,
  type Die,
  type RoomSnapshot,
  type ServerMessage,
} from '@dice/shared';
import { FakeClient } from './harness.js';
import { type VisualScenario, visualScenarios } from './visual-betalot-scenarios.js';

type Identity = { playerId: string; rejoinToken: string; playerName: string };

export async function createVisualFixture(url: string, scenarioName: string, revealDelay = 2000) {
  const scenario = visualScenarios[scenarioName];
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioName}`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
    throw new Error('Visual fixtures only connect to a local development server');
  }
  const alice = new FakeClient('Test Alice');
  const bob = new FakeClient('Test Bob');
  const observer = new FakeClient('Test Observer');
  const clients = [alice, bob, observer];
  const close = () => {
    for (const client of clients) client.close();
  };
  try {
    await Promise.all(clients.map((client) => client.connect(url)));
    const settings = { ...DEFAULT_BETALOT_SETTINGS, ...scenario.settings, afterRollDelayMs: 0 };
    alice.send({ type: 'room:create', playerName: alice.name, settings });
    const created = await alice.next('room:created');
    if (created.type !== 'room:created') throw new Error('Expected room creation');
    const roomId = created.roomId;
    const identities: Identity[] = [
      {
        playerId: created.playerId,
        rejoinToken: created.rejoinToken,
        playerName: alice.name,
      },
    ];
    for (const client of [bob, observer]) {
      client.send({ type: 'room:join', roomId, playerName: client.name });
      const joined = await client.next('room:joined');
      if (joined.type !== 'room:joined') throw new Error('Expected room join');
      identities.push({
        playerId: joined.playerId,
        rejoinToken: joined.rejoinToken,
        playerName: client.name,
      });
    }
    const byId = new Map(identities.map((identity, i) => [identity.playerId, clients[i]!]));
    const waitState = async (
      predicate: (snapshot: RoomSnapshot, game: BetALotStatePublic) => boolean,
    ) => {
      const message = await observer.nextWhere(
        (message) =>
          message.type === 'room:state' &&
          message.snapshot.game !== null &&
          'kind' in message.snapshot.game &&
          message.snapshot.game.kind === 'betalot' &&
          predicate(message.snapshot, message.snapshot.game),
        'visual fixture state',
      );
      if (message.type !== 'room:state') throw new Error('Expected snapshot');
      return message.snapshot;
    };
    alice.send({ type: 'seat:request', buyIn: scenario.buyIns?.[0] ?? 100 });
    bob.send({ type: 'seat:request', buyIn: scenario.buyIns?.[1] ?? 100 });
    const request = await alice.next('seat:requested');
    if (request.type !== 'seat:requested') throw new Error('Expected seat request');
    alice.send({ type: 'seat:approve', playerId: request.playerId });
    await observer.nextWhere(
      (message) =>
        message.type === 'room:state' &&
        message.snapshot.players.filter((player) => player.seat !== null).length === 2,
      'two seats',
    );
    alice.send({ type: 'game:start' });
    let snapshot = await waitState((snapshot) => snapshot.phase === 'playing');
    const game = () => snapshot.game as BetALotStatePublic;
    const roller = () => byId.get(game().currentPlayerId!)!;
    const throwDice = async (dice: Die[]) => {
      const before = game();
      const active = roller();
      // Setup throws must not earn a slot ticket and interrupt a Fire/history preset.
      // The scenario's actual opening-call check still uses its requested face below.
      if (before.awaitingCall) active.send({ type: 'betalot:call', face: dice[0] === 6 ? 5 : 6 });
      active.send({ type: 'betalot:throwStart' });
      active.send({ type: 'betalot:throwResult', dice });
      await observer.next('betalot:rolled');
      snapshot = await waitState(
        (s, g) =>
          g.roundNumber === before.roundNumber &&
          !g.resolving &&
          (s.phase !== 'playing' ||
            g.currentDiceCount !== before.currentDiceCount ||
            g.extraRoll !== null),
      );
    };
    for (let round = 0; round < (scenario.wins ?? 0); round++) {
      const openerIsAlice = game().openerId === identities[0]!.playerId;
      if (scenario.sameWinner && !openerIsAlice) {
        await throwDice([6]);
        await throwDice([3, 5]);
        await throwDice([1, 2, 3]);
      } else {
        await throwDice([3]);
        await throwDice([1, 2]);
      }
      const roundNumber = game().roundNumber;
      alice.send({ type: 'round:continue' });
      snapshot = await waitState(
        (s, g) =>
          (s.phase === 'playing' && g.roundNumber === roundNumber + 1) ||
          g.blackjack?.bonus?.afterRound === roundNumber,
      );
      // History presets cross round 10. Play its scheduled hand through the real protocol.
      while (game().blackjack && !game().blackjack!.result) {
        const bonus = game().blackjack!;
        const active = byId.get(bonus.currentPlayerId!)!;
        active.send({ type: 'blackjack:throwStart' });
        active.send({
          type: 'blackjack:throwResult',
          die: bonus.currentPlayerId === bonus.openerId ? 5 : 4,
        });
        snapshot = await waitState(
          (_s, g) => g.blackjack?.turnNumber === bonus.turnNumber && g.blackjack.awaitingDecision,
        );
        active.send({ type: 'blackjack:decide', decision: 'stand' });
        snapshot = await waitState(
          (_s, g) =>
            Boolean(g.blackjack?.result) ||
            Boolean(g.blackjack && g.blackjack.turnNumber > bonus.turnNumber),
        );
      }
      if (game().blackjack?.result) alice.send({ type: 'round:continue' });
      else continue;
      snapshot = await waitState(
        (s, g) => s.phase === 'playing' && g.roundNumber === roundNumber + 1,
      );
    }
    for (const dice of scenario.setup) await throwDice(dice);
    alice.send({
      type: 'settings:update',
      settings: { ...settings, afterRollDelayMs: revealDelay },
    });
    snapshot = await waitState(
      (s, g) =>
        s.settings.afterRollDelayMs === revealDelay &&
        g.roundNumber === (scenario.wins ?? 0) + 1 &&
        g.ladder.length === scenario.setup.length &&
        !g.resolving &&
        !g.throwing,
    );
    const actorId = game().currentPlayerId!;
    const actor = identities.findIndex((identity) => identity.playerId === actorId);
    return { roomId, scenario, snapshot, identities, actor, clients, observer, close, waitState };
  } catch (error) {
    close();
    throw error;
  }
}

export function visualTestUrl(
  origin: string,
  roomId: string,
  identity: Identity,
  rolls: number[][],
  kind: 'betalot' | 'blackjack' = 'betalot',
) {
  const fragment = new URLSearchParams({
    visualTest: JSON.stringify({ roomId, ...identity, rolls, kind }),
  });
  return `${origin}/room/${roomId}#${fragment}`;
}

/** Protocol-only fixture check. Browser runs use Test roll or a manual cup release. */
export async function finishVisualFixture(
  fixture: Awaited<ReturnType<typeof createVisualFixture>>,
) {
  const client = fixture.clients[fixture.actor]!;
  if ((fixture.snapshot.game as BetALotStatePublic).awaitingCall) {
    client.send({ type: 'betalot:call', face: fixture.scenario.call ?? 6 });
  }
  for (const [index, dice] of fixture.scenario.rolls.entries()) {
    if (index === 0) {
      client.send({ type: 'betalot:throwStart' });
      client.send({ type: 'betalot:throwResult', dice });
    } else {
      client.send({ type: 'betalot:extraThrowStart' });
      client.send({ type: 'betalot:extraThrowResult', die: dice[0]! });
    }
    await fixture.observer.next(index === 0 ? 'betalot:rolled' : 'betalot:extraRolled');
    await fixture.waitState(
      (snapshot, game) =>
        !game.resolving &&
        (snapshot.phase !== 'playing' ||
          game.extraRoll !== null ||
          game.currentPlayerId !== fixture.identities[fixture.actor]!.playerId),
    );
  }
}

export type { ServerMessage, VisualScenario };
