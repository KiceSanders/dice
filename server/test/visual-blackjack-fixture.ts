import {
  type BlackjackStatePublic,
  DEFAULT_BLACKJACK_SETTINGS,
  isBlackjackState,
  type RoomSnapshot,
} from '@dice/shared';
import { FakeClient } from './harness.js';

type SetupTurn = [die: number, decision: 'stand' | 'continue'];
type BlackjackScenario = {
  description: string;
  setup: SetupTurn[];
  rolls: number[][];
  call?: undefined;
  decisions: ('stand' | 'continue')[];
  review: string;
  payout: number;
  winner: 'actor' | 'opponent';
};

export const blackjackVisualScenarios: Record<string, BlackjackScenario> = {
  'blackjack-overtime': {
    description:
      'Tied fives enter overtime; Bob stands on 10, Alice throws a twelve-sided 12 to win 20.',
    setup: [
      [5, 'stand'],
      [5, 'stand'],
      [10, 'stand'],
    ],
    rolls: [[12]],
    decisions: [],
    payout: 20,
    winner: 'actor',
    review:
      'Overtime 1 / 20 chips, Bob standing at 10; Alice rolls a visible d12 showing 12, wins after the reveal, stacks 120/80. Next round returns to d6 / 10 chips.',
  },
  'blackjack-bust': {
    description: 'Alice stands on 18; Bob has 17 and throws 6, busting at 23.',
    setup: [
      [6, 'continue'],
      [6, 'continue'],
      [6, 'continue'],
      [6, 'continue'],
      [6, 'stand'],
      [5, 'continue'],
    ],
    rolls: [[6]],
    decisions: [],
    payout: 10,
    winner: 'opponent',
    review:
      'Prior dice remain beside both seats; Bob totals 23, busts after the reveal, Alice wins 10; stacks Alice 110, Bob 90.',
  },
  'blackjack-decisions': {
    description: 'Alice stands on 6; Bob rolls 3, chooses Continue, then rolls 4 and wins on 7.',
    setup: [[6, 'stand']],
    rolls: [[3], [4]],
    decisions: ['continue'],
    payout: 10,
    winner: 'actor',
    review:
      'Stand/Continue appear after the first reveal; Continue parks the 3 and gives Bob a fresh cup. The 4 brings Bob to 7 and pays 10 after the reveal; stacks Alice 90, Bob 110.',
  },
};

export async function createBlackjackVisualFixture(
  url: string,
  scenarioName: string,
  revealDelay = 2000,
) {
  const scenario = blackjackVisualScenarios[scenarioName];
  if (!scenario) throw new Error(`Unknown Blackjack scenario: ${scenarioName}`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
    throw new Error('Visual fixtures only connect to a local development server');
  }
  const clients = [
    new FakeClient('Test Alice'),
    new FakeClient('Test Bob'),
    new FakeClient('Test Observer'),
  ];
  const [alice, bob, observer] = clients as [FakeClient, FakeClient, FakeClient];
  const close = () => {
    for (const client of clients) client.close();
  };
  try {
    await Promise.all(clients.map((client) => client.connect(url)));
    const settings = { ...DEFAULT_BLACKJACK_SETTINGS, afterRollDelayMs: 0 };
    alice.send({ type: 'room:create', playerName: alice.name, settings });
    const created = await alice.next('room:created');
    if (created.type !== 'room:created') throw new Error('Expected room creation');
    const roomId = created.roomId;
    const identities = [
      { playerId: created.playerId, rejoinToken: created.rejoinToken, playerName: alice.name },
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
    alice.send({ type: 'seat:request', buyIn: 100 });
    bob.send({ type: 'seat:request', buyIn: 100 });
    await alice.next('seat:requested');
    alice.send({ type: 'seat:approve', playerId: identities[1]!.playerId });
    await observer.nextWhere(
      (m) =>
        m.type === 'room:state' && m.snapshot.players.filter((p) => p.seat !== null).length === 2,
      'two seats',
    );
    const waitState = async (
      predicate: (snapshot: RoomSnapshot, game: BlackjackStatePublic) => boolean,
    ) => {
      const message = await observer.nextWhere(
        (m) =>
          m.type === 'room:state' &&
          isBlackjackState(m.snapshot.game) &&
          predicate(m.snapshot, m.snapshot.game),
        'Blackjack visual state',
      );
      if (message.type !== 'room:state') throw new Error('Expected snapshot');
      return message.snapshot;
    };
    alice.send({ type: 'game:start' });
    let snapshot = await waitState((s) => s.phase === 'playing');
    for (const [die, decision] of scenario.setup) {
      const before = snapshot.game as BlackjackStatePublic;
      const active = clients[identities.findIndex((id) => id.playerId === before.currentPlayerId)]!;
      active.send({ type: 'blackjack:throwStart' });
      active.send({ type: 'blackjack:throwResult', die });
      await waitState(
        (_s, g) =>
          g.turnNumber === before.turnNumber && g.awaitingDecision && g.tableDie?.die === die,
      );
      active.send({ type: 'blackjack:decide', decision });
      snapshot = await waitState((_s, g) => g.turnNumber > before.turnNumber);
    }
    const turnNumber = (snapshot.game as BlackjackStatePublic).turnNumber;
    alice.send({
      type: 'settings:update',
      settings: { ...settings, afterRollDelayMs: revealDelay },
    });
    snapshot = await waitState(
      (s, g) =>
        s.settings.afterRollDelayMs === revealDelay &&
        g.turnNumber === turnNumber &&
        !g.awaitingDecision &&
        !g.resolving,
    );
    const actor = identities.findIndex(
      (id) => id.playerId === (snapshot.game as BlackjackStatePublic).currentPlayerId,
    );
    return { roomId, scenario, snapshot, identities, actor, clients, observer, close, waitState };
  } catch (error) {
    close();
    throw error;
  }
}
