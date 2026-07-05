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
      const t = setTimeout(() => reject(new Error(`${name}: timeout waiting for ${label}`)), timeoutMs);
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
    bigMultiplier: 2,
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
await ann.stateWhere(
  (s) => s.players.filter((p) => p.seat !== null).length === 2,
  'both seated',
);

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
assert(state.snapshot.game.currentTurn.rollCap === 2, 'roll-cap pressure: second player capped at 2');
// Second player: pair of 3s — beats the pair of 2s, no tie, auto-stands at the cap.
await playTurn(byId(second), second, [3, 3, 2, 4, 6], [3, 3, 6, 4, 2]);

// Round ends; pot awarded; chips conserved.
const ended = await host.next('round:ended');
assert(ended.potWon === 4, `winner takes the pot (${ended.potWon})`);
state = await host.stateWhere((s) => s.phase === 'roundEnd', 'roundEnd phase');
const totalChips = state.snapshot.players.reduce((sum, p) => sum + p.chips, 0);
assert(totalChips === 200, `chips conserved (${totalChips})`);

// Next round auto-starts after ~5s.
state = await host.stateWhere(
  (s) => s.phase === 'playing' && s.game?.roundNumber === 2,
  'round 2 auto-started',
  8000,
);
assert(state.snapshot.game.roundNumber === 2, 'round 2 started automatically');

if (failures > 0) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('game smoke test passed');
host.close();
ann.close();
process.exit(0);
