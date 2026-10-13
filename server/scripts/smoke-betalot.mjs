// Bet-a-lot transport smoke: run against `npm run dev`.
import assert from 'node:assert/strict';
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
  maxBuyIn: 1000,
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
  alice.send({ type: 'seat:request', buyIn: 200 });
  await alice.next(
    (m) => m.type === 'room:state' && m.snapshot.players[0]?.seat !== null,
    'Alice seated',
  );
  bob.send({ type: 'seat:request', buyIn: 200 });
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
  for (const [index, opener] of [alice, bob, alice].entries()) {
    const opponent = opener === alice ? bob : alice;
    opener.send({ type: 'betalot:call', face: 3 });
    opener.send({ type: 'betalot:throwStart' });
    await opener.next((m) => m.type === 'betalot:throwStarted', 'opening throw started');
    opener.send({ type: 'betalot:throwResult', dice: [3] });
    await alice.next((m) => m.type === 'betalot:slotTicket', 'opening-call ticket earned');
    await opponent.next(
      (m) =>
        m.type === 'room:state' &&
        m.snapshot.game?.roundNumber === index + 1 &&
        m.snapshot.game.currentDiceCount === 2,
      'opponent ready',
    );
    opponent.send({ type: 'betalot:throwStart' });
    await opponent.next((m) => m.type === 'betalot:throwStarted', 'second throw started');
    opponent.send({ type: 'betalot:throwResult', dice: [1, 2] });
    await alice.next((m) => m.type === 'betalot:roundEnded', 'tie loses round');
    alice.send({ type: 'round:continue' });
    if (index < 2) {
      const next = await alice.next(
        (m) => m.type === 'room:state' && m.snapshot.game?.roundNumber === index + 2,
        'single tickets saved for later',
      );
      assert.equal(next.snapshot.game.slots.active, null);
      assert.equal(next.snapshot.game.slots.tickets.length, index + 1);
    }
  }
  const slotState = (phase) =>
    alice.next(
      (m) => m.type === 'room:state' && m.snapshot.game?.slots?.active?.round.phase === phase,
      `slot bonus ${phase}`,
    );
  const ready = (await slotState('ready')).snapshot;
  const playSlot = (bonus, action) =>
    alice.send({
      type: 'betalot:slotsAction',
      bonusId: bonus.id,
      revision: bonus.revision,
      action,
    });
  playSlot(ready.game.slots.active, 'spin');
  const choosing = (await slotState('choosing')).snapshot;
  playSlot(choosing.game.slots.active, 'collect');
  const paid = (await slotState('complete')).snapshot;
  const prize = paid.game.slots.active.round.payout;
  assert.equal(
    paid.players.reduce((sum, p) => sum + p.chips, paid.game.sevensPot),
    400,
  );
  for (const before of ready.players) {
    const after = paid.players.find((p) => p.id === before.id);
    assert.equal(after.chips, before.chips + (before.id === created.playerId ? prize : -prize));
  }
  console.log(`ok: two earned tickets redeemed, ${prize}-chip slot payout conserved chips`);
  playSlot(paid.game.slots.active, 'continue');
  await alice.next(
    (m) =>
      m.type === 'room:state' &&
      m.snapshot.game?.kind === 'betalot' &&
      m.snapshot.game.roundNumber === 4 &&
      m.snapshot.game.currentPlayerId === request.playerId,
    'fourth round started with alternating opener',
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
