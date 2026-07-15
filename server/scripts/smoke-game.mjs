// Phase 4 smoke test: host + 1 player play a full round over real websockets.
// Usage: node scripts/smoke-game.mjs (server must be running on :3001)
import WebSocket from 'ws';

const url = process.env.WS_URL ?? 'ws://localhost:3001';
let failures = 0;

function assert(cond, label) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok: ${label}`);
  }
}

function client(name) {
  const ws = new WebSocket(url);
  const buffer = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else buffer.push(msg);
  });
  const waitFor = (match, label, timeoutMs = 4000) => {
    const i = buffer.findIndex(match);
    if (i >= 0) return Promise.resolve(buffer.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`${name}: timeout waiting for ${label}`)),
        timeoutMs,
      );
      waiters.push({
        match,
        resolve: (m) => {
          clearTimeout(t);
          resolve(m);
        },
      });
    });
  };
  return {
    name,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next: (type) => waitFor((m) => m.type === type, type),
    nextWhere: (pred, label) => waitFor(pred, label),
    stateWhere: (pred, label, timeoutMs) =>
      waitFor((m) => m.type === 'room:state' && pred(m.snapshot), `state: ${label}`, timeoutMs),
    open: () => new Promise((r) => ws.once('open', r)),
    close: () => ws.close(),
  };
}

const settings = {
  chipsPerRound: 2,
  maxRolls: 3,
  maxPlayers: 3,
  minBuyIn: 10,
  maxBuyIn: 1000,
  straightPayout: {
    enabled: true,
    amountPerPlayer: 5,
  },
  classicPot: {
    enabled: true,
    donationAmount: 1,
  },
  yahtzeeBonus: {
    enabled: true,
    amountPerPlayer: 10,
  },
  firstRollYahtzeePayout: {
    enabled: true,
    amountPerPlayer: 10,
  },
};

const host = client('host');
const ann = client('ann');
await Promise.all([host.open(), ann.open()]);

// Setup: room, both seated.
host.send({ type: 'room:create', playerName: 'Host', settings });
const created = await host.next('room:created');
ann.send({ type: 'room:join', roomId: created.roomId, playerName: 'Ann' });
await ann.next('room:joined');

host.send({ type: 'seat:request', buyIn: 100 });
ann.send({ type: 'seat:request', buyIn: 100 });
const req = await host.next('seat:requested');
host.send({ type: 'seat:approve', playerId: req.playerId });
await ann.stateWhere((s) => s.players.filter((p) => p.seat !== null).length === 2, 'both seated');

// Non-host cannot start.
ann.send({ type: 'game:start' });
const notHost = await ann.next('error');
assert(notHost.code === 'NOT_HOST', 'non-host game:start → NOT_HOST');

// Start: antes collected, host's turn (seat 0).
host.send({ type: 'game:start' });
let state = await host.stateWhere(
  (s) => s.phase === 'playing' && s.game?.currentTurn !== null,
  'game started',
);
assert(state.snapshot.game.pot === 4, `pot holds both antes (${state.snapshot.game.pot})`);
assert(
  state.snapshot.players.every((p) => p.seat === null || p.chips === 98),
  'antes deducted from both players',
);
const turnOrder = [state.snapshot.game.currentTurn.playerId];

// Out-of-turn throw rejected.
const offTurn = turnOrder[0] === created.playerId ? ann : host;
offTurn.send({ type: 'turn:throwStart', keepIndices: [] });
const notTurn = await offTurn.next('error');
assert(notTurn.code === 'NOT_YOUR_TURN', 'out-of-turn throw → NOT_YOUR_TURN');

// One physics roll (ADR 004): throwStart locks keeps, throwResult reports the faces.
// Waits are scoped to myId — throwStarted/rolled are broadcast for every turn.
async function throwDice(me, myId, keepIndices, dice) {
  me.send({ type: 'turn:throwStart', keepIndices });
  await me.nextWhere(
    (m) => m.type === 'turn:throwStarted' && m.playerId === myId,
    `${me.name} throwStarted`,
  );
  me.send({ type: 'turn:throwResult', dice });
  return me.nextWhere(
    (m) => m.type === 'turn:rolled' && m.playerId === myId,
    `${me.name} turn:rolled`,
  );
}

// Both players: roll once, keep first two dice, reroll, stand (or auto-stand at cap).
// Faces are scripted (client-authoritative) — no straights, no wild 1s.
async function playTurn(me, myId, first, second) {
  const r1 = await throwDice(me, myId, [], first);
  assert(r1.dice.length === 5 && r1.rollNumber === 1, `${me.name} rolled 5 dice`);
  const r2 = await throwDice(me, myId, [0, 1], second);
  assert(
    r2.dice[0] === r1.dice[0] && r2.dice[1] === r1.dice[1],
    `${me.name} kept dice preserved on reroll`,
  );
  me.send({ type: 'turn:stand' });
}

const byId = (id) => (id === created.playerId ? host : ann);
// First player: pair of 2s in 2 rolls.
await playTurn(byId(turnOrder[0]), turnOrder[0], [2, 2, 3, 4, 6], [2, 2, 5, 4, 6]);
state = await host.stateWhere(
  (s) => s.game?.currentTurn != null && s.game.currentTurn.playerId !== turnOrder[0],
  'next turn',
);
const second = state.snapshot.game.currentTurn?.playerId;
assert(second && second !== turnOrder[0], 'turn advanced to the second player');
assert(state.snapshot.game.rollToBeat !== null, 'roll-to-beat recorded after first stand');
assert(
  state.snapshot.game.currentTurn.rollCap === 2,
  'roll-cap pressure: second player capped at 2',
);
// Second player: pair of 3s — beats the pair of 2s, no tie, auto-stands at the cap.
await playTurn(byId(second), second, [3, 3, 2, 4, 6], [3, 3, 6, 4, 2]);

// Round ends; pot awarded; chips conserved.
const ended = await host.next('round:ended');
assert(ended.potWon === 4, `winner takes the pot (${ended.potWon})`);
state = await host.stateWhere((s) => s.phase === 'roundEnd', 'roundEnd phase');
const totalChips =
  state.snapshot.players.reduce((sum, p) => sum + p.chips, 0) +
  (state.snapshot.game?.classicPot ?? 0);
assert(totalChips === 200, `chips conserved (${totalChips})`);

// Next round auto-starts after ~8s; leave scheduling/network headroom.
state = await host.stateWhere(
  (s) => s.phase === 'playing' && s.game?.roundNumber === 2,
  'round 2 auto-started',
  11000,
);
assert(state.snapshot.game.roundNumber === 2, 'round 2 started automatically');

// -- Round 2: Yahtzee bonus flow (docs/GAME_RULES.md "Yahtzee bonus") --------
state = await host.stateWhere(
  (s) => s.game?.roundNumber === 2 && s.game.currentTurn != null,
  'round 2 first turn',
);
const r2First = state.snapshot.game.currentTurn.playerId;
const r2Roller = byId(r2First);
const r2Other = r2Roller === host ? ann : host;

// Quint of 4s → bonus offered; standing is blocked until the bonus die resolves.
await throwDice(r2Roller, r2First, [], [4, 4, 4, 4, 4]);
const offered = await r2Roller.nextWhere(
  (m) => m.type === 'turn:bonusOffered' && m.playerId === r2First,
  'turn:bonusOffered',
);
assert(offered.face === 4, `bonus targets the quint face (${offered.face})`);
r2Roller.send({ type: 'turn:stand' });
// nextWhere (not next('error')): playTurn's post-cap stand leaves a stale
// harmless error buffered on whichever client auto-stood in round 1.
const standBlocked = await r2Roller.nextWhere(
  (m) => m.type === 'error' && m.code === 'STAND_NOT_ALLOWED',
  'stand while bonus pending → STAND_NOT_ALLOWED',
);
assert(standBlocked.code === 'STAND_NOT_ALLOWED', 'stand while bonus pending → STAND_NOT_ALLOWED');

// Single-die bonus throw: a literal match pays 10 from the other player.
r2Roller.send({ type: 'turn:bonusThrowStart' });
await r2Roller.nextWhere(
  (m) => m.type === 'turn:bonusThrowStarted' && m.playerId === r2First,
  'turn:bonusThrowStarted',
);
r2Roller.send({ type: 'turn:bonusThrowResult', die: 4 });
const bonusRolled = await r2Roller.nextWhere(
  (m) => m.type === 'turn:bonusRolled' && m.playerId === r2First,
  'turn:bonusRolled',
);
assert(bonusRolled.matched === true, 'bonus die matched the quint face');
const paid = await r2Other.next('yahtzee:paid');
assert(
  paid.playerId === r2First && paid.total === 10 && paid.payments.length === 1,
  `yahtzee bonus paid 10 to the roller (${paid.total})`,
);

// Bonus resolution auto-stands the roller; the other player is capped at 1.
state = await host.stateWhere(
  (s) => s.game?.currentTurn != null && s.game.currentTurn.playerId !== r2First,
  'round 2 second turn',
);
const r2Second = state.snapshot.game.currentTurn.playerId;
await throwDice(byId(r2Second), r2Second, [], [2, 3, 4, 2, 6]); // junk, auto-stands at cap 1
const ended2 = await host.next('round:ended');
assert(ended2.winnerId === r2First, 'quint wins round 2');
state = await host.stateWhere((s) => s.phase === 'roundEnd', 'round 2 end phase');
const totalChips2 =
  state.snapshot.players.reduce((sum, p) => sum + p.chips, 0) +
  (state.snapshot.game?.classicPot ?? 0);
assert(totalChips2 === 200, `chips conserved after the yahtzee bonus (${totalChips2})`);

if (failures > 0) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('game smoke test passed');
host.close();
ann.close();
process.exit(0);
