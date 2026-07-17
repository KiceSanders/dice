// Phase 3 smoke test over real websockets:
// create → join → seat request → approve → kick → host disconnect → host transfer.
// Usage: node scripts/smoke-rooms.mjs (server must be running on :3001)
import WebSocket from 'ws';

const url = process.env.WS_URL ?? 'ws://localhost:3001/ws';
let failures = 0;

function assert(cond, label) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok: ${label}`);
  }
}

/** Tiny test client: buffers messages, lets us await the next of a type. */
function client(name) {
  const ws = new WebSocket(url);
  const buffer = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else buffer.push(msg);
  });
  return {
    name,
    ws,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next(type, timeoutMs = 3000) {
      const i = buffer.findIndex((m) => m.type === type);
      if (i >= 0) return Promise.resolve(buffer.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error(`${name}: timed out waiting for ${type}`)),
          timeoutMs,
        );
        waiters.push({
          type,
          resolve: (m) => {
            clearTimeout(t);
            resolve(m);
          },
        });
      });
    },
    /** Wait for a room:state whose snapshot satisfies `predicate` (drains stale ones). */
    async stateWhere(predicate, label, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`${name}: timed out waiting for state: ${label}`);
        const msg = await this.next('room:state', remaining);
        if (predicate(msg.snapshot)) return msg;
      }
    },
    open: () => new Promise((r) => ws.once('open', r)),
    close: () => ws.close(),
  };
}

const settings = {
  chipsPerRound: 1,
  maxRolls: 3,
  afterRollDelayMs: 2000,
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
const bob = client('bob');

await Promise.all([host.open(), ann.open(), bob.open()]);

// 1. create
host.send({ type: 'room:create', playerName: 'Host', settings });
const created = await host.next('room:created');
assert(/^[2-9A-HJKMNP-Z]{6}$/.test(created.roomId), `room created: ${created.roomId}`);

// 2. join ×2
ann.send({ type: 'room:join', roomId: created.roomId, playerName: 'Ann' });
const annJoined = await ann.next('room:joined');
bob.send({ type: 'room:join', roomId: created.roomId, playerName: 'Bob' });
const bobJoined = await bob.next('room:joined');
assert(annJoined.snapshot.players.length >= 2, 'ann sees herself and host in snapshot');

// unknown room
const ghost = client('ghost');
await ghost.open();
ghost.send({ type: 'room:join', roomId: 'ZZZZZZ', playerName: 'Ghost' });
const notFound = await ghost.next('error');
assert(notFound.code === 'ROOM_NOT_FOUND', 'unknown room → ROOM_NOT_FOUND');
ghost.close();

// 3. seat requests: host auto-approves own, ann needs approval
host.send({ type: 'seat:request', buyIn: 100 });
ann.send({ type: 'seat:request', buyIn: 100 });
const seatReq = await host.next('seat:requested');
assert(seatReq.playerName === 'Ann', 'host notified of Ann’s seat request');

// 4. approve
host.send({ type: 'seat:approve', playerId: seatReq.playerId });
let state = await ann.stateWhere(
  (s) => s.players.find((p) => p.id === annJoined.playerId)?.seat !== null,
  'Ann seated',
);
const annPlayer = state.snapshot.players.find((p) => p.id === annJoined.playerId);
assert(annPlayer?.chips === 100, 'Ann seated with 100 chips');

// non-host cannot approve
bob.send({ type: 'seat:request', buyIn: 100 });
const bobReq = await host.next('seat:requested');
bob.send({ type: 'seat:approve', playerId: bobJoined.playerId });
const notHost = await bob.next('error');
assert(notHost.code === 'NOT_HOST', 'non-host approve → NOT_HOST');
host.send({ type: 'seat:approve', playerId: bobReq.playerId });
await bob.stateWhere(
  (s) => s.players.find((p) => p.id === bobJoined.playerId)?.seat !== null,
  'Bob seated',
);

// 5. kick Bob
host.send({ type: 'player:kick', playerId: bobJoined.playerId });
state = await bob.stateWhere(
  (s) => s.players.find((p) => p.id === bobJoined.playerId)?.banned === true,
  'Bob banned',
);
const bobPlayer = state.snapshot.players.find((p) => p.id === bobJoined.playerId);
assert(bobPlayer?.seat === null && bobPlayer?.banned === true, 'Bob kicked → banned spectator');
bob.send({ type: 'seat:request', buyIn: 100 });
const banned = await bob.next('error');
assert(banned.code === 'BANNED', 'kicked player cannot re-request a seat');

// 6. host disconnect → transfer to longest-seated connected player (Ann)
host.close();
state = await ann.stateWhere((s) => s.hostId === annJoined.playerId, 'host transferred to Ann');
assert(state.snapshot.hostId === annJoined.playerId, 'host transferred to Ann on disconnect');

if (failures > 0) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('room smoke test passed');
ann.close();
bob.close();
process.exit(0);
