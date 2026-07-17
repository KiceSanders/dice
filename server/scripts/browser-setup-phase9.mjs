// Phase 9 browser-test setup: 3 players seated, game started.
// Usage: node server/scripts/browser-setup-phase9.mjs (server on :3001)
// Prints JSON with roomId + per-player localStorage payloads for browser tabs.
import WebSocket from 'ws';

const url = process.env.WS_URL ?? 'ws://localhost:3001/ws';

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
  const waitFor = (match, label, timeoutMs = 5000) => {
    const i = buffer.findIndex(match);
    if (i >= 0) return Promise.resolve(buffer.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${name}: timeout ${label}`)), timeoutMs);
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
    stateWhere: (pred, label, timeoutMs = 5000) =>
      waitFor((m) => m.type === 'room:state' && pred(m.snapshot), `state: ${label}`, timeoutMs),
    open: () => new Promise((r) => ws.once('open', r)),
  };
}

const settings = {
  chipsPerRound: 1,
  maxRolls: 3,
  afterRollDelayMs: 2000,
  minBuyIn: 10,
  maxBuyIn: 1000,
  straightPayout: { enabled: true, amountPerPlayer: 5 },
  classicPot: { enabled: true, donationAmount: 1 },
  yahtzeeBonus: { enabled: true, amountPerPlayer: 10 },
  firstRollYahtzeePayout: { enabled: true, amountPerPlayer: 10 },
};

const alice = client('Alice');
const bob = client('Bob');
const carol = client('Carol');
await Promise.all([alice.open(), bob.open(), carol.open()]);

alice.send({ type: 'room:create', playerName: 'Alice', settings });
const created = await alice.next('room:created');
const roomId = created.roomId;

bob.send({ type: 'room:join', roomId, playerName: 'Bob' });
carol.send({ type: 'room:join', roomId, playerName: 'Carol' });
const bobJoined = await bob.next('room:joined');
const carolJoined = await carol.next('room:joined');

alice.send({ type: 'seat:request', buyIn: 100 });
bob.send({ type: 'seat:request', buyIn: 100 });
carol.send({ type: 'seat:request', buyIn: 100 });
// Host auto-approves self; approve Bob + Carol as seat:requested arrives.
for (let approved = 0; approved < 2; approved++) {
  const req = await alice.next('seat:requested');
  alice.send({ type: 'seat:approve', playerId: req.playerId });
}
await alice.stateWhere((s) => s.players.filter((p) => p.seat !== null).length === 3, '3 seated');

alice.send({ type: 'game:start' });
await alice.stateWhere((s) => s.phase === 'playing', 'playing');

const storage = (name, joined) => ({
  name,
  localStorage: {
    'dice:name': name,
    [`dice:room:${roomId}`]: JSON.stringify({
      playerId: joined.playerId,
      rejoinToken: joined.rejoinToken,
      playerName: name,
    }),
  },
  url: `http://localhost:5173/room/${roomId}`,
});

console.log(
  JSON.stringify(
    {
      roomId,
      players: [
        storage('Alice', created),
        storage('Bob', bobJoined),
        storage('Carol', carolJoined),
      ],
    },
    null,
    2,
  ),
);
