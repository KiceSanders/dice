// Bet-a-lot transport smoke: run against `npm run dev`.
import WebSocket from 'ws';

const url = process.env.WS_URL ?? 'ws://localhost:3001/ws';

function client() {
  const ws = new WebSocket(url);
  const messages = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    const index = waiters.findIndex((waiter) => waiter(message));
    if (index >= 0) waiters.splice(index, 1)[0](message);
    else messages.push(message);
  });
  return {
    open: () => new Promise((resolve) => ws.once('open', resolve)),
    send: (message) => ws.send(JSON.stringify(message)),
    next: (predicate, label) => {
      const index = messages.findIndex(predicate);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), 4_000);
        waiters.push((message) => {
          if (!predicate(message)) return false;
          clearTimeout(timer);
          resolve(message);
          return true;
        });
      });
    },
    close: () => ws.close(),
  };
}

const settings = {
  kind: 'betalot',
  afterRollDelayMs: 0,
  minBuyIn: 10,
  maxBuyIn: 100,
  callPayout: 3,
  openingOnePenalty: 1,
  lossPayouts: { twoDice: 5, threeDice: 4, fourDice: 3, fiveDice: 2, sixDice: 1 },
  successfulRungSixPayout: 1,
  straightPayouts: { threeDice: 2, fourDice: 5, fiveDice: 10, sixDice: 20 },
  allSamePayouts: { twoDice: 1, threeDice: 3, fourDice: 4, fiveDice: 5, sixDice: 6 },
  allSameExtraPayouts: { threeDice: 5, fourDice: 20, fiveDice: 50, sixDice: 100 },
  fullHousePayout: 10,
  sevenOpponentPayout: 1,
  sevenPotContribution: 1,
  overTwentyFivePerPoint: 2,
};

const alice = client();
const bob = client();
try {
  await Promise.all([alice.open(), bob.open()]);
  alice.send({ type: 'room:create', playerName: 'Alice', settings });
  const created = await alice.next((m) => m.type === 'room:created', 'room created');
  bob.send({ type: 'room:join', roomId: created.roomId, playerName: 'Bob' });
  await bob.next((m) => m.type === 'room:joined', 'Bob joined');
  alice.send({ type: 'seat:request', buyIn: 20 });
  await alice.next(
    (m) => m.type === 'room:state' && m.snapshot.players[0]?.seat !== null,
    'Alice seated',
  );
  bob.send({ type: 'seat:request', buyIn: 20 });
  const request = await alice.next((m) => m.type === 'seat:requested', 'Bob seat request');
  alice.send({ type: 'seat:approve', playerId: request.playerId });
  await alice.next(
    (m) =>
      m.type === 'room:state' && m.snapshot.players.filter((p) => p.seat !== null).length === 2,
    'Bob seated',
  );
  alice.send({ type: 'game:start' });
  await alice.next(
    (m) => m.type === 'room:state' && m.snapshot.game?.kind === 'betalot',
    'game started',
  );
  alice.send({ type: 'betalot:call', face: 3 });
  alice.send({ type: 'betalot:throwStart' });
  await alice.next((m) => m.type === 'betalot:throwStarted', 'opening throw started');
  alice.send({ type: 'betalot:throwResult', dice: [3] });
  await bob.next((m) => m.type === 'betalot:rolled', 'opening roll settled');
  bob.send({ type: 'betalot:throwStart' });
  await bob.next((m) => m.type === 'betalot:throwStarted', 'second throw started');
  bob.send({ type: 'betalot:throwResult', dice: [1, 2] });
  await alice.next((m) => m.type === 'betalot:roundEnded', 'tie loses round');

  // The result modal's shared round:continue action must actually release the
  // room from roundEnd; this was the original two-roll freeze.
  alice.send({ type: 'round:continue' });
  await alice.next(
    (m) =>
      m.type === 'room:state' &&
      m.snapshot.game?.kind === 'betalot' &&
      m.snapshot.game.roundNumber === 2 &&
      m.snapshot.game.currentPlayerId === request.playerId,
    'second round started with alternating opener',
  );

  bob.send({ type: 'betalot:call', face: 2 });
  const ladder = [
    [bob, [2]],
    [alice, [2, 2]],
    [bob, [1, 2, 3]],
    [alice, [1, 1, 2, 3]],
    [bob, [1, 1, 2, 2, 3]],
    [alice, [1, 1, 2, 2, 3, 3]],
  ];
  for (let index = 0; index < ladder.length; index += 1) {
    const [roller, dice] = ladder[index];
    roller.send({ type: 'betalot:throwStart' });
    await roller.next(
      (m) => m.type === 'betalot:throwStarted' && m.rung === index + 1,
      `rung ${index + 1} started`,
    );
    roller.send({ type: 'betalot:throwResult', dice });
    await roller.next(
      (m) => m.type === 'betalot:rolled' && m.rung === index + 1,
      `rung ${index + 1} settled`,
    );
    if (index < ladder.length - 1) {
      await roller.next(
        (m) =>
          m.type === 'room:state' &&
          m.snapshot.game?.kind === 'betalot' &&
          m.snapshot.game.currentDiceCount === index + 2 &&
          !m.snapshot.game.resolving,
        `rung ${index + 2} became available`,
      );
    }
  }
  await alice.next(
    (m) => m.type === 'betalot:roundEnded' && m.winnerId === created.playerId,
    'successful rung six ended the round',
  );
  console.log('Bet-a-lot smoke test passed');
} finally {
  alice.close();
  bob.close();
}
